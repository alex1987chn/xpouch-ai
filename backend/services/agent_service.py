"""
自定义智能体业务服务（B-10）。

将 Router 层中的业务逻辑下沉到 Service，保持路由职责单一：
- Router: 参数校验 + 鉴权 + 返回响应
- Service: 查询、聚合、删除级联等业务流程
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, func, select

from crud.query_helpers import get_owned_custom_agent_or_404
from models import CustomAgent, CustomAgentCreate, CustomAgentUpdate, Thread
from utils.logger import logger as app_logger


class AgentService:
    """自定义智能体服务。"""

    def __init__(self, session: Session):
        self.session = session

    def create_custom_agent(self, user_id: str, agent_data: CustomAgentCreate) -> CustomAgent:
        custom_agent = CustomAgent(
            user_id=user_id,
            name=agent_data.name,
            description=agent_data.description,
            system_prompt=agent_data.system_prompt,
            category=agent_data.category,
            model_id=agent_data.model_id,
        )
        self.session.add(custom_agent)
        self.session.commit()
        self.session.refresh(custom_agent)
        return custom_agent

    def list_custom_agents(self, user_id: str, page: int, page_size: int) -> dict:
        offset = (page - 1) * page_size

        total = self.session.exec(
            select(func.count())
            .select_from(CustomAgent)
            .where(CustomAgent.user_id == user_id, CustomAgent.is_default.is_(False))
        ).one()

        custom_agents = self.session.exec(
            select(CustomAgent)
            .where(CustomAgent.user_id == user_id, CustomAgent.is_default.is_(False))
            .order_by(CustomAgent.created_at.desc())
            .offset(offset)
            .limit(page_size)
        ).all()

        items = [
            {
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
                "is_builtin": False,
            }
            for agent in custom_agents
        ]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        }

    def get_custom_agent(self, agent_id: str, user_id: str) -> CustomAgent:
        return get_owned_custom_agent_or_404(self.session, agent_id, user_id)

    def update_custom_agent(
        self, agent_id: str, user_id: str, agent_data: CustomAgentUpdate
    ) -> CustomAgent:
        agent = get_owned_custom_agent_or_404(self.session, agent_id, user_id)

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
        self.session.add(agent)
        self.session.commit()
        self.session.refresh(agent)
        return agent

    def delete_custom_agent(self, agent_id: str, user_id: str) -> dict:
        agent = get_owned_custom_agent_or_404(self.session, agent_id, user_id)

        if agent.is_default:
            from utils.exceptions import AppError

            raise AppError(message="禁止删除默认助手")

        related_threads = self.session.exec(
            select(Thread).where(
                Thread.agent_id == agent_id,
                Thread.agent_type == "custom",
                Thread.user_id == user_id,
            )
        ).all()

        for thread in related_threads:
            app_logger.info("[DELETE] 删除智能体 %s 的关联会话: %s", agent_id, thread.id)
            self.session.delete(thread)

        self.session.delete(agent)
        self.session.commit()

        app_logger.info("[DELETE] 已删除智能体 %s 及其 %s 个关联会话", agent_id, len(related_threads))
        return {"ok": True, "deleted_threads_count": len(related_threads)}
