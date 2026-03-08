"""
工具列表 API

提供系统中可用的工具列表，用于前端展示工具使用指南。
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from agents.tool_policy import BUILTIN_TOOL_POLICIES, infer_mcp_tool_metadata
from database import get_session
from dependencies import get_current_user
from models import User
from models.mcp import MCPServer
from utils.logger import logger

router = APIRouter(prefix="/api/tools", tags=["tools"])


class ToolInfo(BaseModel):
    """工具信息"""

    name: str
    description: str
    category: str  # builtin, mcp
    risk_tier: str
    approval_required: bool
    policy_note: str | None = None


class ToolsListResponse(BaseModel):
    """工具列表响应"""

    tools: list[ToolInfo]
    total: int
    builtin_count: int
    mcp_count: int


@router.get("/available", response_model=ToolsListResponse)
async def get_available_tools(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    """
    获取所有可用工具列表

    返回基础工具（内置）和 MCP 工具的合并列表，
    用于前端展示工具使用指南。
    """
    tools: list[ToolInfo] = []

    # 1. 基础工具（硬编码，与 backend/tools/__init__.py 保持一致）
    builtin_tools = [
        ToolInfo(
            name="search_web",
            description="联网搜索，获取实时信息（新闻、股价、天气等）",
            category="builtin",
            risk_tier=BUILTIN_TOOL_POLICIES["search_web"].risk_tier.value,
            approval_required=BUILTIN_TOOL_POLICIES["search_web"].approval_required,
            policy_note=BUILTIN_TOOL_POLICIES["search_web"].policy_note,
        ),
        ToolInfo(
            name="read_webpage",
            description="读取网页内容，获取 URL 链接的详细内容",
            category="builtin",
            risk_tier=BUILTIN_TOOL_POLICIES["read_webpage"].risk_tier.value,
            approval_required=BUILTIN_TOOL_POLICIES["read_webpage"].approval_required,
            policy_note=BUILTIN_TOOL_POLICIES["read_webpage"].policy_note,
        ),
        ToolInfo(
            name="calculator",
            description="数学计算，确保复杂计算准确",
            category="builtin",
            risk_tier=BUILTIN_TOOL_POLICIES["calculator"].risk_tier.value,
            approval_required=BUILTIN_TOOL_POLICIES["calculator"].approval_required,
            policy_note=BUILTIN_TOOL_POLICIES["calculator"].policy_note,
        ),
        ToolInfo(
            name="get_current_time",
            description="获取当前时间，处理时间相关问题",
            category="builtin",
            risk_tier=BUILTIN_TOOL_POLICIES["get_current_time"].risk_tier.value,
            approval_required=BUILTIN_TOOL_POLICIES["get_current_time"].approval_required,
            policy_note=BUILTIN_TOOL_POLICIES["get_current_time"].policy_note,
        ),
    ]
    tools.extend(builtin_tools)

    # 2. MCP 工具（从数据库动态获取）
    try:
        mcp_servers = session.exec(select(MCPServer).where(MCPServer.is_active)).all()
        for server in mcp_servers:
            metadata = infer_mcp_tool_metadata(server.name, server.description)
            tools.append(
                ToolInfo(
                    name=server.name,
                    description=server.description or f"MCP 工具: {server.name}",
                    category="mcp",
                    risk_tier=metadata.risk_tier.value,
                    approval_required=metadata.approval_required,
                    policy_note=metadata.policy_note,
                )
            )
    except Exception as e:
        logger.warning(f"[Tools API] 获取 MCP 工具失败: {e}")

    return ToolsListResponse(
        tools=tools,
        total=len(tools),
        builtin_count=len(builtin_tools),
        mcp_count=len(tools) - len(builtin_tools),
    )
