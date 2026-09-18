"""MCP 服务器 DTO。

从 models/mcp.py 迁入（架构约定：ORM 表模型归 models/，DTO 归 schemas/）。
transport / connection_status 的取值空间在此用 Literal 声明——它们同时是
OpenAPI 契约的一部分（前端 mcp.ts 的同名联合类型与这里逐字对齐，
SameShape 锚点锁定）。
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic import Field as PydanticField

MCPTransport = Literal["sse", "streamable_http"]
MCPConnectionStatus = Literal["unknown", "connected", "error"]


class MCPServerCreate(BaseModel):
    """创建 MCP 服务器的 DTO

    添加新服务器时，后端会执行连接测试，
    只有连接成功才会入库。
    """

    name: str = PydanticField(..., min_length=1, max_length=100, description="显示名称")
    description: str | None = PydanticField(default=None, max_length=500, description="功能描述")
    sse_url: str = PydanticField(..., description="MCP 服务器连接地址")
    # 不带 | None：缺省即 sse（路由侧 or "sse" 同义），显式 null 会被 422 拒绝，
    # 契约保持「可选、非空」而不是「必填、可空」
    transport: MCPTransport = PydanticField(
        default="sse", description="传输协议：sse 或 streamable_http"
    )
    icon: str | None = PydanticField(default=None, description="图标")


class MCPServerUpdate(BaseModel):
    """更新 MCP 服务器的 DTO

    支持部分更新，所有字段均为可选。
    """

    name: str | None = PydanticField(default=None, min_length=1, max_length=100)
    description: str | None = PydanticField(default=None, max_length=500)
    sse_url: str | None = None
    transport: MCPTransport | None = None
    is_active: bool | None = None
    icon: str | None = None


class MCPServerResponse(BaseModel):
    """MCP 服务器响应 DTO

    包含 connection_status 字段供前端展示状态灯。
    """

    id: str
    name: str
    description: str | None
    sse_url: str
    transport: MCPTransport
    is_active: bool
    icon: str | None
    connection_status: MCPConnectionStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
