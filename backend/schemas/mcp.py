"""MCP 服务器 DTO。

从 models/mcp.py 迁入（架构约定：ORM 表模型归 models/，响应 DTO 归 schemas/）。
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MCPServerResponse(BaseModel):
    """MCP 服务器响应 DTO

    包含 connection_status 字段供前端展示状态灯。
    """

    id: str
    name: str
    description: str | None
    sse_url: str
    transport: str
    is_active: bool
    icon: str | None
    connection_status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
