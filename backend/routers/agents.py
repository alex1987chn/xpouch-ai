"""
智能体路由模块 - 包含自定义智能体 CRUD

P1 优化: 添加分页支持
"""
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
from utils.logger import logger as app_logger
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select, func

from database import get_session
from dependencies import get_current_user
from models import User, CustomAgent, CustomAgentCreate, CustomAgentUpdate, Thread
from utils.exceptions import AppError, NotFoundError


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
    current_user: User = Depends(get_current_user)
):
    """
    创建自定义智能体
    
    用户创建的智能体用于简单的对话场景，直接使用自定义的 system_prompt
    调用 LLM，不经过 LangGraph 专家工作流。
    """
    custom_agent = CustomAgent(
        user_id=current_user.id,
        name=agent_data.name,
        description=agent_data.description,
        system_prompt=agent_data.system_prompt,
        category=agent_data.category,
        model_id=agent_data.model_id
    )
    session.add(custom_agent)
    session.commit()
    session.refresh(custom_agent)
    return custom_agent


@router.get("/agents", response_model=PaginatedAgentsResponse)
async def get_all_agents(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量")
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
        # P1 优化: 计算分页偏移
        offset = (page - 1) * page_size

        # 获取总数
        count_statement = select(func.count()).select_from(CustomAgent).where(
            CustomAgent.user_id == current_user.id,
            CustomAgent.is_default == False
        )
        total = session.exec(count_statement).one()

        # 获取分页数据（按创建时间降序，最新的在前）
        statement = (
            select(CustomAgent)
            .where(
                CustomAgent.user_id == current_user.id,
                CustomAgent.is_default == False
            )
            .order_by(CustomAgent.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )

        custom_agents = session.exec(statement).all()

        # 构建返回结果
        items = []
        for agent in custom_agents:
            items.append({
                "id": str(agent.id),
                "name": agent.name,
                "description": agent.description or "",
                "system_prompt": agent.system_prompt,
                "category": agent.category,
                "model_id": agent.model_id,
                "conversation_count": agent.conversation_count,
                "is_public": agent.is_public,
                "is_default": False,
                "created_at": agent.created_at.isoformat() if agent.created_at else None,
                "updated_at": agent.updated_at.isoformat() if agent.updated_at else None,
                "is_builtin": False
            })

        # P1 优化: 返回分页格式
        return PaginatedAgentsResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=(total + page_size - 1) // page_size
        )

    except Exception as e:
        logger.error(f"[Agents API] 获取智能体列表失败: {e}", exc_info=True)
        raise AppError(message=str(e), original_error=e)


@router.get("/agents/{agent_id}")
async def get_custom_agent(
    agent_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取单个自定义智能体详情"""
    agent = session.get(CustomAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise NotFoundError(resource="智能体")
    return agent


@router.delete("/agents/{agent_id}")
async def delete_custom_agent(
    agent_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    删除自定义智能体

    注意：
    - 禁止删除默认助手（is_default=True）
    - 只能删除用户自己的智能体
    - 级联删除关联的所有会话记录
    """
    agent = session.get(CustomAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise NotFoundError(resource="智能体")

    # 禁止删除默认助手
    if agent.is_default:
        raise AppError(message="禁止删除默认助手")

    # 👈 级联删除关联的 Thread 记录（防止历史记录出现孤儿会话）
    statement = select(Thread).where(
        Thread.agent_id == agent_id,
        Thread.agent_type == "custom",
        Thread.user_id == current_user.id
    )
    related_threads = session.exec(statement).all()

    # 先删除关联的 Thread（会自动级联删除 messages 和 task_session）
    for thread in related_threads:
        app_logger.info(f"[DELETE] 删除智能体 {agent_id} 的关联会话: {thread.id}")
        session.delete(thread)

    # 删除智能体
    session.delete(agent)
    session.commit()

    app_logger.info(f"[DELETE] 已删除智能体 {agent_id} 及其 {len(related_threads)} 个关联会话")
    return {"ok": True, "deleted_threads_count": len(related_threads)}


@router.put("/agents/{agent_id}")
async def update_custom_agent(
    agent_id: str,
    agent_data: CustomAgentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """更新自定义智能体"""
    agent = session.get(CustomAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise NotFoundError(resource="智能体")
    
    if agent_data.name is not None:
        agent.name = agent_data.name
    if agent_data.description is not None:
        agent.description = agent_data.description
    if agent_data.system_prompt is not None:
        agent.system_prompt = agent_data.system_prompt
    if agent_data.category is not None:
        agent.category = agent_data.category
    if agent_data.model_id is not None:
        agent.model_id = agent_data.model_id
    
    agent.updated_at = datetime.now()
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent
