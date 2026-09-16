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
from services.chat.frame_recorder import get_frame_recorder
from services.chat.parts.custom_agent import CustomAgentMixin
from services.chat.parts.event_builders import EventBuildersMixin
from services.chat.stream_pipeline import StreamPipeline
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


def _build_isolated_thread_id(thread_id: str, run_id: str | None) -> str:
    """确定性隔离 checkpoint thread_id：`{thread_id}_{run_id}`（无 run 时退回原 id）。

    首跑与恢复各自从请求参数即可重建同一个 id——这是 B3b（checkpoint 对齐业务
    thread）推迟期间的唯一契约，此前两条流各写一遍 f-string 靠注释维持同步。
    """
    return f"{thread_id}_{run_id}" if run_id else thread_id


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

    def _heartbeat_line(self, run_id: str | None) -> str:
        """静默超时线：心跳保活 + 顺带的取消/超预算检查（两条流共用管道的 on_timeout 回调）。

        run_id 为 None（无持久化的裸流）时跳过检查只给心跳线。
        """
        if run_id:
            self._touch_agent_run(run_id)
            self._raise_if_run_cancelled(run_id)
        return self._build_heartbeat_event()

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

        结构（与恢复流 `execute_langgraph_stream` 共享同一套管道 `stream_pipeline`）：
        - `_run_graph()`：领域正文——跑图 + 暂停检测 + 落库/账本/状态更新
          （首跑特有的职责：router 决策检测、HITL 中断检测、结果落库）
        - `StreamPipeline`：管道四件套——事件出口（seq → hub 广播 → 持久帧 →
          队列）、producer 外壳（finally 三连收尾）、消费循环（心跳保活）、
          断连语义（不杀 producer）

        **为什么要把图执行放进分离任务**：以前它就跑在这个 SSE 生成器里，客户端一断连
        Starlette 就 `aclose()` 生成器 → 图循环被放弃 → **规划阶段的 run 当场死亡**
        （即使只是刷新页面）。分离之后断连只影响传输，任务照常跑完并在审批点停下。
        断连期间的事件同时进了 hub 与持久帧，重连时由 resume 端点补放——包括
        `human.interrupt`，也就是**审批卡能自己回来**。
        """
        # 在方法内部导入 LangGraph，防止循环引用

        from agents.graph import create_smart_router_workflow
        from services.chat.stream_hub import get_stream_hub

        # 日志上下文在 create_task 之前设好：create_task 复制当前 context，
        # producer（含后台继续执行的那段）里的日志行才会带 run= 字段
        set_run_id(agent_run.id)

        # 共享管道（事件出口/producer/消费循环/断连语义），与恢复流同一实现；
        # frames/hub 从本模块取（M4 回归测试桩的就是这里的符号）
        pipeline = StreamPipeline(
            run_id=agent_run.id,
            stream_timeout=settings.stream_timeout,
            frames=get_frame_recorder(),
            hub=get_stream_hub(),
        )

        async def _run_graph():
            actual_message_id = message_id or str(uuid.uuid4())
            full_response = ""
            router_decision = "simple"
            await self._update_agent_run_status(
                agent_run.id, RunStatus.RUNNING, current_node="router"
            )

            # 收集任务列表和产物
            # 按 db uuid 归拢任务产物（同一任务可能被多轮/多事件重复上报）
            collected_tasks: dict[str, dict] = {}
            expert_artifacts = {}

            # 🔥 MCP: 获取动态工具
            mcp_tools = await self._get_mcp_tools()

            # 共享 checkpointer（绑定连接池，按操作借还连接，不再每流独占）
            from utils.db import get_shared_checkpointer

            graph = create_smart_router_workflow(checkpointer=get_shared_checkpointer())

            stream_queue = asyncio.Queue()

            # 并发上限（同层就绪任务的并行度）：设置表优先、env 兜底，默认串行。
            # 由 wave_scheduler 的 route_wave 读取（决定本轮 Send 扇出几个任务）。
            from services.run_concurrency import resolve_graph_max_concurrency

            # 确定性的隔离 thread_id：新消息不受旧 checkpoint 影响，恢复可重建（见 helper）
            isolated_thread_id = _build_isolated_thread_id(thread_id, agent_run.id)
            config = {
                "recursion_limit": settings.recursion_limit,
                "configurable": {
                    "thread_id": isolated_thread_id,
                    "stream_queue": stream_queue,
                    "mcp_tools": mcp_tools,  # 🔥 MCP: 注入动态工具
                    "graph_max_concurrency": resolve_graph_max_concurrency(self.db),
                },
            }
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
                            await pipeline.emit(event_str)
                        continue

                    # 处理消息流、task 事件等
                    event_str = self.transform_langgraph_event(
                        token, actual_message_id, reasoning_parts
                    )
                    if event_str:
                        await pipeline.emit(event_str)

                    # 收集任务执行结果
                    self._collect_execution_results(token, collected_tasks, expert_artifacts)

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
                    await pipeline.emit(self._build_error_event(ErrorCode.RUN_CANCELLED, e.message))
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
                await pipeline.emit(self._build_error_event(ErrorCode.GRAPH_ERROR, str(e)))
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
                await pipeline.emit(self._build_error_event(ErrorCode.GRAPH_ERROR, str(e)))
                return

            # HITL 检测：`interrupt()` 把「停在审批点等人」变成了**原生状态**。
            # `snapshot.tasks[].interrupts` 非空即表示图正停在某个 interrupt 上。
            # 这取代了原先的启发式（`task_list` 非空 && 任务游标停在 0
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
                # 审批卡必须走 emit（进持久帧）：断连期间错过它的话，重连时
                # resume 端点的补放能把卡片带回来
                await pipeline.emit(
                    self._build_human_interrupt_event(
                        thread_id,
                        current_plan,
                        plan_version,
                        run_id=agent_run.id,
                        execution_plan_id=execution_plan.id if execution_plan else None,
                    )
                )
                # HITL 中断是本轮流的正常终态：发 [DONE] 让前端干净收尾
                # （恢复走独立的 /chat/resume 请求）
                await pipeline.emit_transport("data: [DONE]\n\n")
                return  # 结束本轮执行，等待用户通过 /chat/resume 恢复

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
                        task_list=list(collected_tasks.values()),
                    )
                    if persist_error:
                        logger.error("[StreamService] %s", persist_error)
                        await self._mark_agent_run_failed(agent_run.id, persist_error)
                        await pipeline.emit(
                            self._build_error_event(ErrorCode.GRAPH_ERROR, persist_error)
                        )
                        return

                # 保存到数据库
                await self._save_langgraph_result(
                    thread_id=thread_id,
                    thread=thread,
                    user_message=user_message,
                    last_message=last_message,
                    router_decision=router_decision,
                    task_list=list(collected_tasks.values()),
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
                await pipeline.emit(
                    self._build_message_done_event(actual_message_id, full_response)
                )
            # 复杂模式：message.done 已由 aggregator 通过 event_queue 发送

            # 传输级完成标记：前端据此区分"正常结束"与"异常断流"
            await pipeline.emit_transport("data: [DONE]\n\n")

            # 本轮执行已把最终结果落库，这里清理本次运行的瞬态数据（checkpoint +
            # SSE 传输帧）：图的最终 checkpoint 写入要等连接归还时才全部落地，
            # 删除必须放在图执行之后（放在其前会"删后复现"，实测如此）
            from utils.db import cleanup_terminal_run

            await cleanup_terminal_run(thread_id, [agent_run.id])

        # producer 分离任务在调用方同步上下文里起（保住日志上下文复制）；
        # 收尾三连/心跳/断连语义全部由共享管道承担
        pipeline.start(_run_graph)

        from services.chat.run_lifecycle import sse_stream_headers

        return StreamingResponse(
            pipeline.events(on_timeout=lambda: self._heartbeat_line(agent_run.id)),
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
                # 时刻字段**只在这两个来源没写过时才补**（`or` 语义，不能直接赋值）：
                # 真实的 started_at/completed_at/duration_ms 由执行期写入（节点开始时的
                # async_mark_subtask_running + 收尾的 save_expert_execution_result），
                # 而这里回填的是图状态里的值——它通常根本没有这两个键，直接赋值会把
                # 已写好的时刻**清成 NULL**（这正是 started_at 长期为空的第二个原因）。
                db_subtask.started_at = subtask.get("started_at") or db_subtask.started_at
                db_subtask.completed_at = subtask.get("completed_at") or db_subtask.completed_at
                db_subtask.duration_ms = subtask.get("duration_ms") or db_subtask.duration_ms
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

    def _collect_execution_results(
        self, token, collected_tasks: dict[str, dict], expert_artifacts: dict
    ):
        """收集 LangGraph 执行结果（从 **任务产物** 读取）。

        产物通道 `task_outcomes` 是执行分支的唯一出口（见 `agents/task_outcome.py`），
        每个任务恰好一份、键为依赖空间 key。这里的写入按 **db uuid upsert**：
        一个产物可能在两个事件里出现（执行分支节点自身、以及包着它的子图节点），
        也可能被重跑覆盖——按 key 覆盖天然幂等，不再依赖「最后一条事件赢」。
        """
        # 🔥 修复：跳过非字典类型的 token
        if not isinstance(token, dict):
            return

        event = token.get("event", "")

        if event == "on_chain_end":
            output = token.get("data", {}).get("output", {}) or {}
            if not (output and isinstance(output, dict)):
                return
            outcomes = output.get("task_outcomes")
            if not isinstance(outcomes, dict) or not outcomes:
                return

            for outcome in outcomes.values():
                if not isinstance(outcome, dict):
                    continue
                task_id = outcome.get("db_uuid") or outcome.get("task_key")
                collected_tasks[task_id] = {
                    "id": task_id,
                    "expert_type": outcome.get("expert_type"),
                    "status": outcome.get("status"),
                    "description": outcome.get("description", ""),
                    "output_result": outcome.get("output"),
                    "input_data": outcome.get("input_data", {}),
                    "started_at": outcome.get("started_at"),
                    "completed_at": outcome.get("completed_at"),
                    "artifact": outcome.get("artifact"),
                }

                # 收集 artifacts（同一 artifact_id 只收一次：产物会被两个事件携带）
                artifact_data = outcome.get("artifact")
                if task_id and artifact_data:
                    bucket = expert_artifacts.setdefault(task_id, [])
                    artifact_id = artifact_data.get("artifact_id")
                    if not any(item.get("artifact_id") == artifact_id for item in bucket):
                        bucket.append(artifact_data)
                        logger.info(
                            "[_collect_execution_results] ✅ artifacts 已收集: task_id=%s, count=%d",
                            task_id,
                            len(bucket),
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

        # 与初始执行相同的确定性 isolated_thread_id（同一 helper，格式锁进代码）
        isolated_thread_id = _build_isolated_thread_id(thread_id, run_id)
        from services.run_concurrency import resolve_graph_max_concurrency

        config = {
            "recursion_limit": settings.recursion_limit,
            "configurable": {
                "thread_id": isolated_thread_id,
                "stream_queue": realtime_queue,
                "mcp_tools": mcp_tools,  # 🔥 MCP: 注入动态工具
                # 续跑必须与初始执行同口径，否则「审批后剩下的任务」会悄悄退回串行
                "graph_max_concurrency": resolve_graph_max_concurrency(self.db),
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

        # 🔥 B6 断线续传：统一事件出口（seq → hub 广播 → 持久帧 → 消费队列）。
        # 管道与首跑流同一实现（stream_pipeline）；队列沿用 recovery 传入的
        # sse_queue（本方法签名不变）。
        from services.chat.stream_hub import get_stream_hub

        pipeline = StreamPipeline(
            run_id=run_id,
            stream_timeout=settings.stream_timeout,
            frames=get_frame_recorder(),
            hub=get_stream_hub(),
            queue=sse_queue,
        )

        async def _stream_body():
            """恢复流的领域正文：从审批点续跑到聚合完成。

            异常**原样上抛**（管道不捕获）：此前 `except Exception: 记日志`
            的写法会把一次彻底失败的 HITL 恢复粉饰成成功（消费者收到干净的
            [DONE]、无 error 事件、无 message.done），recovery_service 里专门
            写好的「标失败 + 推 RESUME_ERROR」分支永远不会执行
            （tests/test_producer_failure_propagates.py 锁定）。
            """
            nonlocal aggregator_executed
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
                        await pipeline.emit(custom_str)
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
                    await pipeline.emit(event_str)

                    # 🔥 如果发送了 message.done 事件，说明 aggregator 已完成
                    if "message.done" in event_str:
                        logger.info("[Producer] 已发送 message.done，标记 aggregator 完成")
                        aggregator_executed = True

                # 收集 artifacts（产物通道，与初始执行路径同一口径）
                data = token.get("data", {}) or {}
                output = data.get("output", {}) or {}
                outcomes = output.get("task_outcomes") if isinstance(output, dict) else None
                if isinstance(outcomes, dict):
                    for _key, outcome in outcomes.items():
                        artifact = (outcome or {}).get("artifact")
                        if not artifact:
                            continue
                        await stream_queue.put(
                            {
                                "type": "artifact",
                                "task_id": (outcome or {}).get("db_uuid") or _key,
                                "data": artifact,
                            }
                        )

        async def _on_drained():
            # 队列排空且 producer 正常结束：聚合已执行则做完成收尾
            # （单一实现在 run_lifecycle.finalize_run_completed）
            if run_id and aggregator_executed:
                from services.chat.run_lifecycle import finalize_run_completed

                await asyncio.to_thread(finalize_run_completed, self.db, run_id, thread_id)

        # producer 分离任务在调用方上下文里起（日志上下文复制）；
        # 断连不杀 producer / 心跳 / finally 三连收尾由共享管道承担
        pipeline.start(_stream_body)
        async for event in pipeline.events(
            on_timeout=lambda: self._heartbeat_line(run_id), on_drained=_on_drained
        ):
            yield event

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
        - 下一个该跑谁**不在这里算**：由 `agents/plan_waves.py` 按依赖判定（C2 起）

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

        # 更新 LangGraph 状态（保留已完成任务的结果）
        # 计划的 approve 合并语义：按 id 保留已完成任务的 output_result / task_id、
        # 清理指向已删除任务的依赖。
        #
        # 不再伪造 HumanMessage 触发续跑：那是在静态中断（interrupt_before）下
        # 让图「动起来」的权宜手段，会把一条假用户消息写进会话历史。现在由
        # `Command(resume=...)` 触发续跑，图从断点继续，无需任何伪造输入。
        #
        # 不再重算任务游标（C2 已删除 current_task_index）：改完计划后跑哪些任务
        # 由 `plan_waves` 按依赖重新判定——「下一个该跑谁」只有一处答案。
        state_update = {
            "task_list": merged_plan,
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
        """获取线程最新的 ExecutionPlan（单一实现在 crud.execution_plan）。"""
        from crud.execution_plan import get_latest_execution_plan_by_thread

        return get_latest_execution_plan_by_thread(self.db, thread_id)

    def _get_execution_plan_by_run(self, run_id: str) -> ExecutionPlan | None:
        """按 run_id 获取 ExecutionPlan（单一实现在 crud.execution_plan）。"""
        from crud.execution_plan import get_execution_plan_by_run

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
