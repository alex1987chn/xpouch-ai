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
from crud.agent_run import create_agent_run, mark_run_completed, mark_run_failed
from crud.invoke_session import InvokePersistence
from database import get_session
from models import AgentRun, ExecutionPlan, Thread, User
from services.mcp_tools_service import mcp_tools_service
from utils.exceptions import AuthorizationError, ValidationError
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
        thread = self._get_or_create_thread(thread_id, user, message, agent_id)

        self.session.add(thread)
        agent_run = create_agent_run(
            self.session,
            thread_id=thread.id,
            user_id=user.id,
            entrypoint="invoke",
            mode=mode,
            checkpoint_namespace=thread.id,
        )
        execution_plan = self._persistence.create_execution_plan(message, thread.id, agent_run.id)
        thread.execution_plan_id = execution_plan.id
        thread.agent_type = "ai"
        thread.thread_mode = "complex"
        self.session.commit()
        self.session.refresh(execution_plan)

        logger.info(
            "[InvokeService] 创建 ExecutionPlan: %s (thread=%s)",
            execution_plan.id,
            thread.id,
        )

        try:
            self._mcp_tools = await self._get_mcp_tools()

            if mode == "auto":
                result = await self._execute_auto_mode(message, execution_plan)
            else:
                result = await self._execute_direct_mode(message, agent_id, execution_plan)

            response_payload = {
                k: v
                for k, v in result.items()
                if k not in ("task_list", "subtask_payload", "subtask_result")
            }
            response_payload["thread_id"] = thread.id
            response_payload["run_id"] = agent_run.id

            if mode == "auto":
                self._persistence.save_auto_result(
                    execution_plan,
                    result["task_list"],
                    result["final_response"],
                )
            else:
                self._persistence.save_direct_result(
                    execution_plan,
                    result["subtask_payload"],
                    result["subtask_result"],
                    result["final_response"],
                )
            mark_run_completed(self.session, agent_run)
            self.session.commit()

            return response_payload

        except Exception as e:
            self.session.rollback()
            self._persistence.mark_failed(execution_plan, str(e))
            failure_run = self.session.get(AgentRun, agent_run.id)
            if failure_run is not None:
                mark_run_failed(self.session, failure_run, error_message=str(e))
            self.session.commit()
            logger.error("[InvokeService] ExecutionPlan %s 失败: %s", execution_plan.id, e)
            raise

    def _get_or_create_thread(
        self,
        thread_id: str | None,
        user: User | None,
        message: str,
        agent_id: str | None,
    ) -> Thread:
        """为 invoke 链路获取或创建一个合法 Thread。"""
        if user is None:
            raise ValidationError("Invoke 调用缺少当前用户上下文")

        if thread_id:
            thread = self.session.get(Thread, thread_id)
            if not thread:
                raise ValidationError("指定的 thread_id 不存在", details={"thread_id": thread_id})
            if thread.user_id != user.id:
                raise AuthorizationError("没有权限访问此会话")
            return thread

        return Thread(
            id=str(uuid.uuid4()),
            title=message[:30] + "..." if len(message) > 30 else message,
            agent_id=agent_id or "assistant",
            agent_type="ai",
            thread_mode="complex",
            user_id=user.id,
            status="idle",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

    def _validate_mode(self, mode: str, agent_id: str | None) -> None:
        """验证执行模式"""
        if mode not in ["auto", "direct"]:
            raise ValidationError(
                f"无效的执行模式: {mode}，必须是 'auto' 或 'direct'", details={"mode": mode}
            )

        if mode == "direct":
            if not agent_id:
                raise ValidationError("Direct 模式需要指定 agent_id", details={"mode": mode})

            expert = get_expert_config_cached(agent_id)
            if not expert:
                raise ValidationError(f"未知的专家类型: {agent_id}", details={"agent_id": agent_id})

    async def _get_mcp_tools(self) -> list[Any]:
        """
        获取 MCP 动态工具

        使用统一的 MCPToolsService，自动处理缓存和配置变化检测

        注意: langchain-mcp-adapters 0.2.1 采用无状态设计，
        每次调用自动创建和清理会话，无需显式关闭。
        """
        return await mcp_tools_service.get_tools()

    async def _execute_auto_mode(
        self, message: str, execution_plan: ExecutionPlan
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
            "final_response": "",
        }

        # 创建工作流实例
        graph = create_smart_router_workflow()

        # 执行工作流
        final_state = await graph.ainvoke(
            initial_state,
            config={
                "recursion_limit": 100,
                "configurable": {
                    "thread_id": execution_plan.thread_id,
                    "mcp_tools": self._mcp_tools,
                },
            },
        )

        logger.info(
            f"[InvokeService] Auto 模式完成，执行了 {len(final_state['expert_results'])} 个专家"
        )

        return {
            "mode": "auto",
            "thread_id": execution_plan.thread_id,
            "execution_plan_id": execution_plan.id,
            "strategy": final_state["strategy"],
            "final_response": final_state["final_response"],
            "expert_results": final_state["expert_results"],
            "sub_tasks_count": len(final_state["task_list"]),
            "task_list": final_state["task_list"],
        }

    async def _execute_direct_mode(
        self, message: str, agent_id: str, execution_plan: ExecutionPlan
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
            "updated_at": datetime.now(),
        }

        initial_state = {
            "messages": [HumanMessage(content=message)],
            "task_list": [subtask_dict],
            "current_task_index": 0,
            "strategy": f"直接模式: {agent_id} 专家",
            "expert_results": [],
            "final_response": "",
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
            "duration_ms": result.get("duration_ms", 0),
        }

        logger.info(f"[InvokeService] Direct 模式完成，专家: {agent_id}")

        return {
            "mode": "direct",
            "thread_id": execution_plan.thread_id,
            "execution_plan_id": execution_plan.id,
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
