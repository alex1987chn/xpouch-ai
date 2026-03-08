"""
智能体路由模块 - 包含自定义智能体 CRUD

P1 优化: 添加分页支持
"""

import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session

from database import get_session
from dependencies import get_current_user
from models import CustomAgentCreate, CustomAgentUpdate, User
from services.agent_service import AgentService
from utils.exceptions import AppError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["agents"])


# P1 优化: 分页响应模型
class PaginatedAgentsResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    pages: int


@router.post("/agents")
async def create_custom_agent(
    agent_data: CustomAgentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    创建自定义智能体

    用户创建的智能体用于简单的对话场景，直接使用自定义的 system_prompt
    调用 LLM，不经过 LangGraph 专家工作流。
    """
    return AgentService(session).create_custom_agent(current_user.id, agent_data)


@router.get("/agents", response_model=PaginatedAgentsResponse)
async def get_all_agents(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """
    获取当前用户的所有自定义智能体（支持分页）

    P1 优化:
    - 添加分页支持
    - 默认每页 20 条，最大 100 条

    返回列表：
    - 用户自定义智能体（按创建时间降序，最新的在前）

    注意：
    - 系统专家（search, coder, researcher等）不返回，虚拟专家不暴露到前端
    - 默认助手（简单模式）由前端硬编码，不在此接口返回
    """
    try:
        result = AgentService(session).list_custom_agents(current_user.id, page, page_size)
        return PaginatedAgentsResponse(**result)

    except Exception as e:
        logger.error(f"[Agents API] 获取智能体列表失败: {e}", exc_info=True)
        raise AppError(message=str(e), original_error=e) from e


@router.get("/agents/{agent_id}")
async def get_custom_agent(
    agent_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """获取单个自定义智能体详情"""
    return AgentService(session).get_custom_agent(agent_id, current_user.id)


@router.delete("/agents/{agent_id}")
async def delete_custom_agent(
    agent_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    删除自定义智能体

    注意：
    - 禁止删除默认助手（is_default=True）
    - 只能删除用户自己的智能体
    - 级联删除关联的所有会话记录
    """
    return await AgentService(session).delete_custom_agent(agent_id, current_user.id)


@router.put("/agents/{agent_id}")
async def update_custom_agent(
    agent_id: str,
    agent_data: CustomAgentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """更新自定义智能体"""
    return AgentService(session).update_custom_agent(agent_id, current_user.id, agent_data)
