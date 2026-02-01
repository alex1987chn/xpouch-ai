"""
智能体路由模块 - 包含自定义智能体 CRUD
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from dependencies import get_current_user
from models import User, CustomAgent, CustomAgentCreate, CustomAgentUpdate
from utils.exceptions import AppError, NotFoundError


router = APIRouter(prefix="/api", tags=["agents"])


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


@router.get("/agents")
async def get_all_agents(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    获取当前用户的所有自定义智能体

    返回列表：
    - 用户自定义智能体（按创建时间降序，最新的在前）

    注意：
    - 系统专家（search, coder, researcher等）不返回，虚拟专家不暴露到前端
    - 默认助手（简单模式）由前端硬编码，不在此接口返回
    """
    try:
        # 获取用户自定义智能体（按创建时间降序，最新的在前）
        statement = select(CustomAgent).where(
            CustomAgent.user_id == current_user.id,
            CustomAgent.is_default == False
        ).order_by(CustomAgent.created_at.desc())

        custom_agents = session.exec(statement).all()

        # 构建返回结果
        result = []

        for agent in custom_agents:
            result.append({
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

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
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
    """
    agent = session.get(CustomAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise NotFoundError(resource="智能体")

    # 禁止删除默认助手
    if agent.is_default:
        raise AppError(message="禁止删除默认助手")

    session.delete(agent)
    session.commit()
    return {"ok": True}


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
