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
from collections.abc import AsyncGenerator, Callable
from typing import Any

from fastapi.responses import StreamingResponse
from langgraph.types import Command
from sqlmodel import Session

from agents.event_stream import sse_payload_to_wire
from config import settings
from crud.run_event import (
    emit_hitl_interrupted,
    emit_plan_updated,
    emit_router_decided,
    emit_run_completed,
    emit_run_failed,
)
from models import AgentRun, RunStatus, Thread
from models.enums import TaskStatus
from services.chat.frame_recorder import get_frame_recorder
from services.chat.parts.event_builders import EventBuildersMixin
from services.chat.parts.event_transform import EventTransformMixin
from services.chat.parts.persistence import PersistenceMixin
from services.chat.stream_pipeline import StreamPipeline
from services.mcp_tools_service import mcp_tools_service
from utils.error_codes import ErrorCode
from utils.exceptions import AppError
from utils.logger import logger, set_run_id

# 允许产生 message.delta / message.thinking 的节点白名单。
# - aggregator：复杂模式的最终聚合回复
# - direct_reply：简单模式的回复（内容经 on_chat_model_stream 逐字送达，
#   是 simple 模式唯一的流式来源）
# 其余节点（commander/expert/router）的产出经 sse_event 通道直达前端。


def _build_isolated_thread_id(thread_id: str, run_id: str | None) -> str:
    """确定性隔离 checkpoint thread_id：`{thread_id}_{run_id}`（无 run 时退回原 id）。

    首跑与恢复各自从请求参数即可重建同一个 id——这是 B3b（checkpoint 对齐业务
    thread）推迟期间的唯一契约，此前两条流各写一遍 f-string 靠注释维持同步。
    """
    return f"{thread_id}_{run_id}" if run_id else thread_id


class StreamService(EventBuildersMixin, PersistenceMixin, EventTransformMixin):
    """流式处理服务。

    P3-2 增量拆分：事件构建/运行状态助手（parts/event_builders.py）已迁出（Mixin 组合），
    公开接口不变。
    """

    # producer 私有会话工厂：调用后必须得到 async context manager
    # （SessionFactory() 本身即 async CM 形态；测试注入同款包装）
    _producer_session_factory: Callable[[], object] = staticmethod(
        lambda: __import__("database").SessionFactory()
    )

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

    async def _heartbeat_line(self, run_id: str | None) -> str:
        """静默超时线：心跳保活 + 顺带的取消/超预算检查（两条流共用管道的 on_timeout 回调）。

        run_id 为 None（无持久化的裸流）时跳过检查只给心跳线。
        消费者侧回调与 producer 并发——**独立短会话**，绝不共用 self.db
        （那是 producer 私有会话，async 下并发共用会炸事务状态）。
        """
        if run_id:
            async with self._producer_session_factory() as ops:
                await self._touch_agent_run(ops, run_id)
                await self._raise_if_run_cancelled(ops, run_id)
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
        - `await _run_graph()`：领域正文——跑图 + 暂停检测 + 落库/账本/状态更新
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

        from agents.graph_builder import create_smart_router_workflow
        from services.chat.stream_hub import get_stream_hub

        # 日志上下文在 create_task 之前设好：create_task 复制当前 context，
        # producer（含后台继续执行的那段）里的日志行才会带 run= 字段
        # 断连语义（StreamPipeline）下 producer 会转后台继续，而请求级 Session
        # 随请求结束关闭并把 ORM 实例过期——producer 体内（含异常处理器）一律
        # 用此处捕获的裸值，禁止再摸 agent_run 属性。2026-09-26 e2e 实测：
        # 首帧断连后 agent_run.id 抛 DetachedInstanceError，图驱动被杀、
        # run 永久卡 running 成僵尸（租约仍被 supervisor 续，直到 deadline 兜底）
        run_id = agent_run.id
        set_run_id(run_id)

        # 共享管道（事件出口/producer/消费循环/断连语义），与恢复流同一实现；
        # frames/hub 从本模块取（M4 回归测试桩的就是这里的符号）
        pipeline = StreamPipeline(
            run_id=run_id,
            stream_timeout=settings.stream_timeout,
            frames=get_frame_recorder(),
            hub=get_stream_hub(),
        )

        async def _run_graph():
            actual_message_id = message_id or str(uuid.uuid4())
            # 复杂模式聚合消息 id（run 创建时生成，随 state 贯穿）：流式 delta
            # 与 aggregator 落库同源；简单模式（direct_reply）不消费
            aggregate_message_id = initial_state.get("aggregate_message_id") or str(uuid.uuid4())
            full_response = ""
            router_decision = "simple"
            await self._update_agent_run_status(run_id, RunStatus.RUNNING, current_node="router")

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
            isolated_thread_id = _build_isolated_thread_id(thread_id, run_id)
            config = {
                "recursion_limit": settings.recursion_limit,
                "configurable": {
                    "thread_id": isolated_thread_id,
                    "stream_queue": stream_queue,
                    "mcp_tools": mcp_tools,  # 🔥 MCP: 注入动态工具
                    "graph_max_concurrency": await resolve_graph_max_concurrency(self.db),
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

                    await self._raise_if_run_cancelled(self.db, run_id)
                    await self._sync_run_progress_from_token(self.db, token, run_id)

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
                        token, actual_message_id, reasoning_parts, aggregate_message_id
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
                        await self._update_thread_mode(thread_id, router_decision, run_id=run_id)
                        # 🔥 写入 router_decided 事件到账本
                        emit_router_decided(
                            self.db,
                            run_id=run_id,
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
                await self._mark_agent_run_failed(run_id, str(e))
                # 🔥 写入 run_failed 事件到账本
                emit_run_failed(
                    self.db,
                    run_id=run_id,
                    thread_id=thread_id,
                    error_code=str(e.code) if e.code else None,
                    error_message=str(e),
                )
                await self.db.commit()
                await pipeline.emit(self._build_error_event(ErrorCode.GRAPH_ERROR, str(e)))
                return
            except Exception as e:
                logger.error(f"[StreamService] 流式处理异常: {e}", exc_info=True)
                await self._mark_agent_run_failed(run_id, str(e))
                # 🔥 写入 run_failed 事件到账本
                emit_run_failed(
                    self.db,
                    run_id=run_id,
                    thread_id=thread_id,
                    error_message=str(e),
                )
                await self.db.commit()
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
                plan_version = await self._get_plan_version(thread_id)
                execution_plan = await self._get_latest_execution_plan(thread_id)

                # 🔥 写入 hitl_interrupted 事件到账本
                emit_hitl_interrupted(
                    self.db,
                    run_id=run_id,
                    thread_id=thread_id,
                    execution_plan_id=execution_plan.id if execution_plan else None,
                    plan_version=plan_version,
                )
                await self.db.commit()

                await self._update_agent_run_status(
                    run_id,
                    RunStatus.WAITING_FOR_APPROVAL,
                    current_node="waiting_for_approval",
                )
                # 🔥 HITL 等待期挂起执行预算（用户思考时间不消耗 deadline）
                from services.chat.run_lifecycle import pause_deadline

                await pause_deadline(self.db, run_id)
                # 审批卡必须走 emit（进持久帧）：断连期间错过它的话，重连时
                # resume 端点的补放能把卡片带回来
                await pipeline.emit(
                    self._build_human_interrupt_event(
                        thread_id,
                        current_plan,
                        plan_version,
                        run_id=run_id,
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
                        await self._mark_agent_run_failed(run_id, persist_error)
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
                    run_id=run_id,
                    thinking_text="".join(reasoning_parts) or None,
                )
                await self._update_agent_run_status(
                    run_id, RunStatus.COMPLETED, current_node="done"
                )
                # 🔥 写入 run_completed 事件到账本
                emit_run_completed(
                    self.db,
                    run_id=run_id,
                    thread_id=thread_id,
                )
                await self.db.commit()

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

            await cleanup_terminal_run(thread_id, [run_id])

        # producer 分离任务在调用方同步上下文里起（保住日志上下文复制）；
        # 收尾三连/心跳/断连语义全部由共享管道承担
        async def _run_graph_with_own_session():
            # producer 私有会话：断连转后台后 run 的落库与请求级 Session 生命周期
            # 解耦——async 下请求收尾 close 与 producer 事务并发会炸
            # IllegalStateChange/"transaction is closed"（2026-09-27 e2e 场景 A 实抓）。
            # 缝契约：工厂调用返回 async CM（SessionFactory() 本身即此形态）
            async with self._producer_session_factory() as producer_session:
                self.db = producer_session
                await _run_graph()

        pipeline.start(_run_graph_with_own_session)

        from services.chat.run_lifecycle import sse_stream_headers

        return StreamingResponse(
            pipeline.events(on_timeout=lambda: self._heartbeat_line(run_id)),
            media_type="text/event-stream",
            headers=sse_stream_headers(thread_id, run_id),
        )

    async def handle_langgraph_sync(
        self,
        initial_state: dict,
        thread_id: str,
        thread: Thread,
        agent_run: AgentRun,
        user_message: str,
        message_id: str | None = None,
    ) -> dict:
        """LangGraph 非流式处理（内部使用流式）。

        拍板（2026-09-13）：sync 路径保留为公开 API 语义（stream=false 可用，
        供脚本/集成调用）；产品前端恒走流式，不在此路径上叠加新功能。
        """
        # 非流式也使用流式获取，但返回完整结果
        full_response = ""

        # 在方法内部导入
        from agents.graph_builder import create_smart_router_workflow
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
                message_id=message_id or str(uuid.uuid4()),
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

    async def execute_langgraph_stream(
        self,
        thread_id: str,
        stream_queue: asyncio.Queue,
        sse_queue: asyncio.Queue,
        realtime_queue: asyncio.Queue,
        updated_plan: list[dict] | None = None,
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
            run_id: 关联的 AgentRun ID（可选）

        Yields:
            SSE 事件字符串
        """
        # 在方法内部导入，防止循环引用
        from agents.graph_builder import create_smart_router_workflow
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
                "graph_max_concurrency": await resolve_graph_max_concurrency(self.db),
            },
        }
        logger.info(f"[StreamService] 恢复流程使用隔离的 thread_id: {isolated_thread_id}")

        # 聚合消息 id：从 checkpoint 读（run 创建时写进 state，单一来源）；
        # 极老的中断 run（字段未出生前打的断点）读不到 → 现生成并回写，
        # 保证流式 delta 与 aggregator 落库同 id（两处各造会重复成两条消息）
        snapshot = await graph.aget_state(config)
        aggregate_message_id = (snapshot.values or {}).get("aggregate_message_id") or str(
            uuid.uuid4()
        )
        if "aggregate_message_id" not in (snapshot.values or {}):
            await graph.aupdate_state(config, {"aggregate_message_id": aggregate_message_id})

        # 如果提供了更新后的计划，应用它
        if updated_plan:
            await self._apply_updated_plan(graph, config, updated_plan)
            if run_id:
                execution_plan = await self._get_execution_plan_by_run(run_id)
                if execution_plan:
                    emit_plan_updated(
                        self.db,
                        run_id=run_id,
                        thread_id=thread_id,
                        execution_plan_id=execution_plan.id,
                        plan_version=int(execution_plan.plan_version),
                        task_count=len(updated_plan),
                    )
                    await self.db.commit()
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
                await self._raise_if_run_cancelled(self.db, run_id)

            # 执行一轮 LangGraph
            async for token in graph.astream_events(resume_input, config, version="v2"):
                # 🔥 修复：token 可能是字符串，跳过非字典类型
                if not isinstance(token, dict):
                    continue

                if run_id:
                    await self._raise_if_run_cancelled(self.db, run_id)
                if run_id:
                    await self._sync_run_progress_from_token(self.db, token, run_id)

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

                # HITL 恢复恒为复杂模式：请求侧 message_id 不存在（None），
                # 正文流只来自 aggregator（挂聚合消息 id）
                event_str = self.transform_langgraph_event(token, None, None, aggregate_message_id)
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

                await finalize_run_completed(self.db, run_id, thread_id)

        # producer 分离任务在调用方上下文里起（日志上下文复制）；
        # 断连不杀 producer / 心跳 / finally 三连收尾由共享管道承担
        async def _stream_body_with_own_session():
            # 与首跑流同款私有会话缝（见 _run_graph_with_own_session 的注释）
            async with self._producer_session_factory() as producer_session:
                self.db = producer_session
                await _stream_body()

        pipeline.start(_stream_body_with_own_session)
        async for event in pipeline.events(
            on_timeout=lambda: self._heartbeat_line(run_id), on_drained=_on_drained
        ):
            yield event

        # message.done 由 aggregator_node 通过 event_queue 发送
        # 这里不再重复发送
