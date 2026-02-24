"""
MCP 服务器模型 - 管理外部 MCP SSE 服务器配置

用途：
- 存储用户添加的 MCP 服务器（如高德地图、文件系统等）
- 支持配电盘式 UI 管理
- 提供连接状态追踪
"""

from sqlmodel import SQLModel, Field
from pydantic import BaseModel, Field as PydanticField
from datetime import datetime
from typing import Optional
import uuid


# ============================================================================
# 数据库模型 (SQLModel)
# ============================================================================

class MCPServer(SQLModel, table=True):
    """
    MCP 服务器配置表
    
    存储外部 MCP SSE 服务器的连接信息，支持用户动态添加/删除。
    通过 is_active 字段控制是否启用该服务器。
    """
    __tablename__ = "mcp_servers"

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        description="唯一标识符"
    )
    name: str = Field(
        index=True,
        description="显示名称（如'高德地图'、'文件系统'）"
    )
    description: Optional[str] = Field(
        default=None,
        description="功能描述"
    )
    sse_url: str = Field(
        unique=True,
        description="SSE 连接地址（如 https://mcp.amap.com/sse）"
    )
    is_active: bool = Field(
        default=True,
        description="是否启用（前端硬核 Toggle 开关）"
    )
    icon: Optional[str] = Field(
        default=None,
        description="图标 URL 或图标名称"
    )
    connection_status: str = Field(
        default="unknown",
        description="连接状态：unknown/connected/error"
    )
    
    # 审计字段
    created_at: datetime = Field(
        default_factory=datetime.now,
        description="创建时间"
    )
    updated_at: datetime = Field(
        default_factory=datetime.now,
        description="最后更新时间"
    )


# ============================================================================
# Pydantic DTO (数据传输对象)
# ============================================================================

class MCPServerCreate(BaseModel):
    """创建 MCP 服务器的 DTO
    
    添加新服务器时，后端会执行 SSE 通电测试，
    只有连接成功才会入库。
    """
    name: str = PydanticField(
        ...,
        min_length=1,
        max_length=100,
        description="显示名称"
    )
    description: Optional[str] = PydanticField(
        default=None,
        max_length=500,
        description="功能描述"
    )
    sse_url: str = PydanticField(
        ...,
        description="SSE 连接地址"
    )
    icon: Optional[str] = PydanticField(
        default=None,
        description="图标"
    )


class MCPServerUpdate(BaseModel):
    """更新 MCP 服务器的 DTO
    
    支持部分更新，所有字段均为可选。
    """
    name: Optional[str] = PydanticField(
        default=None,
        min_length=1,
        max_length=100
    )
    description: Optional[str] = PydanticField(
        default=None,
        max_length=500
    )
    sse_url: Optional[str] = None
    is_active: Optional[bool] = None
    icon: Optional[str] = None


class MCPServerResponse(BaseModel):
    """MCP 服务器响应 DTO
    
    包含 connection_status 字段供前端展示状态灯。
    """
    id: str
    name: str
    description: Optional[str]
    sse_url: str
    is_active: bool
    icon: Optional[str]
    connection_status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# 导出
# ============================================================================

__all__ = [
    "MCPServer",
    "MCPServerCreate",
    "MCPServerUpdate",
    "MCPServerResponse",
]
