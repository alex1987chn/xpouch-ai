"""
通用查询辅助函数（B-11）。

目标：
- 收敛 Router 中重复的数据库查询和存在性校验逻辑
- 统一 NotFound 错误语义
"""

from __future__ import annotations

from sqlmodel import Session

from models.mcp import MCPServer
from utils.exceptions import NotFoundError


def get_mcp_server_or_404(session: Session, server_id: str) -> MCPServer:
    """获取 MCPServer，不存在则抛 NotFoundError。"""
    server = session.get(MCPServer, server_id)
    if not server:
        raise NotFoundError(resource="MCP 服务器")
    return server
