"""
双模调用服务 (Auto/Direct) — 编排层

只做模式校验、流程控制与调用持久化层；不直接操作 ORM 细节。
持久化由 crud.invoke_session.InvokePersistence 负责。
"""
import uuid
from datetime import datetime
from typing import Any

from fastapi import Depends
from langchain_core.messages import HumanMessage
from sqlmodel import Session

from agents.graph import create_smart_router_workflow
from agents.nodes.generic import generic_worker_node
from agents.services.expert_manager import get_expert_config_cached
from crud.invoke_session import InvokePersistence
from database import get_session
from models import TaskSession, User
from services.mcp_tools_service import mcp_tools_service
from utils.exceptions import ValidationError
from utils.logger import logger


class InvokeService:
    """
    双模调用编排：校验 -> 创建会话 -> 取工具 -> 执行 -> 持久化结果/失败。
    所有 DB 写操作通过 InvokePersistence 完成。
    """

    def __init__(self, session: Session) -> None:
        self.session = session
        self._persistence = InvokePersistence(session)
        self._mcp_tools: list[Any] = []

    async def invoke(
        self,
        message: str,
        mode: str,
        agent_id: str | None = None,
        thread_id: str | None = None,
        user: User | None = None,
    ) -> dict[str, Any]:
        """执行双模调用；结果与异常时的失败状态均由持久化层落库。"""
        self._validate_mode(mode, agent_id)

        task_session = self._persistence.create_task_session(message, thread_id)
        logger.info("[InvokeService] 创建 TaskSession: %s", task_session.session_id)

        try:
            self._mcp_tools = await self._get_mcp_tools()

            if mode == "auto":
                result = await self._execute_auto_mode(message, task_session)
            else:
                result = await self._execute_direct_mode(message, agent_id, task_session)

            response_payload = {k: v for k, v in result.items() if k not in ("task_list", "subtask_payload", "subtask_result")}

            with self.session.begin():
                if mode == "auto":
                    self._persistence.save_auto_result(
                        task_session,
                        result["task_list"],
                        result["final_response"],
                    )
                else:
                    self._persistence.save_direct_result(
                        task_session,
                        result["subtask_payload"],
                        result["subtask_result"],
                        result["final_response"],
                    )

            return response_payload

        except Exception as e:
            self.session.rollback()
            self._persistence.mark_failed(task_session, str(e))
            logger.error("[InvokeService] TaskSession %s 失败: %s", task_session.session_id, e)
            raise

    def _validate_mode(self, mode: str, agent_id: str | None) -> None:
        """验证执行模式"""
        if mode not in ["auto", "direct"]:
            raise ValidationError(
                f"无效的执行模式: {mode}，必须是 'auto' 或 'direct'",
                details={"mode": mode}
            )

        if mode == "direct":
            if not agent_id:
                raise ValidationError(
                    "Direct 模式需要指定 agent_id",
                    details={"mode": mode}
                )

            expert = get_expert_config_cached(agent_id)
            if not expert:
                raise ValidationError(
                    f"未知的专家类型: {agent_id}",
                    details={"agent_id": agent_id}
                )

    async def _get_mcp_tools(self) -> list[Any]:
        """
        获取 MCP 动态工具

        使用统一的 MCPToolsService，自动处理缓存和配置变化检测

        注意: langchain-mcp-adapters 0.2.1 采用无状态设计，
        每次调用自动创建和清理会话，无需显式关闭。
        """
        return await mcp_tools_service.get_tools()

    async def _execute_auto_mode(
        self,
        message: str,
        task_session: TaskSession
    ) -> dict[str, Any]:
        """
        执行 Auto 模式（完整多专家协作）

        使用 LangGraph 智能路由工作流，自动规划任务、
        调用多个专家协作完成复杂请求。
        """
        logger.info("[InvokeService] Auto 模式：启动完整工作流")

        initial_state = {
            "messages": [HumanMessage(content=message)],
            "task_list": [],
            "current_task_index": 0,
            "strategy": "",
            "expert_results": [],
            "final_response": ""
        }

        # 创建工作流实例
        graph = create_smart_router_workflow()

        # 执行工作流
        final_state = await graph.ainvoke(
            initial_state,
            config={
                "recursion_limit": 100,
                "configurable": {
                    "thread_id": task_session.session_id,
                    "mcp_tools": self._mcp_tools
                }
            }
        )

        logger.info(
            f"[InvokeService] Auto 模式完成，"
            f"执行了 {len(final_state['expert_results'])} 个专家"
        )

        return {
            "mode": "auto",
            "thread_id": task_session.session_id,
            "session_id": task_session.session_id,
            "strategy": final_state["strategy"],
            "final_response": final_state["final_response"],
            "expert_results": final_state["expert_results"],
            "sub_tasks_count": len(final_state["task_list"]),
            "task_list": final_state["task_list"],
        }

    async def _execute_direct_mode(
        self,
        message: str,
        agent_id: str,
        task_session: TaskSession
    ) -> dict[str, Any]:
        """
        执行 Direct 模式（单专家直接调用）

        直接调用指定专家，适用于简单任务或特定专家场景。
        """
        logger.info(f"[InvokeService] Direct 模式：调用专家 {agent_id}")

        # 创建子任务
        subtask_dict = {
            "id": str(uuid.uuid4()),
            "expert_type": agent_id,
            "description": message,
            "input_data": {},
            "status": "pending",
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }

        initial_state = {
            "messages": [HumanMessage(content=message)],
            "task_list": [subtask_dict],
            "current_task_index": 0,
            "strategy": f"直接模式: {agent_id} 专家",
            "expert_results": [],
            "final_response": ""
        }

        # 使用 generic_worker_node 执行
        result = await generic_worker_node(initial_state)

        # 构建专家结果
        expert_result = {
            "task_id": subtask_dict["id"],
            "expert_type": agent_id,
            "description": message,
            "output": result.get("output_result", ""),
            "status": result.get("status", "unknown"),
            "started_at": result.get("started_at"),
            "completed_at": result.get("completed_at"),
            "duration_ms": result.get("duration_ms", 0)
        }

        logger.info(f"[InvokeService] Direct 模式完成，专家: {agent_id}")

        return {
            "mode": "direct",
            "thread_id": task_session.session_id,
            "session_id": task_session.session_id,
            "expert_type": agent_id,
            "final_response": result.get("output_result", ""),
            "expert_results": [expert_result],
            "sub_tasks_count": 1,
            "subtask_payload": subtask_dict,
            "subtask_result": result,
        }

def get_invoke_service(session: Session = Depends(get_session)) -> InvokeService:
    """获取 InvokeService 实例（FastAPI Depends）"""
    return InvokeService(session)
