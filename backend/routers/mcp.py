"""
MCP 服务器管理路由 - 配电盘式注册中心

提供 MCP 服务器的 CRUD 和连接测试功能。
所有接口需要登录权限。

P0 修复: 2025-02-24
- 修复 MCP 连接泄漏 (使用 async with 确保关闭)
- 添加 URL 验证和 SSRF 防护
- 添加连接超时控制
"""

import asyncio
import re
from contextlib import AsyncExitStack
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, status
from pydantic import validator
from sqlmodel import Session, select

from database import get_session
from dependencies import get_current_user
from models import User
from models.mcp import MCPServer, MCPServerCreate, MCPServerUpdate, MCPServerResponse
from utils.exceptions import ValidationError, NotFoundError

# 🔥 MCP 连接测试
from langchain_mcp_adapters.client import MultiServerMCPClient


router = APIRouter(prefix="/api/mcp", tags=["mcp"])


# ============================================================================
# URL 验证和 SSRF 防护 (P0 修复)
# ============================================================================

# 内网地址模式 (用于 SSRF 防护)
PRIVATE_IP_PATTERNS = [
    r"^http://127\.",
    r"^http://10\.",
    r"^http://172\.(1[6-9]|2[0-9]|3[01])\.",
    r"^http://192\.168\.",
    r"^http://localhost",
    r"^https://127\.",
    r"^https://10\.",
    r"^https://172\.(1[6-9]|2[0-9]|3[01])\.",
    r"^https://192\.168\.",
    r"^https://localhost",
]


def validate_mcp_url(url: str) -> tuple[bool, str]:
    """
    验证 MCP URL 的安全性
    
    P0 修复: 防止 SSRF 攻击
    
    Returns:
        tuple[bool, str]: (是否有效, 错误信息)
    """
    # 1. 检查 URL 格式
    if not url.startswith(("http://", "https://")):
        return False, "SSE URL 必须以 http:// 或 https:// 开头"
    
    # 2. 禁止 file:// 协议
    if url.startswith("file://"):
        return False, "禁止 file 协议"
    
    # 3. SSRF 防护：禁止内网地址
    for pattern in PRIVATE_IP_PATTERNS:
        if re.match(pattern, url, re.IGNORECASE):
            return False, "禁止连接内网地址 (SSRF 防护)"
    
    # 4. 检查 URL 格式是否有效
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if not parsed.hostname:
            return False, "无效的 URL 格式"
        if parsed.port and (parsed.port < 1 or parsed.port > 65535):
            return False, "无效的端口号"
    except Exception as e:
        return False, f"URL 解析失败: {str(e)}"
    
    return True, ""


# ============================================================================
# 辅助函数
# ============================================================================

async def test_mcp_connection(sse_url: str, timeout: int = 10) -> tuple[bool, str]:
    """
    测试 MCP SSE 服务器连接
    
    P0 修复:
    - 使用 async with 确保连接关闭 (防止连接泄漏)
    - 添加超时控制
    - 添加 URL 验证 (SSRF 防护)
    
    Args:
        sse_url: SSE 连接地址
        timeout: 连接超时时间（秒）
        
    Returns:
        tuple[bool, str]: (是否成功, 错误信息)
    """
    # P0 修复: URL 验证
    is_valid, error_msg = validate_mcp_url(sse_url)
    if not is_valid:
        return False, error_msg
    
    try:
        # P0 修复: 使用 async with 确保连接关闭
        async with asyncio.timeout(timeout):
            async with MultiServerMCPClient(
                {
                    "test_server": {
                        "url": sse_url,
                        "transport": "sse",
                    }
                }
            ) as client:
                # 尝试获取工具列表验证连接
                await client.get_tools()
                # 连接成功，自动关闭
                return True, ""
                
    except asyncio.TimeoutError:
        return False, f"连接超时 ({timeout}秒)"
    except Exception as e:
        # 连接失败
        return False, str(e)


# ============================================================================
# API Endpoints
# ============================================================================

@router.post(
    "/servers",
    response_model=MCPServerResponse,
    status_code=status.HTTP_201_CREATED
)
async def create_mcp_server(
    server_data: MCPServerCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    添加 MCP 服务器
    
    1. 执行 SSE 通电测试 (带超时和 URL 验证)
    2. 连接成功：connection_status="connected" 并入库
    3. 连接失败：抛出 HTTP 400 错误
    """
    # P0 修复: 通电测试（带 URL 验证和超时）
    is_connected, error_msg = await test_mcp_connection(server_data.sse_url)
    
    if not is_connected:
        raise ValidationError(
            message=f"MCP 服务器连接测试失败: {error_msg}",
            details={"sse_url": server_data.sse_url, "error": error_msg}
        )
    
    # 检查 URL 是否已存在（虽然数据库有 unique 约束，但提前检查可以给更好的错误提示）
    existing = session.exec(
        select(MCPServer).where(MCPServer.sse_url == server_data.sse_url)
    ).first()
    
    if existing:
        raise ValidationError(
            message="该 MCP 服务器已存在",
            details={"sse_url": server_data.sse_url}
        )
    
    # 创建新服务器
    mcp_server = MCPServer(
        name=server_data.name,
        description=server_data.description,
        sse_url=server_data.sse_url,
        icon=server_data.icon,
        connection_status="connected",  # 测试通过
        is_active=True,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    
    session.add(mcp_server)
    session.commit()
    session.refresh(mcp_server)
    
    return mcp_server


@router.get(
    "/servers",
    response_model=List[MCPServerResponse]
)
async def list_mcp_servers(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    获取 MCP 服务器列表
    
    按创建时间倒序返回，最新的在前。
    包含 connection_status 供前端展示状态灯。
    """
    statement = select(MCPServer).order_by(MCPServer.created_at.desc())
    servers = session.exec(statement).all()
    
    return servers


@router.patch(
    "/servers/{server_id}",
    response_model=MCPServerResponse
)
async def update_mcp_server(
    server_id: str,
    update_data: MCPServerUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    更新 MCP 服务器
    
    支持部分更新，包括切换 is_active 状态。
    如果更新 sse_url，会重新进行连接测试。
    """
    # 查找服务器
    server = session.get(MCPServer, server_id)
    if not server:
        raise NotFoundError(resource="MCP 服务器")
    
    # 如果更新 SSE URL，需要重新测试连接
    if update_data.sse_url and update_data.sse_url != server.sse_url:
        # P0 修复: URL 验证
        is_valid, error_msg = validate_mcp_url(update_data.sse_url)
        if not is_valid:
            raise ValidationError(
                message=f"URL 验证失败: {error_msg}",
                details={"sse_url": update_data.sse_url}
            )
        
        # 检查新 URL 是否已被其他服务器使用
        existing = session.exec(
            select(MCPServer).where(
                MCPServer.sse_url == update_data.sse_url,
                MCPServer.id != server_id
            )
        ).first()
        
        if existing:
            raise ValidationError(
                message="该 SSE URL 已被其他服务器使用",
                details={"sse_url": update_data.sse_url}
            )
        
        # P0 修复: 重新通电测试（带超时和连接关闭）
        is_connected, error_msg = await test_mcp_connection(update_data.sse_url)
        if not is_connected:
            raise ValidationError(
                message=f"新地址连接测试失败: {error_msg}",
                details={"sse_url": update_data.sse_url, "error": error_msg}
            )
        
        server.sse_url = update_data.sse_url
        server.connection_status = "connected"
    
    # 更新其他字段
    if update_data.name is not None:
        server.name = update_data.name
    if update_data.description is not None:
        server.description = update_data.description
    if update_data.is_active is not None:
        server.is_active = update_data.is_active
    if update_data.icon is not None:
        server.icon = update_data.icon
    
    server.updated_at = datetime.now()
    
    session.add(server)
    session.commit()
    session.refresh(server)
    
    return server


@router.delete(
    "/servers/{server_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
async def delete_mcp_server(
    server_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    删除 MCP 服务器
    
    物理删除该配置。
    """
    server = session.get(MCPServer, server_id)
    if not server:
        raise NotFoundError(resource="MCP 服务器")
    
    session.delete(server)
    session.commit()
    
    return None


@router.get(
    "/servers/{server_id}/tools",
    response_model=List[dict]
)
async def get_mcp_server_tools(
    server_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    获取 MCP 服务器的工具列表
    
    实时连接 MCP 服务器并获取可用工具列表。
    P0 修复: 使用 async with 确保连接关闭
    """
    server = session.get(MCPServer, server_id)
    if not server:
        raise NotFoundError(resource="MCP 服务器")
    
    if not server.is_active:
        raise ValidationError("MCP 服务器未启用")
    
    # P0 修复: URL 验证
    is_valid, error_msg = validate_mcp_url(str(server.sse_url))
    if not is_valid:
        raise ValidationError(f"URL 验证失败: {error_msg}")
    
    try:
        # P0 修复: 使用 async with 确保连接关闭
        async with asyncio.timeout(10):  # 10秒超时
            async with MultiServerMCPClient(
                {
                    server.name: {
                        "url": str(server.sse_url),
                        "transport": "sse",
                    }
                }
            ) as client:
                tools = await client.get_tools()
                
                # 提取工具信息
                tools_info = []
                for tool in tools:
                    tools_info.append({
                        "name": getattr(tool, 'name', str(tool)),
                        "description": getattr(tool, 'description', 'No description') if hasattr(tool, 'description') else 'No description'
                    })
                
                return tools_info
        
    except asyncio.TimeoutError:
        raise ValidationError("获取工具列表超时 (10秒)")
    except Exception as e:
        raise ValidationError(f"获取工具列表失败: {str(e)}")
