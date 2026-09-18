"""
MCP 服务器模型 - 管理外部 MCP 服务器配置

用途：
- 存储用户添加的 MCP 服务器（如高德地图、文件系统、通义万相等）
- 支持多种传输协议：SSE、Streamable HTTP
- 提供连接状态追踪

DTO（MCPServerCreate/Update/Response）在 schemas/mcp.py，取值空间
（transport / connection_status 的 Literal）也在那里声明。
"""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

# ============================================================================
# 数据库模型 (SQLModel)
# ============================================================================


class MCPServer(SQLModel, table=True):
    """
    MCP 服务器配置表

    存储外部 MCP 服务器的连接信息，支持用户动态添加/删除。
    支持多种传输协议：sse、streamable_http
    通过 is_active 字段控制是否启用该服务器。
    """

    __tablename__ = "mcp_servers"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), primary_key=True, description="唯一标识符"
    )
    name: str = Field(index=True, description="显示名称（如'高德地图'、'文件系统'）")
    description: str | None = Field(default=None, description="功能描述")
    sse_url: str = Field(
        unique=True, description="MCP 服务器连接地址（如 https://mcp.amap.com/sse）"
    )
    # 取值空间（Literal["sse","streamable_http"]）声明在 schemas/mcp.py；
    # 表列保持 str 以免 SQLModel 把 Literal 映射成 ENUM 触发迁移
    transport: str = Field(
        default="sse", description="传输协议：sse (Server-Sent Events) 或 streamable_http"
    )
    is_active: bool = Field(
        default=True, index=True, description="是否启用（前端硬核 Toggle 开关）"
    )
    icon: str | None = Field(default=None, description="图标 URL 或图标名称")
    connection_status: str = Field(
        default="unknown", description="连接状态：unknown/connected/error"
    )

    # 审计字段
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")
    updated_at: datetime = Field(default_factory=datetime.now, description="最后更新时间")


# ============================================================================
# 导出
# ============================================================================

__all__ = [
    "MCPServer",
]
