"""
SSE 流式输出核心服务

职责:
- 自定义智能体流式/非流式处理
- LangGraph 复杂模式流式/非流式处理
- SSE 事件生成和转换
- 心跳保活机制

依赖:
- backend.services.chat.thread_service (线程/消息保存)
- backend.utils.event_generator (SSE事件生成)
- backend.utils.thinking_parser (Think标签解析)

注意:
- LangGraph 导入在方法内部进行，防止循环引用
"""

import asyncio
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage
from langgraph.types import Command
from sqlmodel import Session, select

from agents.event_stream import sse_payload_to_wire
from config import settings
from crud.run_event import (
    emit_hitl_interrupted,
    emit_plan_updated,
    emit_router_decided,
    emit_run_completed,
    emit_run_failed,
)
from models import AgentRun, ExecutionPlan, RunStatus, Thread
from models.enums import GraphTaskStatus, TaskStatus, to_task_status
from services.chat.parts.custom_agent import CustomAgentMixin
from services.chat.parts.event_builders import EventBuildersMixin
from services.mcp_tools_service import mcp_tools_service
from utils.error_codes import ErrorCode
from utils.exceptions import AppError
from utils.logger import logger, set_run_id
from utils.time import utc_now_naive

# 允许产生 message.delta / message.thinking 的节点白名单。
# - aggregator：复杂模式的最终聚合回复
# - direct_reply：简单模式的回复（内容经 on_chat_model_stream 逐字送达，
#   是 simple 模式唯一的流式来源）
# 其余节点（commander/expert/router）的产出经 sse_event 通道直达前端。
_DELTA_ALLOWED_NODES = frozenset({"aggregator", "direct_reply"})


class StreamService(CustomAgentMixin, EventBuildersMixin):
    """流式处理服务。

    P3-2 增量拆分：自定义智能体双路径（parts/custom_agent.py）与
    事件构建/运行状态助手（parts/event_builders.py）已迁出（Mixin 组合），
    公开接口不变。
    """

    def __init__(self, db_session: Session):
        self.db = db_session
        # 延迟初始化 thread_service，避免循环依赖问题
        self._thread_service = None

    @property
    def thread_service(self):
        """延迟初始化 ChatThreadService"""
        if self._thread_service is None:
            from .thread_service import ChatThreadService

            self._thread_service = ChatThreadService(self.db)
        return self._thread_service

    # ============================================================================
    # 🔥 MCP 工具获取 (v3.3 - 使用统一服务)
    # ============================================================================

    async def _get_mcp_tools(self) -> list[Any]:
        """
        获取所有激活的 MCP 服务器工具

        使用统一的 MCPToolsService，自动处理缓存和配置变化检测

        Returns:
            List[Tool]: MCP 工具列表
        """
        return await mcp_tools_service.get_tools()

    @classmethod
    async def invalidate_mcp_cache(cls):
        """手动使 MCP 工具缓存失效"""
        await mcp_tools_service.invalidate_cache()

    async def handle_langgraph_stream(
        self,
        initial_state: dict,
        thread_id: str,
        thread: Thread,
        agent_run: AgentRun,
        user_message: str,
        message_id: str | None = None,
    ) -> StreamingResponse:
        """
        LangGraph 复杂模式流式处理

        Args:
            initial_state: LangGraph 初始状态
            thread_id: 线程ID
            thread: 线程实例
            user_message: 用户消息
            message_id: 前端传入的消息ID

        Returns:
            StreamingResponse SSE流
        """
        # 在方法内部导入 LangGraph，防止循环引用

        from agents.graph import create_smart_router_workflow

        async def event_generator():
            # 本 run 的所有日志行自动携带 run= 字段（请求任务生命周期内有效）
            set_run_id(agent_run.id)
            actual_message_id = message_id or str(uuid.uuid4())
            full_response = ""
            router_decision = "simple"
            await self._update_agent_run_status(
                agent_run.id, RunStatus.RUNNING, current_node="router"
            )

            # 收集任务列表和产物
            collected_task_list = []
            expert_artifacts = {}

            # 🔥 MCP: 获取动态工具
            mcp_tools = await self._get_mcp_tools()

            # 共享 checkpointer（绑定连接池，按操作借还连接，不再每流独占）
            from utils.db import get_shared_checkpointer

            graph = create_smart_router_workflow(checkpointer=get_shared_checkpointer())

            stream_queue = asyncio.Queue()

            config = {
                "recursion_limit": settings.recursion_limit,
                "configurable": {
                    "thread_id": thread_id,
                    "stream_queue": stream_queue,
                    "mcp_tools": mcp_tools,  # 🔥 MCP: 注入动态工具
                },
            }

            # 🔥🔥🔥 关键修复：使用确定性的隔离 thread_id，确保新消息不受旧状态影响
            # 格式: {thread_id}_{agent_run.id} - 确定性，可在恢复时重建
            isolated_thread_id = f"{thread_id}_{agent_run.id}"
            config["configurable"]["thread_id"] = isolated_thread_id
            logger.info(f"[StreamService] 使用隔离的 thread_id: {isolated_thread_id}")

            # 注入初始状态（现在使用隔离的 thread_id，不会与旧状态冲突）
            await graph.aupdate_state(config, initial_state)

            try:
                # 收集模型思考过程（DeepSeek reasoning_content），流结束后随消息持久化
                reasoning_parts: list[str] = []
                # 协议 v2：节点事件经 adispatch_custom_event 以 on_custom_event 浮现，
                # 每事件恰好一次（v1 的 event_queue 逐节点全量 flush 已废弃）
                async for token in graph.astream_events(None, config, version="v2"):
                    # 🔥 修复：跳过非字典类型的 token
                    if not isinstance(token, dict):
                        continue

                    self._raise_if_run_cancelled(agent_run.id)
                    self._sync_run_progress_from_token(token, agent_run.id)

                    event_type = token.get("event", "")
                    name = token.get("name", "")
                    data = token.get("data", {}) or {}
                    output = data.get("output", {}) or {}

                    # 协议 v2：节点的统一事件出口（emit_event）
                    if event_type == "on_custom_event" and name == "sse_event":
                        event_str = sse_payload_to_wire(token)
                        if event_str:
                            yield event_str
                        continue

                    # 处理消息流、task 事件等
                    event_str = self.transform_langgraph_event(
                        token, actual_message_id, reasoning_parts
                    )
                    if event_str:
                        yield event_str

                    # 收集任务执行结果
                    self._collect_execution_results(token, collected_task_list, expert_artifacts)

                    # 检测 router_decision
                    if (
                        event_type == "on_chain_end"
                        and name == "router"
                        and output
                        and isinstance(output, dict)
                        and output.get("router_decision")
                    ):
                        router_decision = output["router_decision"]
                        # 更新线程模式和运行实例模式
                        await self._update_thread_mode(
                            thread_id, router_decision, run_id=agent_run.id
                        )
                        # 🔥 写入 router_decided 事件到账本
                        await asyncio.to_thread(
                            emit_router_decided,
                            self.db,
                            run_id=agent_run.id,
                            thread_id=thread_id,
                            mode=router_decision,
                            reason=output.get("router_reason"),
                        )

            except AppError as e:
                if e.code == ErrorCode.RUN_CANCELLED:
                    logger.info("[StreamService] 运行已取消，结束 LangGraph 流")
                    yield self._build_error_event(ErrorCode.RUN_CANCELLED, e.message)
                    return
                logger.error(f"[StreamService] 流式处理异常: {e}", exc_info=True)
                await self._mark_agent_run_failed(agent_run.id, str(e))
                # 🔥 写入 run_failed 事件到账本
                await asyncio.to_thread(
                    emit_run_failed,
                    self.db,
                    run_id=agent_run.id,
                    thread_id=thread_id,
                    error_code=str(e.code) if e.code else None,
                    error_message=str(e),
                )
                await asyncio.to_thread(self.db.commit)
                yield self._build_error_event(ErrorCode.GRAPH_ERROR, str(e))
                return
            except Exception as e:
                logger.error(f"[StreamService] 流式处理异常: {e}", exc_info=True)
                await self._mark_agent_run_failed(agent_run.id, str(e))
                # 🔥 写入 run_failed 事件到账本
                await asyncio.to_thread(
                    emit_run_failed,
                    self.db,
                    run_id=agent_run.id,
                    thread_id=thread_id,
                    error_message=str(e),
                )
                await asyncio.to_thread(self.db.commit)
                yield self._build_error_event(ErrorCode.GRAPH_ERROR, str(e))
                return

            # HITL 检测：`interrupt()` 把「停在审批点等人」变成了**原生状态**。
            # `snapshot.tasks[].interrupts` 非空即表示图正停在某个 interrupt 上。
            # 这取代了原先的启发式（`task_list` 非空 && `current_task_index == 0`
            # && 未收集到任何结果）——那种靠状态形状反推的判据在「规划出 0 任务」
            # 或「首任务已完成但收集失败」时会误判。
            final_state = await graph.aget_state(config)
            state_values = final_state.values if final_state else {}

            pending_interrupts = (
                [intr for task in (final_state.tasks or ()) for intr in (task.interrupts or ())]
                if final_state
                else []
            )

            if pending_interrupts:
                logger.info(
                    "[StreamService] HITL 中断检测：图停在 interrupt（%d 个），等待用户审核",
                    len(pending_interrupts),
                )

                # 构建当前计划数据（供前端审批卡渲染）
                task_list = state_values.get("task_list", [])

                # 🔥 方案1：更新 ExecutionPlan 状态为 waiting_for_approval
                await self._update_execution_plan_status(thread_id, TaskStatus.WAITING_FOR_APPROVAL)

                current_plan = [
                    {
                        "id": task.get("id", f"task-{i}"),
                        "expert_type": task.get("expert_type", "generic"),
                        "description": task.get("description", ""),
                        "sort_order": i,
                        "status": "pending",
                        "depends_on": task.get("depends_on") or [],  # 🔥 关键：传递依赖关系到前端
                    }
                    for i, task in enumerate(task_list)
                ]

                # 发送 human.interrupt 事件（包含计划版本号，供乐观锁校验）
                plan_version = self._get_plan_version(thread_id)
                execution_plan = self._get_latest_execution_plan(thread_id)

                # 🔥 写入 hitl_interrupted 事件到账本
                await asyncio.to_thread(
                    emit_hitl_interrupted,
                    self.db,
                    run_id=agent_run.id,
                    thread_id=thread_id,
                    execution_plan_id=execution_plan.id if execution_plan else None,
                    plan_version=plan_version,
                )
                await asyncio.to_thread(self.db.commit)

                await self._update_agent_run_status(
                    agent_run.id,
                    RunStatus.WAITING_FOR_APPROVAL,
                    current_node="waiting_for_approval",
                )
                # 🔥 HITL 等待期挂起执行预算（用户思考时间不消耗 deadline）
                from services.chat.run_lifecycle import pause_deadline

                await asyncio.to_thread(pause_deadline, self.db, agent_run.id)
                yield self._build_human_interrupt_event(
                    thread_id,
                    current_plan,
                    plan_version,
                    run_id=agent_run.id,
                    execution_plan_id=execution_plan.id if execution_plan else None,
                )
                # HITL 中断是本轮流的正常终态：发 [DONE] 让前端干净收尾
                # （恢复走独立的 /chat/resume 请求）
                yield "data: [DONE]\n\n"
                return  # 结束流，等待用户通过 /chat/resume 恢复

            # 正常流程：获取最终结果
            last_message = (
                state_values.get("messages", [])[-1] if state_values.get("messages") else None
            )

            if last_message:
                full_response = last_message.content

                if router_decision == "complex":
                    persist_error = self._get_complex_result_persistence_error(
                        thread_id=thread_id,
                        last_message=last_message,
                        task_list=collected_task_list,
                    )
                    if persist_error:
                        logger.error("[StreamService] %s", persist_error)
                        await self._mark_agent_run_failed(agent_run.id, persist_error)
                        yield self._build_error_event(ErrorCode.GRAPH_ERROR, persist_error)
                        return

                # 保存到数据库
                await self._save_langgraph_result(
                    thread_id=thread_id,
                    thread=thread,
                    user_message=user_message,
                    last_message=last_message,
                    router_decision=router_decision,
                    task_list=collected_task_list,
                    expert_artifacts=expert_artifacts,
                    message_id=actual_message_id,
                    run_id=agent_run.id,
                    thinking_text="".join(reasoning_parts) or None,
                )
                await self._update_agent_run_status(
                    agent_run.id, RunStatus.COMPLETED, current_node="done"
                )
                # 🔥 写入 run_completed 事件到账本
                await asyncio.to_thread(
                    emit_run_completed,
                    self.db,
                    run_id=agent_run.id,
                    thread_id=thread_id,
                )
                await asyncio.to_thread(self.db.commit)

            # 🔥 修复：只有简单模式才在这里发送 message.done
            # 复杂模式由 aggregator 通过 event_queue 发送
            if router_decision == "simple":
                yield self._build_message_done_event(actual_message_id, full_response)
            # 复杂模式：message.done 已由 aggregator 通过 event_queue 发送

            # 传输级完成标记：前端据此区分"正常结束"与"异常断流"
            yield "data: [DONE]\n\n"

            # async-with（图连接）退出后清理本次运行的隔离线程 checkpoint：
            # 图的最终 checkpoint 写入要等到连接归还时才全部落地，删除必须放在
            # 此处（放在 with 内会"删后复现"，实测如此）
            from utils.db import delete_checkpoints_for_thread

            await delete_checkpoints_for_thread(thread_id, [agent_run.id])

        from services.chat.run_lifecycle import sse_stream_headers

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers=sse_stream_headers(thread_id, agent_run.id),
        )

    async def handle_langgraph_sync(
        self,
        initial_state: dict,
        thread_id: str,
        thread: Thread,
        agent_run: AgentRun,
        user_message: str,
    ) -> dict:
        """LangGraph 非流式处理（内部使用流式）。

        拍板（2026-09-13）：sync 路径保留为公开 API 语义（stream=false 可用，
        供脚本/集成调用）；产品前端恒走流式，不在此路径上叠加新功能。
        """
        # 非流式也使用流式获取，但返回完整结果
        full_response = ""

        # 在方法内部导入
        from agents.graph import create_smart_router_workflow
        from utils.db import get_shared_checkpointer

        # 🔥 MCP: 获取动态工具
        mcp_tools = await self._get_mcp_tools()
        await self._update_agent_run_status(agent_run.id, RunStatus.RUNNING, current_node="router")

        graph = create_smart_router_workflow(checkpointer=get_shared_checkpointer())

        config = {
            "recursion_limit": settings.recursion_limit,
            "configurable": {
                "thread_id": thread_id,
                "mcp_tools": mcp_tools,  # 🔥 MCP: 注入动态工具
            },
        }

        # 🔥🔥🔥 关键修复：使用确定性的隔离 thread_id 避免状态冲突
        # 格式: {thread_id}_{agent_run.id} - 确定性，可在恢复时重建
        isolated_thread_id = f"{thread_id}_{agent_run.id}"
        config["configurable"]["thread_id"] = isolated_thread_id
        logger.info(f"[StreamService] 使用隔离的 thread_id: {isolated_thread_id}")

        await graph.aupdate_state(config, initial_state)

        # 执行
        result = await graph.ainvoke(None, config)

        last_message = result.get("messages", [])[-1] if result.get("messages") else None
        router_decision = result.get("router_decision", "simple")

        if last_message:
            full_response = last_message.content

            if router_decision == "complex":
                persist_error = self._get_complex_result_persistence_error(
                    thread_id=thread_id,
                    last_message=last_message,
                    task_list=result.get("task_list", []),
                )
                if persist_error:
                    await self._mark_agent_run_failed(agent_run.id, persist_error)
                    raise AppError(
                        message=persist_error,
                        code=ErrorCode.GRAPH_ERROR,
                        status_code=500,
                    )

            await self._save_langgraph_result(
                thread_id=thread_id,
                thread=thread,
                user_message=user_message,
                last_message=last_message,
                router_decision=router_decision,
                task_list=result.get("task_list", []),
                expert_artifacts={},
                message_id=initial_state.get("message_id") or str(uuid.uuid4()),
                run_id=agent_run.id,
            )
            await self._update_agent_run_status(
                agent_run.id, RunStatus.COMPLETED, current_node="done"
            )

        return {
            "role": "assistant",
            "content": full_response,
            "thread_id": thread_id,
            "run_id": agent_run.id,
            "threadMode": router_decision,
        }

    async def _save_langgraph_result(
        self,
        thread_id: str,
        thread: Thread,
        user_message: str,
        last_message: Any,
        router_decision: str,
        task_list: list[dict],
        expert_artifacts: dict,
        message_id: str,
        run_id: str | None = None,
        thinking_text: str | None = None,
    ):
        """保存 LangGraph 执行结果"""
        from crud.execution_plan import create_artifacts_batch, get_subtasks_by_execution_plan
        from models import SubTask, TaskStatus

        # 复杂模式：创建 ExecutionPlan 和 SubTasks
        if router_decision == "complex":
            await self.thread_service.update_thread_agent_type(thread_id, "ai")
            execution_plan = self._get_latest_execution_plan(thread_id)
            if execution_plan is None:
                logger.warning("[StreamService] complex 结果保存时未找到 ExecutionPlan，跳过落库")
                return

            execution_plan.run_id = execution_plan.run_id or run_id
            execution_plan.user_query = execution_plan.user_query or user_message
            execution_plan.status = TaskStatus.COMPLETED
            # final_response 由 aggregator 写入（= 用户看到的聚合综述）。
            # 这里只在为空时兜底，**不得覆盖**——state 里的最后一条消息在复杂模式下
            # 是最后一个专家的原始产出，覆盖会让计划正文变成专家草稿而非综述。
            if not execution_plan.final_response:
                execution_plan.final_response = last_message.content
            execution_plan.updated_at = utc_now_naive()
            execution_plan.completed_at = utc_now_naive()
            self.db.add(execution_plan)
            self.db.flush()

            # 更新 thread
            thread.execution_plan_id = execution_plan.id
            self.db.add(thread)

            existing_subtasks = {
                subtask.id: subtask
                for subtask in get_subtasks_by_execution_plan(self.db, execution_plan.id)
            }

            # 保存 SubTasks
            for subtask in task_list:
                db_subtask = existing_subtasks.get(subtask["id"])
                if db_subtask is None:
                    db_subtask = SubTask(
                        id=subtask["id"],
                        expert_type=subtask["expert_type"],
                        task_description=subtask["description"],
                        input_data=subtask.get("input_data", {}),
                        execution_plan_id=execution_plan.id,
                        created_at=utc_now_naive(),
                    )

                db_subtask.expert_type = subtask["expert_type"]
                db_subtask.task_description = subtask["description"]
                db_subtask.input_data = subtask.get("input_data", {})
                db_subtask.status = to_task_status(subtask.get("status", GraphTaskStatus.COMPLETED))
                db_subtask.output_result = subtask.get("output_result")
                db_subtask.started_at = subtask.get("started_at")
                db_subtask.completed_at = subtask.get("completed_at")
                db_subtask.updated_at = utc_now_naive()
                self.db.add(db_subtask)
                self.db.flush()

                # 🔥 保存 artifacts（使用 task_id 匹配）
                task_id = subtask.get("id")
                logger.info(
                    f"[StreamService] 尝试保存 artifacts: task_id={task_id}, expert_artifacts keys={list(expert_artifacts.keys())}"
                )

                if task_id and task_id in expert_artifacts:
                    try:
                        logger.info(
                            f"[StreamService] 找到 artifacts: {len(expert_artifacts[task_id])} 个"
                        )
                        create_artifacts_batch(self.db, db_subtask.id, expert_artifacts[task_id])
                        logger.info("[StreamService] ✅ artifacts 保存成功")
                    except Exception as e:
                        # rollback 必需：create_artifacts_batch 内部会 commit，失败后
                        # 会话可能残留不可用事务态；本函数随后还要写助手消息，
                        # 不清理会以 PendingRollbackError 把局部失败放大成整轮保存失败
                        self.db.rollback()
                        logger.error(
                            "[StreamService] 保存 artifacts 失败（该任务产物缺失，"
                            "其余保存流程继续）: %s",
                            e,
                            exc_info=True,
                        )
                else:
                    logger.warning(
                        f"[StreamService] ⚠️ task_id={task_id} 在 expert_artifacts 中未找到"
                    )

        if router_decision == "complex":
            # 复杂模式的**唯一写入者**是 aggregator 节点：它是图内最后一个节点，
            # 无条件写入助手消息（save_assistant_message_sync，带 state.message_id）
            # 与计划的 final_response。
            #
            # 因此这里必须提前返回、不重复保存，否则同一轮会出现**两条内容不同的
            # 助手消息**——一条是用户看到的聚合综述，一条是 state 里最后一个专家的
            # 原始产出；并且会把计划的 final_response 覆盖成专家原始产出。
            # 生产前端恒走流式 + 审批暂停，所以这条路径平时走不到；但 sync 公开
            # API 路径（handle_langgraph_sync）会走到，属真实可触发的重复写入。
            return

        # 保存 AI 消息（简单模式；思考过程优先用原生 reasoning_content，
        # 无则回退 <think> 标签解析）
        from utils.thinking_parser import build_thinking_data

        thinking_data = build_thinking_data(thinking_text) if thinking_text else None
        await self.thread_service.save_assistant_message(
            thread_id=thread_id,
            content=last_message.content,
            message_id=message_id,
            thinking_data=thinking_data,
        )

    def _get_complex_result_persistence_error(
        self,
        *,
        thread_id: str,
        last_message: Any,
        task_list: list[dict],
    ) -> str | None:
        """在复杂模式持久化前做主流程校验，避免把半残状态误标为完成。"""
        if not isinstance(last_message, AIMessage):
            return "复杂模式未产出有效助手消息，已拒绝将当前结果落库为 completed"
        if not task_list:
            return "复杂模式未收集到任何任务结果，已拒绝将当前结果落库为 completed"
        if self._get_latest_execution_plan(thread_id) is None:
            return "复杂模式未找到已创建的 ExecutionPlan，已拒绝写入错误兜底结果"
        return None

    async def _update_thread_mode(self, thread_id: str, mode: str, run_id: str | None = None):
        """更新线程模式和运行实例模式"""
        thread = self.db.get(Thread, thread_id)
        if thread:
            thread.thread_mode = mode
            self.db.add(thread)

        # 🔥 同时更新 AgentRun.mode，确保前端能正确显示 simple/complex
        if run_id:
            agent_run = self.db.get(AgentRun, run_id)
            if agent_run:
                agent_run.mode = mode
                agent_run.updated_at = utc_now_naive()
                self.db.add(agent_run)

        self.db.commit()

    def _collect_execution_results(self, token, task_list: list[dict], expert_artifacts: dict):
        """收集 LangGraph 执行结果（从 state 更新读取，替代 v1 的 raw output 捞取）"""
        # 🔥 修复：跳过非字典类型的 token
        if not isinstance(token, dict):
            return

        event = token.get("event", "")

        if event == "on_chain_end":
            output = token.get("data", {}).get("output", {}) or {}
            if not (output and isinstance(output, dict)):
                return
            # 正式 schema 键（generic 节点返回值经 ChannelWrite 透传到事件 output）
            expert_info = output.get("last_expert_result")
            if not expert_info:
                return
            # 收集任务结果
            task_list.append(
                {
                    "id": expert_info.get("task_id"),
                    "expert_type": expert_info.get("expert_type"),
                    "status": expert_info.get("status"),
                    "description": output.get("description", ""),
                    "output_result": output.get("output_result"),
                    "input_data": output.get("input_data", {}),
                    "started_at": output.get("started_at"),
                    "completed_at": output.get("completed_at"),
                    "artifact": output.get("artifact"),
                }
            )

            # 收集 artifacts
            task_id = expert_info.get("task_id")
            artifact_data = output.get("artifact")
            logger.info(
                f"[_collect_execution_results] 收集 artifacts: task_id={task_id}, has_artifact={artifact_data is not None}"
            )
            if task_id and artifact_data:
                if task_id not in expert_artifacts:
                    expert_artifacts[task_id] = []
                expert_artifacts[task_id].append(artifact_data)
                logger.info(
                    f"[_collect_execution_results] ✅ artifacts 已收集: task_id={task_id}, count={len(expert_artifacts[task_id])}"
                )

    # ============================================================================
    # 公共流式方法（供 RecoveryService 复用）
    # ============================================================================

    async def execute_langgraph_stream(
        self,
        thread_id: str,
        stream_queue: asyncio.Queue,
        sse_queue: asyncio.Queue,
        realtime_queue: asyncio.Queue,
        updated_plan: list[dict] | None = None,
        message_id: str | None = None,
        run_id: str | None = None,
    ) -> AsyncGenerator[str]:
        """
        执行 LangGraph 流式处理（供 RecoveryService 复用）

        这是核心的流式执行逻辑，RecoveryService 在清理状态后调用此方法

        Args:
            thread_id: 线程ID
            stream_queue: 流式队列
            sse_queue: SSE 事件队列
            realtime_queue: 实时推送队列
            updated_plan: 用户修改后的计划（可选）
            message_id: 前端传入的消息ID（用于关联流式输出）
            run_id: 关联的 AgentRun ID（可选）

        Yields:
            SSE 事件字符串
        """
        # 在方法内部导入，防止循环引用
        from agents.graph import create_smart_router_workflow
        from utils.db import get_shared_checkpointer

        # 恢复流程同样把 run_id 注入日志上下文（HITL 续跑的日志关联）
        if run_id:
            set_run_id(run_id)

        # 🔥 MCP: 获取动态工具
        mcp_tools = await self._get_mcp_tools()

        graph = create_smart_router_workflow(checkpointer=get_shared_checkpointer())

        # 🔥🔥🔥 关键修复：使用与初始执行相同的确定性 isolated_thread_id
        # 格式: {thread_id}_{run_id} - 必须与 handle_langgraph_stream 中的格式一致
        isolated_thread_id = f"{thread_id}_{run_id}" if run_id else thread_id
        config = {
            "recursion_limit": settings.recursion_limit,
            "configurable": {
                "thread_id": isolated_thread_id,
                "stream_queue": realtime_queue,
                "mcp_tools": mcp_tools,  # 🔥 MCP: 注入动态工具
            },
        }
        logger.info(f"[StreamService] 恢复流程使用隔离的 thread_id: {isolated_thread_id}")

        # 如果提供了更新后的计划，应用它
        if updated_plan:
            await self._apply_updated_plan(graph, config, updated_plan, message_id)
            if run_id:
                execution_plan = self._get_execution_plan_by_run(run_id)
                if execution_plan:
                    emit_plan_updated(
                        self.db,
                        run_id=run_id,
                        thread_id=thread_id,
                        execution_plan_id=execution_plan.id,
                        plan_version=int(execution_plan.plan_version),
                        task_count=len(updated_plan),
                    )
                    self.db.commit()
        else:
            # 普通批准（未修改计划）：图从中断点直接续跑，state 不会经过
            # _apply_updated_plan——单独补写 message_id，保证聚合阶段
            # message.done 与本次流式 delta 使用同一 ID
            if message_id:
                await graph.aupdate_state(config, {"message_id": message_id})
        # 单次驱动整个计划：interrupt() 把「暂停点」变成原生状态，一次
        # astream_events 即可从审批点续跑到聚合完成。旧式 interrupt_before
        # 每次到达 dispatcher（含任务切换）都中断，才需要外层 while 反复
        # 拉起图、并用「current_index > 0」的位置启发式区分首次审批与任务
        # 切换——那套脚手架随 interrupt() 一并移除。
        aggregator_executed = False
        # 恢复输入：审批结果经 Command(resume=) 回传给 plan_approval 节点
        resume_input = Command(resume={"action": "approve"})

        async def producer():
            nonlocal aggregator_executed
            try:
                if run_id:
                    self._raise_if_run_cancelled(run_id)

                # 执行一轮 LangGraph
                async for token in graph.astream_events(resume_input, config, version="v2"):
                    # 🔥 修复：token 可能是字符串，跳过非字典类型
                    if not isinstance(token, dict):
                        continue

                    if run_id:
                        self._raise_if_run_cancelled(run_id)
                    if run_id:
                        self._sync_run_progress_from_token(token, run_id)

                    event_type = token.get("event", "")
                    metadata = token.get("metadata", {})
                    # 🔥 修复：on_chain_start 用 metadata.name，on_chain_end 用 token.name
                    if event_type == "on_chain_start":
                        name = metadata.get("name", "")
                    else:
                        name = token.get("name", "")

                    # 协议 v2：节点的统一事件出口（emit_event）
                    if event_type == "on_custom_event" and name == "sse_event":
                        custom_str = sse_payload_to_wire(token)
                        if custom_str:
                            await _push_event(custom_str)
                            if "message.done" in custom_str:
                                logger.info("[Producer] 已发送 message.done，标记 aggregator 完成")
                                aggregator_executed = True
                        continue

                    # aggregator 开始执行即表示已进入聚合阶段（供收尾判定）
                    if event_type == "on_chain_start" and name == "aggregator":
                        aggregator_executed = True
                        logger.info("[Producer] aggregator 开始执行")

                    if event_type == "on_chain_end":
                        data = token.get("data", {}) or {}
                        output = data.get("output", {}) or {}

                        # 聚合完成（final_response 非空）→ 标记，供收尾判定
                        if name == "aggregator" and output.get("final_response"):
                            aggregator_executed = True
                            logger.info("[Producer] aggregator 执行完成")

                    event_str = self.transform_langgraph_event(token, message_id)
                    if event_str:
                        await _push_event(event_str)

                        # 🔥 如果发送了 message.done 事件，说明 aggregator 已完成
                        if "message.done" in event_str:
                            logger.info("[Producer] 已发送 message.done，标记 aggregator 完成")
                            aggregator_executed = True

                    # 收集 artifacts
                    data = token.get("data", {}) or {}
                    output = data.get("output", {}) or {}
                    if output and isinstance(output, dict) and output.get("artifact"):
                        expert_info = output.get("last_expert_result") or {}
                        await stream_queue.put(
                            {
                                "type": "artifact",
                                "task_id": expert_info.get("task_id"),
                                "data": output["artifact"],
                            }
                        )

            finally:
                # 注意：这里**不捕获**异常——失败必须上抛。
                # 此前是 `except Exception: logger.error(...)` 吞掉继续，后果是
                # 消费者收到 finally 投递的 done 后正常退出、`await producer_task`
                # 正常返回，于是恢复流程继续把 run 标成 COMPLETED：**一次彻底失败
                # 的 HITL 恢复被粉饰成成功**（客户端收到干净的 [DONE]、无 error
                # 事件、无 message.done），而 recovery_service 里专门写好的
                # 「标失败 + 推 RESUME_ERROR」分支永远不会执行。
                # 现在让异常沿 await producer_task 上抛到调用方既有的处理分支。
                if run_id:
                    hub.close(run_id)
                await sse_queue.put({"type": "done"})

        # 启动生产者
        producer_task = asyncio.create_task(producer())

        # 🔥 B6 断线续传：统一事件出口——分配 seq id 写入 hub 缓冲，
        # 再投递给当前消费者（主连接或 resume 连接各自订阅）
        from services.chat.stream_hub import get_stream_hub

        hub = get_stream_hub()

        async def _push_event(event_str: str) -> None:
            if run_id:
                event_str = hub.publish(run_id, event_str)
            await sse_queue.put({"type": "sse", "event": event_str})

        try:
            # 消费并 yield 事件
            while True:
                try:
                    item = await asyncio.wait_for(sse_queue.get(), timeout=settings.stream_timeout)
                    if item.get("type") == "done":
                        break
                    if item.get("type") == "sse" and item.get("event"):
                        yield item["event"]
                except TimeoutError:
                    if run_id:
                        self._touch_agent_run(run_id)
                        self._raise_if_run_cancelled(run_id)
                    yield self._build_heartbeat_event()

            await producer_task

            # 🔥 关键修复：更新 AgentRun 状态为 completed
            if run_id and aggregator_executed:
                # 完成收尾单一实现在 run_lifecycle.finalize_run_completed
                from services.chat.run_lifecycle import finalize_run_completed

                await asyncio.to_thread(finalize_run_completed, self.db, run_id, thread_id)

        except asyncio.CancelledError:
            # 🔥 客户端断开连接 ≠ 停止任务：producer 继续在后台跑到自然完成，
            # 结果照常落库——切走再回来的会话（banner + 轮询）能拿到完整结果。
            # 真正的停止走协作取消：POST /runs/{run_id}/cancel 写入 DB 后，
            # producer 在下一个 token 检查点感知并自行退出（本分支此前取消
            # producer 的实现会把后台断连误杀成僵尸 RUNNING，已移除）。
            if run_id:
                # 主动取回异常结果，避免孤儿任务的 "exception was never retrieved" 噪音
                producer_task.add_done_callback(
                    lambda t: t.exception() if not t.cancelled() else None
                )
                agent_run = self.db.get(AgentRun, run_id)
                logger.info(
                    f"[StreamService] 客户端断开连接，任务转后台继续执行: "
                    f"run={run_id} status={agent_run.status if agent_run else 'not found'}"
                )
            raise

        # message.done 由 aggregator_node 通过 event_queue 发送
        # 这里不再重复发送

    async def _apply_updated_plan(
        self, graph, config: dict, updated_plan: list[dict], message_id: str | None = None
    ):
        """把用户在审批页编辑过的计划合并进图状态。

        合并语义（业务规则，不属于脚手架）：
        - 已完成的任务：整条沿用当前状态（保留 `output_result` / Commander `task_id`）
        - 未完成/新增任务：采用前端提交的内容，但保留已有输出与 task_id
        - 依赖清理：指向已删除任务的 `depends_on` 条目剔除；空则置 None
        - 重算 `current_task_index`（第一个非 completed 任务的位置）

        续跑由调用方的 `Command(resume=...)` 触发，本方法只负责状态合并，
        不再伪造 `HumanMessage`（那是静态中断时代的权宜手段）。
        """
        # 合并状态，不要完全替换
        current_state = await graph.aget_state(config)
        current_values = current_state.values
        current_task_list = current_values.get("task_list", [])
        current_expert_results = current_values.get("expert_results", [])

        # 创建任务 ID 到当前任务的映射（键用 db id：前端提交的 updated_plan
        # 里 `id` 就是 db uuid，与审批卡下发的 current_plan 一致）
        current_task_map = {task.get("id"): task for task in current_task_list}

        # 清理依赖关系并合并状态
        #
        # ⚠️ 依赖集合必须用 **commander 语义 id（`task_id`）**，不能用 db id：
        # `depends_on` 里存的是 "task_1" 这类 commander id，而 `id` 是数据库主键。
        # 二者不同源（「双身份」），此前用 `task.get("id")` 建集合导致交集恒为空
        # —— 用户一旦编辑计划，**所有依赖都会被清空**，下游任务随即失去上游产出
        # 的上下文注入（generic 读取 depends_on 拼接上下文）。
        kept_task_ids = {str(task.get("task_id") or task.get("id")) for task in updated_plan}
        merged_plan = []

        for task in updated_plan:
            task_id = task.get("id")
            # 🔥 关键：从当前状态查找对应的任务，保留 task_id (Commander ID)
            existing_task = current_task_map.get(task_id)

            # 如果任务已完成，保留完整状态（包括 output_result 和 task_id）
            if existing_task and existing_task.get("status") == "completed":
                merged_task = dict(existing_task)
            else:
                # 新任务或待执行任务，使用前端数据但保留已有输出
                merged_task = dict(task)
                if existing_task:
                    # 🔥🔥🔥 关键修复：保留 task_id (Commander ID) 和 output_result
                    merged_task["task_id"] = existing_task.get("task_id") or task.get("task_id")
                    merged_task["output_result"] = existing_task.get("output_result")
                    merged_task["status"] = existing_task.get(
                        "status", task.get("status", "pending")
                    )

            # 🔥 兜底：确保 task_id 字段存在（如果前端没传，从现有状态复制）
            if not merged_task.get("task_id") and existing_task:
                merged_task["task_id"] = existing_task.get("task_id")

            # 清理依赖关系
            if merged_task.get("depends_on"):
                cleaned_deps = [dep for dep in merged_task["depends_on"] if dep in kept_task_ids]
                merged_task["depends_on"] = cleaned_deps if cleaned_deps else None

            merged_plan.append(merged_task)

        # 计算正确的 current_task_index（第一个待执行任务的位置）
        next_task_index = 0
        for idx, task in enumerate(merged_plan):
            if task.get("status") != "completed":
                next_task_index = idx
                break
        else:
            # 所有任务都完成了
            next_task_index = len(merged_plan)

        # 更新 LangGraph 状态（保留已完成任务的结果）
        # 计划的 approve 合并语义：按 id 保留已完成任务的 output_result / task_id、
        # 清理指向已删除任务的依赖、重算 current_task_index。
        #
        # 不再伪造 HumanMessage 触发续跑：那是在静态中断（interrupt_before）下
        # 让图「动起来」的权宜手段，会把一条假用户消息写进会话历史。现在由
        # `Command(resume=...)` 触发续跑，图从断点继续，无需任何伪造输入。
        state_update = {
            "task_list": merged_plan,
            "current_task_index": next_task_index,  # 正确的索引，而不是重置为 0
            "expert_results": current_expert_results,  # 保留已有结果，而不是清空
        }
        # 恢复流的消息 ID 贯通：聚合阶段的 message.done 与本次流式 delta 使用同一 ID
        if message_id:
            state_update["message_id"] = message_id
        await graph.aupdate_state(config, state_update)

    # ============================================================================
    # 事件转换和构建
    # ============================================================================

    def transform_langgraph_event(
        self, token, message_id: str | None = None, reasoning_collector: list | None = None
    ) -> str | None:
        """将 LangGraph 事件转换为 SSE 格式

        判据说明（langgraph_node + node_type 合并共存，已实测验证）：
        - metadata["node_type"]：节点内部发 LLM 时自挂的角色标记，会出现在
          LLM token 事件（on_chat_model_stream）上，是该事件的**主判据**；
        - metadata["langgraph_node"]：LangGraph 1.2.11 自动注入的节点名，只挂在
          节点边界事件上（on_chain_start/end/stream），token 事件上作**兜底**判据。

        只有白名单节点允许产生 message.delta / message.thinking；其余节点
        （commander/expert/router）的产出经 sse_event 通道直达前端。
        本函数不处理 task/plan/artifact 等事件（那些由 emit_event 直达）。
        """
        import json

        # 🔥 修复：token 可能是字符串或其他类型，需要安全检查
        if not isinstance(token, dict):
            return None

        event_type = token.get("event", "")

        # 处理消息流（token 增量）
        if event_type == "on_chat_model_stream":
            data = token.get("data", {})
            chunk = data.get("chunk")
            if not chunk:
                return None

            metadata = token.get("metadata", {})
            node_type = metadata.get("node_type", "")
            langgraph_node = metadata.get("langgraph_node", "")

            # 白名单判据：aggregator = 复杂模式的最终回复流；
            # direct_reply = 简单模式的回复流（内容经 on_chat_model_stream 逐字送达，
            # 是 simple 模式唯一的流式来源，不可拦截）
            effective_node = node_type or langgraph_node
            if effective_node not in _DELTA_ALLOWED_NODES:
                return None

            # 思考过程流式块（DeepSeek reasoning_content；思考 chunk 通常没有正文内容，
            # 必须在 content 判空之前处理，否则会被整体丢弃）
            reasoning = getattr(chunk, "additional_kwargs", {}).get("reasoning_content", "")
            if reasoning:
                if reasoning_collector is not None:
                    reasoning_collector.append(reasoning)
                event_data = {"content": reasoning}
                if message_id:
                    event_data["message_id"] = message_id
                return f"event: message.thinking\ndata: {json.dumps(event_data)}\n\n"

            content = getattr(chunk, "content", None)
            if content:
                # 只发送纯净数据，包含 message_id 用于前端消息关联
                event_data = {"content": content}
                if message_id:
                    event_data["message_id"] = message_id
                return f"event: message.delta\ndata: {json.dumps(event_data)}\n\n"

        # 协议 v2：task.started / task.completed / task.failed / artifact 均由节点
        # 经 custom stream（emit_event）直达，此处不再手造（v1 双发源头已移除）。

        return None

    def _get_latest_execution_plan(self, thread_id: str) -> ExecutionPlan | None:
        """获取线程最新的 ExecutionPlan。"""
        return self.db.exec(
            select(ExecutionPlan)
            .where(ExecutionPlan.thread_id == thread_id)
            .order_by(ExecutionPlan.created_at.desc())
        ).first()

    def _get_execution_plan_by_run(self, run_id: str) -> ExecutionPlan | None:
        """按 run_id 获取 ExecutionPlan（单一实现在 run_lifecycle）。"""
        from services.chat.run_lifecycle import get_execution_plan_by_run

        return get_execution_plan_by_run(self.db, run_id)

    async def _update_agent_run_status(
        self,
        run_id: str,
        status: RunStatus,
        *,
        current_node: str | None = None,
    ) -> None:
        """更新 AgentRun 状态（写路径经 to_thread；单一实现在 run_lifecycle）。"""
        from services.chat.run_lifecycle import update_run_status

        await asyncio.to_thread(
            update_run_status,
            self.db,
            run_id,
            status,
            current_node=current_node,
        )

    async def _mark_agent_run_failed(
        self,
        run_id: str,
        error_message: str,
        *,
        error_code: str | None = None,
    ) -> None:
        """将 AgentRun 标记为失败（写路径经 to_thread；单一实现在 run_lifecycle）。"""
        from services.chat.run_lifecycle import mark_run_failed

        await asyncio.to_thread(
            mark_run_failed,
            self.db,
            run_id,
            error_message,
            error_code=error_code,
        )

    def _get_plan_version(self, thread_id: str) -> int:
        """获取当前线程的计划版本号（乐观锁）"""
        execution_plan = self.db.exec(
            select(ExecutionPlan)
            .where(ExecutionPlan.thread_id == thread_id)
            .order_by(ExecutionPlan.created_at.desc())
        ).first()
        return int(execution_plan.plan_version) if execution_plan else 1

    async def _update_execution_plan_status(self, thread_id: str, status: TaskStatus) -> None:
        """
        更新 ExecutionPlan 状态（写路径经 to_thread，避免阻塞事件循环）

        Args:
            thread_id: 线程ID
            status: 新状态（TaskStatus 枚举）
        """

        def _write() -> None:
            execution_plan = self.db.exec(
                select(ExecutionPlan)
                .where(ExecutionPlan.thread_id == thread_id)
                .order_by(ExecutionPlan.created_at.desc())
            ).first()

            if execution_plan:
                execution_plan.status = status
                execution_plan.updated_at = utc_now_naive()
                self.db.add(execution_plan)
                self.db.commit()
                logger.info(
                    f"[StreamService] ExecutionPlan {execution_plan.id} 状态更新为 {status}"
                )

        await asyncio.to_thread(_write)
