"""
MCP 服务器管理路由 - 配电盘式注册中心

提供 MCP 服务器的 CRUD 和连接测试功能。
所有接口需要登录权限。

P0 修复: 2025-02-24
- 添加 URL 验证和 SSRF 防护
- 添加连接超时控制
- 使用直接实例化 (langchain-mcp-adapters 0.2.1 不支持 async with)
"""

import asyncio
import ipaddress
import re
import socket
from datetime import datetime
from typing import List
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, status
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

def is_private_url(url: str) -> tuple[bool, str]:
    """
    检查 URL 是否指向内网地址 (SSRF 防护增强版)
    
    使用 ipaddress 模块严格检查 IP 地址，并支持域名解析后检查。
    
    Returns:
        tuple[bool, str]: (是否为内网/危险地址, 错误信息)
    """
    try:
        parsed = urlparse(url)
        if not parsed.hostname:
            return True, "无效的 URL: 无法解析主机名"
        
        hostname = parsed.hostname.lower()
        
        # 1. 检查是否是纯 IP 地址
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_multicast:
                return True, f"禁止连接内网/保留地址: {hostname} (SSRF 防护)"
            if ip.is_link_local:
                return True, f"禁止连接链路本地地址: {hostname} (SSRF 防护)"
            return False, ""
        except ValueError:
            # 不是 IP 地址，是域名，继续检查
            pass
        
        # 2. 检查常见内网域名/别名
        private_hostnames = {
            'localhost', 'localhost.localdomain',
            'ip6-localhost', 'ip6-loopback',
            '0.0.0.0', '::', '::1',
        }
        if hostname in private_hostnames:
            return True, f"禁止连接内网域名: {hostname} (SSRF 防护)"
        
        # 检查 localhost 的子域名 (如 localhost.example.com 不是 localhost，但 localhost. 是)
        if hostname == 'localhost' or hostname.startswith('localhost.'):
            return True, f"禁止连接 localhost 域名: {hostname} (SSRF 防护)"
        
        # 3. 尝试解析域名并检查解析后的 IP
        try:
            # 获取所有解析的 IP 地址 (IPv4 和 IPv6)
            addr_info = socket.getaddrinfo(hostname, None)
            resolved_ips = set()
            for info in addr_info:
                ip_str = info[4][0]
                try:
                    ip = ipaddress.ip_address(ip_str)
                    resolved_ips.add(ip)
                except ValueError:
                    continue
            
            # 检查所有解析的 IP
            for ip in resolved_ips:
                if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_multicast:
                    return True, f"禁止连接解析到内网地址的域名: {hostname} -> {ip} (SSRF 防护)"
                if ip.is_link_local:
                    return True, f"禁止连接解析到链路本地地址的域名: {hostname} -> {ip} (SSRF 防护)"
        except (socket.gaierror, OSError):
            # DNS 解析失败，不视为内网，但记录警告
            # 实际场景中可能需要根据安全策略决定是否允许
            pass
        
        return False, ""
        
    except Exception as e:
        # URL 解析失败，视为不安全
        return True, f"URL 安全检查失败: {str(e)}"


def validate_mcp_url(url: str) -> tuple[bool, str]:
    """
    验证 MCP URL 的安全性
    
    P0 修复: 防止 SSRF 攻击 (增强版)
    
    Returns:
        tuple[bool, str]: (是否有效, 错误信息)
    """
    # 1. 检查 URL 格式
    if not url.startswith(("http://", "https://")):
        return False, "SSE URL 必须以 http:// 或 https:// 开头"
    
    # 2. 禁止 file:// 协议和其他危险协议
    dangerous_protocols = ('file://', 'ftp://', 'sftp://', 'dict://', 'gopher://', 
                          'ldap://', 'ldaps://', 'tftp://', 'ssh://')
    if url.lower().startswith(dangerous_protocols):
        return False, f"禁止使用的协议 (SSRF 防护)"
    
    # 3. 检查 URL 格式是否有效
    try:
        parsed = urlparse(url)
        if not parsed.hostname:
            return False, "无效的 URL 格式: 缺少主机名"
        if parsed.port and (parsed.port < 1 or parsed.port > 65535):
            return False, "无效的端口号"
        # 禁止用户名密码在 URL 中 (防止凭证泄露和某些攻击)
        if parsed.username or parsed.password:
            return False, "URL 中不允许包含认证信息"
    except Exception as e:
        return False, f"URL 解析失败: {str(e)}"
    
    # 4. SSRF 防护：使用严格的内网地址检查
    is_private, error_msg = is_private_url(url)
    if is_private:
        return False, error_msg
    
    return True, ""


# ============================================================================
# 辅助函数
# ============================================================================

async def test_mcp_connection(
    sse_url: str, 
    transport: str = "sse",
    timeout: int = 10
) -> tuple[bool, str]:
    """
    测试 MCP 服务器连接
    
    P0 修复:
    - 添加超时控制
    - 添加 URL 验证 (SSRF 防护)
    - 使用直接实例化 (0.2.1 不支持 async with)
    - 支持多种传输协议 (sse, streamable_http)
    
    Args:
        sse_url: 服务器连接地址
        transport: 传输协议 (sse 或 streamable_http)
        timeout: 连接超时时间（秒）
        
    Returns:
        tuple[bool, str]: (是否成功, 错误信息)
    """
    # P0 修复: URL 验证
    is_valid, error_msg = validate_mcp_url(sse_url)
    if not is_valid:
        return False, error_msg
    
    try:
        # 支持多种传输协议
        # 注意: langchain-mcp-adapters 0.2.1 不支持 async with
        # get_tools() 内部会自动管理会话
        async with asyncio.timeout(timeout):
            client = MultiServerMCPClient(
                {
                    "test_server": {
                        "url": sse_url,
                        "transport": transport,  # 使用指定的传输协议
                    }
                }
            )
            # 尝试获取工具列表验证连接
            await client.get_tools()
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
    
    1. 执行连接测试 (带超时和 URL 验证)
    2. 连接成功：connection_status="connected" 并入库
    3. 连接失败：抛出 HTTP 400 错误
    """
    # 获取传输协议，默认为 sse
    transport = server_data.transport or "sse"
    
    # P0 修复: 通电测试（带 URL 验证和超时）
    is_connected, error_msg = await test_mcp_connection(
        server_data.sse_url, 
        transport=transport
    )
    
    if not is_connected:
        raise ValidationError(
            message=f"MCP 服务器连接测试失败: {error_msg}",
            details={"sse_url": server_data.sse_url, "transport": transport, "error": error_msg}
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
        transport=transport,  # 保存传输协议
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
        
        # P0 修复: 重新通电测试（带超时）
        is_connected, error_msg = await test_mcp_connection(update_data.sse_url, transport=server.transport)
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
        # P0 修复: 使用超时控制
        # 注意: 0.2.1 版本不支持 async with，使用直接实例化
        # 支持多种传输协议
        transport = getattr(server, 'transport', None) or "sse"
        async with asyncio.timeout(10):  # 10秒超时
            client = MultiServerMCPClient(
                {
                    server.name: {
                        "url": str(server.sse_url),
                        "transport": transport,
                    }
                }
            )
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
