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
from datetime import datetime
from typing import Any

from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, BaseMessage
from sqlmodel import Session, select

from agents.event_stream import sse_payload_to_wire
from config import settings
from crud.agent_run import (
    mark_run_failed_by_id,
    mark_run_timed_out_by_id,
    touch_run_heartbeat_by_id,
    update_run_status_by_id,
)
from crud.run_event import (
    emit_hitl_interrupted,
    emit_plan_updated,
    emit_router_decided,
    emit_run_completed,
    emit_run_failed,
)
from models import AgentRun, CustomAgent, ExecutionPlan, RunStatus, Thread
from providers_config import get_model_config, get_provider_api_key, get_provider_config
from services.mcp_tools_service import mcp_tools_service
from utils.error_codes import ErrorCode
from utils.exceptions import AppError
from utils.llm_factory import get_llm_instance
from utils.logger import logger
from utils.sse_builder import (
    build_error_event,
    build_heartbeat_event,
    build_human_interrupt_event,
    build_message_delta_event,
    build_message_done_event,
    build_message_thinking_event,
)


class StreamService:
    """流式处理服务"""

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

    # ============================================================================
    # 自定义智能体流式处理
    # ============================================================================

    async def handle_custom_agent_stream(
        self,
        custom_agent: CustomAgent,
        messages: list[BaseMessage],
        thread_id: str,
        thread: Thread,
        agent_run: AgentRun,
        message_id: str | None = None,
    ) -> StreamingResponse:
        """
        自定义智能体流式响应处理

        Args:
            custom_agent: 自定义智能体配置
            messages: LangChain 消息列表
            thread_id: 线程ID
            thread: 线程实例
            message_id: 前端传入的消息ID

        Returns:
            StreamingResponse SSE流
        """

        async def event_generator():
            full_response = ""
            reasoning_buffer = ""  # 模型思考过程（reasoning_content）累积，用于持久化
            actual_message_id = message_id or str(uuid.uuid4())

            # 心跳配置 - 从 config 导入
            last_heartbeat_time = datetime.now()

            try:
                # 构建 LLM
                self._update_agent_run_status(
                    agent_run.id, RunStatus.RUNNING, current_node="custom_agent"
                )
                llm = await self._build_custom_agent_llm(custom_agent)

                # 检索长期记忆
                messages_with_system = await self._inject_memories(
                    custom_agent, messages, thread.user_id
                )

                # 获取流迭代器
                iterator = llm.astream(messages_with_system)

                async def get_next_chunk():
                    try:
                        return await asyncio.wait_for(
                            iterator.__anext__(), timeout=settings.heartbeat_interval
                        )
                    except StopAsyncIteration:
                        return None

                while True:
                    self._raise_if_run_cancelled(agent_run.id)
                    try:
                        chunk = await get_next_chunk()
                        if chunk is None:
                            break

                        content = chunk.content
                        if content:
                            full_response += content
                            yield self._build_message_delta_event(actual_message_id, content)

                        # 思考过程流式块（思考 chunk 通常无正文内容，需独立于 content 判断）
                        reasoning = getattr(chunk, "additional_kwargs", {}).get(
                            "reasoning_content", ""
                        )
                        if reasoning:
                            reasoning_buffer += reasoning
                            yield self._build_message_thinking_event(actual_message_id, reasoning)

                    except TimeoutError:
                        # 心跳保活
                        self._touch_agent_run(agent_run.id, current_node="custom_agent")
                        yield self._build_heartbeat_event()
                        last_heartbeat_time = datetime.now()
                        continue

                    # 强制心跳
                    current_time = datetime.now()
                    time_since_last = (current_time - last_heartbeat_time).total_seconds()
                    if time_since_last >= settings.force_heartbeat_interval:
                        self._touch_agent_run(agent_run.id, current_node="custom_agent")
                        yield self._build_heartbeat_event()
                        last_heartbeat_time = current_time

            except AppError as e:
                if e.code == ErrorCode.RUN_CANCELLED:
                    yield self._build_error_event(ErrorCode.RUN_CANCELLED, e.message)
                    return
                self._mark_agent_run_failed(agent_run.id, str(e))
                yield self._build_error_event(ErrorCode.STREAM_ERROR, str(e))
                return
            except Exception as e:
                self._mark_agent_run_failed(agent_run.id, str(e))
                yield self._build_error_event(ErrorCode.STREAM_ERROR, str(e))
                return

            # 解析 thinking 并保存消息（优先原生 reasoning_content，回退 <think> 标签解析）
            from utils.thinking_parser import build_thinking_data, parse_thinking

            thinking_data = build_thinking_data(reasoning_buffer) if reasoning_buffer else None
            if thinking_data is None:
                _, thinking_data = parse_thinking(full_response)

            # 使用 thread_service 保存消息
            await self.thread_service.save_assistant_message(
                thread_id=thread_id,
                content=full_response,
                thinking_data=thinking_data,
                message_id=actual_message_id,
            )

            # 发送完成事件
            self._update_agent_run_status(agent_run.id, RunStatus.COMPLETED, current_node="done")
            yield self._build_message_done_event(actual_message_id, full_response)
            # 传输级完成标记：前端据此区分"正常结束"与"异常断流"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "X-Thread-ID": thread_id,
                "X-Run-ID": agent_run.id,
            },
        )

    async def handle_custom_agent_sync(
        self,
        custom_agent: CustomAgent,
        messages: list[BaseMessage],
        thread_id: str,
        thread: Thread,
        agent_run: AgentRun,
        message_id: str | None = None,
    ) -> dict:
        """
        自定义智能体非流式处理（兼容旧版）

        实际内部使用流式获取结果，但返回完整响应
        """
        full_response = ""
        reasoning_buffer = ""  # 模型思考过程（reasoning_content）累积，用于持久化
        actual_message_id = message_id or str(uuid.uuid4())

        try:
            self._update_agent_run_status(
                agent_run.id, RunStatus.RUNNING, current_node="custom_agent"
            )
            llm = await self._build_custom_agent_llm(custom_agent)
            messages_with_system = await self._inject_memories(
                custom_agent, messages, thread.user_id
            )

            # 流式获取完整响应
            async for chunk in llm.astream(messages_with_system):
                self._raise_if_run_cancelled(agent_run.id)
                if chunk.content:
                    full_response += chunk.content
                reasoning = getattr(chunk, "additional_kwargs", {}).get("reasoning_content", "")
                if reasoning:
                    reasoning_buffer += reasoning

        except AppError as e:
            if e.code == ErrorCode.RUN_CANCELLED:
                raise
            self._mark_agent_run_failed(agent_run.id, str(e))
            raise AppError(f"自定义智能体调用失败: {str(e)}") from e
        except Exception as e:
            self._mark_agent_run_failed(agent_run.id, str(e))
            raise AppError(f"自定义智能体调用失败: {str(e)}") from e

        # 解析 thinking 并保存（优先原生 reasoning_content，回退 <think> 标签解析）
        from utils.thinking_parser import build_thinking_data, parse_thinking

        thinking_data = build_thinking_data(reasoning_buffer) if reasoning_buffer else None
        if thinking_data is None:
            _, thinking_data = parse_thinking(full_response)

        await self.thread_service.save_assistant_message(
            thread_id=thread_id,
            content=full_response,
            thinking_data=thinking_data,
            message_id=actual_message_id,
        )

        self._update_agent_run_status(agent_run.id, RunStatus.COMPLETED, current_node="done")
        return {"role": "assistant", "content": full_response, "thread_id": thread_id}

    async def _build_custom_agent_llm(self, custom_agent: CustomAgent):
        """构建自定义智能体的 LLM 实例"""
        model_id = custom_agent.model_id or "deepseek-v4-flash"
        model_config = get_model_config(model_id)

        if model_config:
            provider = model_config.get("provider")
            actual_model = model_config.get("model", model_id)
            provider_config = get_provider_config(provider)

            if not provider_config:
                raise ValueError(f"提供商 {provider} 未配置")

            if not get_provider_api_key(provider):
                raise ValueError(f"提供商 {provider} 的 API Key 未设置")

            temperature = model_config.get("temperature", 0.7)

            return get_llm_instance(
                provider=provider, model=actual_model, streaming=True, temperature=temperature
            )
        else:
            # Fallback
            return get_llm_instance(streaming=True, model=model_id, temperature=0.7)

    async def _inject_memories(
        self, custom_agent: CustomAgent, messages: list[BaseMessage], user_id: str
    ) -> list:
        """注入长期记忆到 system prompt"""
        from services.memory_manager import memory_manager

        user_query = messages[-1].content if messages else ""
        relevant_memories = await memory_manager.search_relevant_memories(
            user_id, user_query, limit=5
        )

        system_prompt = custom_agent.system_prompt
        if relevant_memories:
            system_prompt += (
                f"\n\n【关于用户的已知信息】:\n{relevant_memories}\n(请在回答时自然地利用这些信息)"
            )

        result = [("system", system_prompt)]
        result.extend(messages)
        return result

    # ============================================================================
    # LangGraph 复杂模式流式处理
    # ============================================================================

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
            actual_message_id = message_id or str(uuid.uuid4())
            full_response = ""
            router_decision = "simple"
            self._update_agent_run_status(agent_run.id, RunStatus.RUNNING, current_node="router")

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
                "recursion_limit": 100,
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
                        emit_router_decided(
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
                self._mark_agent_run_failed(agent_run.id, str(e))
                # 🔥 写入 run_failed 事件到账本
                emit_run_failed(
                    self.db,
                    run_id=agent_run.id,
                    thread_id=thread_id,
                    error_code=str(e.code) if e.code else None,
                    error_message=str(e),
                )
                self.db.commit()
                yield self._build_error_event(ErrorCode.GRAPH_ERROR, str(e))
                return
            except Exception as e:
                logger.error(f"[StreamService] 流式处理异常: {e}", exc_info=True)
                self._mark_agent_run_failed(agent_run.id, str(e))
                # 🔥 写入 run_failed 事件到账本
                emit_run_failed(
                    self.db,
                    run_id=agent_run.id,
                    thread_id=thread_id,
                    error_message=str(e),
                )
                self.db.commit()
                yield self._build_error_event(ErrorCode.GRAPH_ERROR, str(e))
                return

            # 🔥🔥🔥 HITL 检测：检查是否处于 interrupt 状态
            # 获取当前状态，检查是否有待执行的任务（被 interrupt 暂停）
            final_state = await graph.aget_state(config)
            state_values = final_state.values if final_state else {}

            # 检查是否有任务列表但未完成（说明被 interrupt 暂停）
            task_list = state_values.get("task_list", [])
            current_task_index = state_values.get("current_task_index", 0)

            # 如果存在任务列表且当前任务索引为0（未开始执行），说明被 HITL 中断
            if self._should_wait_for_human_approval(
                task_list=task_list,
                current_task_index=current_task_index,
                collected_task_list=collected_task_list,
            ):
                logger.info("[StreamService] HITL 中断检测：任务规划完成，等待用户审核")

                # 🔥 方案1：更新 ExecutionPlan 状态为 waiting_for_approval
                self._update_execution_plan_status(thread_id, "waiting_for_approval")

                # 构建当前计划数据
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
                emit_hitl_interrupted(
                    self.db,
                    run_id=agent_run.id,
                    thread_id=thread_id,
                    execution_plan_id=execution_plan.id if execution_plan else None,
                    plan_version=plan_version,
                )
                self.db.commit()

                self._update_agent_run_status(
                    agent_run.id,
                    RunStatus.WAITING_FOR_APPROVAL,
                    current_node="waiting_for_approval",
                )
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
                        self._mark_agent_run_failed(agent_run.id, persist_error)
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
                self._update_agent_run_status(
                    agent_run.id, RunStatus.COMPLETED, current_node="done"
                )
                # 🔥 写入 run_completed 事件到账本
                emit_run_completed(
                    self.db,
                    run_id=agent_run.id,
                    thread_id=thread_id,
                )
                self.db.commit()

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

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "X-Thread-ID": thread_id,
                "X-Run-ID": agent_run.id,
            },
        )

    async def handle_langgraph_sync(
        self,
        initial_state: dict,
        thread_id: str,
        thread: Thread,
        agent_run: AgentRun,
        user_message: str,
    ) -> dict:
        """LangGraph 非流式处理（内部使用流式）"""
        # 非流式也使用流式获取，但返回完整结果
        full_response = ""

        # 在方法内部导入
        from agents.graph import create_smart_router_workflow
        from utils.db import get_shared_checkpointer

        # 🔥 MCP: 获取动态工具
        mcp_tools = await self._get_mcp_tools()
        self._update_agent_run_status(agent_run.id, RunStatus.RUNNING, current_node="router")

        graph = create_smart_router_workflow(checkpointer=get_shared_checkpointer())

        config = {
            "recursion_limit": 100,
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
                    self._mark_agent_run_failed(agent_run.id, persist_error)
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
            self._update_agent_run_status(agent_run.id, RunStatus.COMPLETED, current_node="done")

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
            execution_plan.final_response = last_message.content
            execution_plan.updated_at = datetime.now()
            execution_plan.completed_at = datetime.now()
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
                        created_at=datetime.now(),
                    )

                db_subtask.expert_type = subtask["expert_type"]
                db_subtask.task_description = subtask["description"]
                db_subtask.input_data = subtask.get("input_data", {})
                db_subtask.status = TaskStatus(subtask.get("status", "completed"))
                db_subtask.output_result = subtask.get("output_result")
                db_subtask.started_at = subtask.get("started_at")
                db_subtask.completed_at = subtask.get("completed_at")
                db_subtask.updated_at = datetime.now()
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
                        logger.error(f"[StreamService] 保存 artifacts 失败: {e}", exc_info=True)
                else:
                    logger.warning(
                        f"[StreamService] ⚠️ task_id={task_id} 在 expert_artifacts 中未找到"
                    )

        # 保存 AI 消息（思考过程优先使用原生 reasoning_content，无则回退 <think> 标签解析）
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

    def _should_wait_for_human_approval(
        self,
        *,
        task_list: list[dict],
        current_task_index: int,
        collected_task_list: list[dict],
    ) -> bool:
        """判断复杂模式是否应进入 HITL 审核等待态。"""
        return bool(task_list) and current_task_index == 0 and len(collected_task_list) == 0

    def _raise_if_loop_budget_exhausted(
        self,
        *,
        loop_count: int,
        max_loops: int,
        aggregator_executed: bool,
        run_id: str | None,
    ) -> None:
        """超过图执行循环预算时立即失败，防止无限推进。"""
        if aggregator_executed or loop_count < max_loops:
            return

        if run_id:
            self._mark_agent_run_failed(
                run_id,
                "运行超过最大图循环预算",
                error_code=ErrorCode.LOOP_GUARD_TRIGGERED,
            )

        raise AppError(
            message="运行超过最大图循环预算",
            code=ErrorCode.LOOP_GUARD_TRIGGERED,
            status_code=409,
            details={"run_id": run_id, "max_loops": max_loops},
        )

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
                agent_run.updated_at = datetime.now()
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

        # 🔥 MCP: 获取动态工具
        mcp_tools = await self._get_mcp_tools()

        graph = create_smart_router_workflow(checkpointer=get_shared_checkpointer())

        # 🔥🔥🔥 关键修复：使用与初始执行相同的确定性 isolated_thread_id
        # 格式: {thread_id}_{run_id} - 必须与 handle_langgraph_stream 中的格式一致
        isolated_thread_id = f"{thread_id}_{run_id}" if run_id else thread_id
        config = {
            "recursion_limit": 100,
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
        elif message_id:
            # 普通批准（未修改计划）：图从中断点直接续跑，state 不会经过
            # _apply_updated_plan——单独补写 message_id，保证聚合阶段
            # message.done 与本次流式 delta 使用同一 ID
            await graph.aupdate_state(config, {"message_id": message_id})

            # 🔥🔥🔥 关键修复：外层循环驱动任务执行直到完成
            # LangGraph 的 astream_events 在第一个循环结束后就返回，不会自动继续
            # 需要手动检查状态并驱动后续任务执行

            # 🔥 修复：将 aggregator_executed 定义在 producer 外部，以便外层访问
            aggregator_executed = False

            async def producer():
                nonlocal aggregator_executed
                try:
                    loop_count = 0
                    max_loops = settings.run_max_graph_loops

                    while loop_count < max_loops:
                        if run_id:
                            self._raise_if_run_cancelled(run_id)
                        loop_count += 1

                        # 获取当前状态
                        current_state = await graph.aget_state(config)
                        task_list = current_state.values.get("task_list", [])
                        current_index = current_state.values.get("current_task_index", 0)
                        next_nodes = current_state.next  # 🔥 获取待执行的节点

                        # 检查是否所有任务都完成了，或者 aggregator 已经执行过
                        if current_index >= len(task_list) or aggregator_executed:
                            break

                        # 🔥🔥🔥 关键修复：处理 interrupt_before 导致的任务切换中断
                        # interrupt_before=["expert_dispatcher"] 会在每次到达该节点时中断
                        # 如果 current_index > 0 且 next 包含 "expert_dispatcher"，说明是任务切换
                        if "expert_dispatcher" in next_nodes and current_index > 0:
                            logger.info(
                                f"[Producer] 检测到任务切换中断 (loop {loop_count}, index {current_index}), 继续执行并推送事件"
                            )
                            # 🔥 关键：使用 astream_events 而不是 astream，确保事件被正确推送
                            # astream_events 返回的事件格式与下面主循环一致，可以复用处理逻辑
                            try:
                                async for token in graph.astream_events(None, config, version="v2"):
                                    if not isinstance(token, dict):
                                        continue

                                    if run_id:
                                        self._raise_if_run_cancelled(run_id)
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
                                        event_str = sse_payload_to_wire(token)
                                        if event_str:
                                            await sse_queue.put({"type": "sse", "event": event_str})
                                        continue

                                    # 检测 aggregator 开始执行
                                    if event_type == "on_chain_start" and name == "aggregator":
                                        aggregator_executed = True
                                        logger.info(
                                            f"[Producer-Resume] 检测到 aggregator 开始执行 (loop {loop_count})"
                                        )

                                    if event_type == "on_chain_end":
                                        data = token.get("data", {}) or {}
                                        output = data.get("output", {}) or {}

                                        if name == "aggregator" and output.get("final_response"):
                                            aggregator_executed = True
                                            logger.info(
                                                f"[Producer-Resume] aggregator 执行完成 (loop {loop_count})"
                                            )
                                            break

                                    # 转换并推送事件给前端
                                    event_str = self.transform_langgraph_event(token, message_id)
                                    if event_str:
                                        await sse_queue.put({"type": "sse", "event": event_str})
                                        if "message.done" in event_str:
                                            aggregator_executed = True

                                    # 收集 artifacts（带 task_id，恢复流的
                                    # _process_collected_artifacts 依赖它落库到对应 SubTask）
                                    data = token.get("data", {}) or {}
                                    output = data.get("output", {}) or {}
                                    if (
                                        output
                                        and isinstance(output, dict)
                                        and output.get("artifact")
                                    ):
                                        expert_info = output.get("last_expert_result") or {}
                                        await stream_queue.put(
                                            {
                                                "type": "artifact",
                                                "task_id": expert_info.get("task_id"),
                                                "data": output["artifact"],
                                            }
                                        )

                            except Exception as e:
                                logger.warning(
                                    f"[Producer] astream_events 执行异常: {e}", exc_info=True
                                )

                            # 如果 aggregator 已执行，退出外层循环
                            if aggregator_executed:
                                logger.info("[Producer] aggregator 已完成，退出外层循环")
                                break

                            # 短暂等待后进入下一轮循环检查状态
                            await asyncio.sleep(0.1)
                            continue

                        # 执行一轮 LangGraph
                        async for token in graph.astream_events(None, config, version="v2"):
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
                                    await sse_queue.put({"type": "sse", "event": custom_str})
                                    if "message.done" in custom_str:
                                        logger.info(
                                            "[Producer] 已发送 message.done，标记 aggregator 完成"
                                        )
                                        aggregator_executed = True
                                continue

                            # 🔥 检测 aggregator 节点开始执行
                            if event_type == "on_chain_start" and name == "aggregator":
                                aggregator_executed = True
                                logger.info(
                                    f"[Producer] 检测到 aggregator 开始执行 (loop {loop_count})"
                                )

                            if event_type == "on_chain_end":
                                data = token.get("data", {}) or {}
                                output = data.get("output", {}) or {}

                                # 🔥🔥🔥 关键修复：检测 aggregator 执行完成
                                if name == "aggregator" and output.get("final_response"):
                                    aggregator_executed = True
                                    logger.info(
                                        f"[Producer] aggregator 执行完成，准备退出 (loop {loop_count})"
                                    )
                                    break

                            event_str = self.transform_langgraph_event(token, message_id)
                            if event_str:
                                await sse_queue.put({"type": "sse", "event": event_str})

                                # 🔥 如果发送了 message.done 事件，说明 aggregator 已完成
                                if "message.done" in event_str:
                                    logger.info(
                                        "[Producer] 已发送 message.done，标记 aggregator 完成"
                                    )
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

                        # 🔥 如果 aggregator 已执行，退出外层循环
                        if aggregator_executed:
                            logger.info("[Producer] aggregator 已完成，退出外层循环")
                            break

                        # 短暂等待，让状态更新
                        await asyncio.sleep(0.1)

                    self._raise_if_loop_budget_exhausted(
                        loop_count=loop_count,
                        max_loops=max_loops,
                        aggregator_executed=aggregator_executed,
                        run_id=run_id,
                    )

                except AppError:
                    raise
                except Exception as e:
                    logger.error(f"[StreamService] Producer 错误: {e}", exc_info=True)
                finally:
                    await sse_queue.put({"type": "done"})

            # 启动生产者
            producer_task = asyncio.create_task(producer())

            try:
                # 消费并 yield 事件
                while True:
                    try:
                        item = await asyncio.wait_for(
                            sse_queue.get(), timeout=settings.stream_timeout
                        )
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
                    # 使用 mark_run_completed_by_id 确保 completed_at 被正确设置
                    from crud.agent_run import mark_run_completed_by_id

                    mark_run_completed_by_id(self.db, run_id)
                    # 更新 current_node
                    if run_id:
                        run = self.db.get(AgentRun, run_id)
                        if run:
                            run.current_node = "done"
                            self.db.add(run)
                    # 写入 run_completed 事件到账本
                    emit_run_completed(
                        self.db,
                        run_id=run_id,
                        thread_id=thread_id,
                    )
                    self.db.commit()
                    logger.info(f"[StreamService] AgentRun {run_id} 状态更新为 completed")

            except asyncio.CancelledError:
                # 🔥 客户端断开连接时，检查数据库中的实际状态
                # aggregator_node 已经在内部更新了 AgentRun 状态，这里只记录日志
                if run_id:
                    agent_run = self.db.get(AgentRun, run_id)
                    if agent_run and agent_run.status == RunStatus.COMPLETED:
                        logger.info(
                            f"[StreamService] AgentRun {run_id} 已由 aggregator 更新为 completed"
                        )
                    else:
                        logger.info(
                            f"[StreamService] 客户端断开连接，AgentRun {run_id} 状态: {agent_run.status if agent_run else 'not found'}"
                        )
                raise

        # message.done 由 aggregator_node 通过 event_queue 发送
        # 这里不再重复发送

    async def _apply_updated_plan(
        self, graph, config: dict, updated_plan: list[dict], message_id: str | None = None
    ):
        """
        应用用户更新后的计划

        🔥 关键修复：必须添加 HumanMessage 来触发 Graph 继续执行，
        否则 LangGraph 会认为没有新输入而进入 END 节点。
        """
        from langchain_core.messages import HumanMessage

        # 🔥🔥🔥 关键修复：合并状态，不要完全替换
        # 获取当前状态
        current_state = await graph.aget_state(config)
        current_values = current_state.values
        current_task_list = current_values.get("task_list", [])
        current_expert_results = current_values.get("expert_results", [])

        # 创建任务 ID 到当前任务的映射
        current_task_map = {task.get("id"): task for task in current_task_list}

        # 清理依赖关系并合并状态
        kept_task_ids = {task.get("id") for task in updated_plan}
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

        # 🔥🔥🔥 关键修复：添加 HumanMessage 触发流程继续
        current_messages = current_values.get("messages", [])
        approval_message = HumanMessage(content="计划已审核通过，请按新计划执行任务。")
        updated_messages = list(current_messages) + [approval_message]

        # 更新 LangGraph 状态（保留已完成任务的结果）
        state_update = {
            "task_list": merged_plan,
            "current_task_index": next_task_index,  # 🔥 使用正确的索引，而不是重置为 0
            "messages": updated_messages,
            "expert_results": current_expert_results,  # 🔥 保留已有结果，而不是清空
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
        """将 LangGraph 事件转换为 SSE 格式"""
        import json

        # 🔥 修复：token 可能是字符串或其他类型，需要安全检查
        if not isinstance(token, dict):
            return None

        event_type = token.get("event", "")

        # 🔥 修复：过滤掉 router 节点的所有 LLM 事件
        # Router 只负责决策，不应该有任何消息流式输出
        # LangGraph 的 add_messages reducer 会自动将 LLM response 添加到 messages 列表
        # 我们需要在事件层面过滤掉这些内容
        if event_type.startswith("on_chat_model"):
            # 检查是否是 router 相关的事件
            # 可能通过 name 或 tags 标识
            name = token.get("name", "")
            metadata = token.get("metadata", {})
            tags = metadata.get("tags", [])

            # 检查 run_id 是否与 router 相关
            token.get("run_id", "")

            # 如果事件关联的是 router 节点，过滤掉
            if "router" in name or "router" in str(tags).lower():
                logger.debug(f"[transform_langgraph_event] 过滤 router 事件: {event_type}")
                return None

            # 🔥 额外检查：如果是 on_chat_model_end，检查 content 是否是 JSON 格式的 decision
            if event_type == "on_chat_model_end":
                data = token.get("data", {}) or {}
                output = data.get("output", {})
                if output and isinstance(output, dict) and "content" in output:
                    content = output["content"]
                    # 如果 content 是 { "decision_type": "..." } 格式，过滤掉
                    if isinstance(content, str) and (
                        '"decision_type"' in content or '{"decision_type"' in content
                    ):
                        logger.debug(
                            f"[transform_langgraph_event] 过滤 router decision JSON: {content[:50]}..."
                        )
                        return None

        # 处理消息流
        if event_type == "on_chat_model_stream":
            data = token.get("data", {})
            chunk = data.get("chunk")
            if not chunk:
                return None

            # 🔥🔥🔥 P0热修：严格过滤 commander 和 expert 节点的 message.delta
            # 这些节点的内容应通过专用事件发送（plan.thinking/artifact.chunk）
            # 只有 aggregator 节点允许发送 message.delta
            metadata = token.get("metadata", {})
            tags = metadata.get("tags", [])
            node_type = metadata.get("node_type", "")

            # 拦截条件1：明确的节点类型为 commander 或 expert
            if node_type in ["commander", "expert"]:
                logger.debug(f"[transform_langgraph_event] 拦截 {node_type} 节点的消息流")
                return None

            # 拦截条件2：包含 streaming 和 generic_worker 标签（向后兼容）
            if "streaming" in tags and "generic_worker" in tags:
                logger.debug("[transform_langgraph_event] GenericWorker 流式专家内容跳过")
                return None

            # 拦截条件3：router 节点的任何消息（额外保险）
            if "router" in tags or node_type == "router":
                logger.debug("[transform_langgraph_event] 拦截 router 节点的消息流")
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
                # 注意：只有 aggregator 节点会执行到这里
                event_data = {"content": content}
                if message_id:
                    event_data["message_id"] = message_id
                logger.debug(
                    f"[transform_langgraph_event] 允许 message.delta (node_type={node_type}, tags={tags}): {content[:50]}..."
                )
                return f"event: message.delta\ndata: {json.dumps(event_data)}\n\n"

        # 协议 v2：task.started / task.completed / task.failed / artifact 均由节点
        # 经 custom stream（emit_event）直达，此处不再手造（v1 双发源头已移除）。
        # 本函数剩余职责：on_chat_model_stream 的 message.delta / message.thinking。

        return None

    def _build_message_delta_event(self, message_id: str, content: str) -> str:
        """构建 message.delta 事件"""
        return build_message_delta_event(message_id=message_id, content=content)

    def _build_message_thinking_event(self, message_id: str, content: str) -> str:
        """构建 message.thinking 事件"""
        return build_message_thinking_event(message_id=message_id, content=content)

    def _build_message_done_event(self, message_id: str, content: str) -> str:
        """构建 message.done 事件"""
        return build_message_done_event(message_id=message_id, content=content)

    def _build_heartbeat_event(self) -> str:
        """构建 heartbeat 事件，供前端更新活跃时间。"""
        return build_heartbeat_event()

    def _build_error_event(self, code: str | ErrorCode, message: str) -> str:
        """构建 error 事件"""
        return build_error_event(code=code, message=message)

    def _touch_agent_run(self, run_id: str, *, current_node: str | None = None) -> None:
        """轻量刷新运行心跳，可选同步当前节点。"""
        updated = touch_run_heartbeat_by_id(self.db, run_id, current_node=current_node)
        if updated is not None:
            self.db.commit()

    def _raise_if_run_cancelled(self, run_id: str) -> None:
        """在流式执行中协作检查运行是否已被取消或已超出截止时间。"""
        agent_run = self.db.get(AgentRun, run_id)
        if agent_run is None:
            return

        if agent_run.deadline_at and agent_run.deadline_at <= datetime.now():
            timed_out = mark_run_timed_out_by_id(
                self.db,
                run_id,
                error_message="运行超过 deadline，已自动终止",
                current_node=agent_run.current_node,
            )
            if timed_out is not None:
                self.db.commit()
            raise AppError(
                message="运行已超时",
                code=ErrorCode.RUN_TIMED_OUT,
                status_code=409,
                details={"run_id": run_id},
            )

        if agent_run.status == RunStatus.CANCELLED:
            raise AppError(
                message="运行已取消",
                code=ErrorCode.RUN_CANCELLED,
                status_code=409,
                details={"run_id": run_id},
            )

    def _sync_run_progress_from_token(self, token: dict[str, Any], run_id: str) -> None:
        """从 LangGraph token 中提取当前节点，并刷新运行心跳。"""
        event_type = token.get("event", "")
        if event_type != "on_chain_start":
            return

        metadata = token.get("metadata", {}) or {}
        node_name = metadata.get("name") or token.get("name")
        if not node_name:
            return

        self._touch_agent_run(run_id, current_node=str(node_name))

    def _get_latest_execution_plan(self, thread_id: str) -> ExecutionPlan | None:
        """获取线程最新的 ExecutionPlan。"""
        return self.db.exec(
            select(ExecutionPlan)
            .where(ExecutionPlan.thread_id == thread_id)
            .order_by(ExecutionPlan.created_at.desc())
        ).first()

    def _get_execution_plan_by_run(self, run_id: str) -> ExecutionPlan | None:
        """按 run_id 获取 ExecutionPlan。"""
        return self.db.exec(select(ExecutionPlan).where(ExecutionPlan.run_id == run_id)).first()

    def _update_agent_run_status(
        self,
        run_id: str,
        status: RunStatus,
        *,
        current_node: str | None = None,
    ) -> None:
        """更新 AgentRun 状态。"""
        updated = update_run_status_by_id(
            self.db,
            run_id,
            status,
            current_node=current_node,
        )
        if updated is not None:
            self.db.commit()

    def _mark_agent_run_failed(
        self,
        run_id: str,
        error_message: str,
        *,
        error_code: str | None = None,
    ) -> None:
        """将 AgentRun 标记为失败。"""
        updated = mark_run_failed_by_id(
            self.db,
            run_id,
            error_message=error_message,
            error_code=error_code,
        )
        if updated is not None:
            self.db.commit()

    def _get_plan_version(self, thread_id: str) -> int:
        """获取当前线程的计划版本号（乐观锁）"""
        execution_plan = self.db.exec(
            select(ExecutionPlan)
            .where(ExecutionPlan.thread_id == thread_id)
            .order_by(ExecutionPlan.created_at.desc())
        ).first()
        return int(execution_plan.plan_version) if execution_plan else 1

    def _update_execution_plan_status(self, thread_id: str, status: str) -> None:
        """
        更新 ExecutionPlan 状态

        Args:
            thread_id: 线程ID
            status: 新状态（pending, waiting_for_approval, running, completed, failed, cancelled）
        """
        from models.enums import TaskStatus

        execution_plan = self.db.exec(
            select(ExecutionPlan)
            .where(ExecutionPlan.thread_id == thread_id)
            .order_by(ExecutionPlan.created_at.desc())
        ).first()

        if execution_plan:
            execution_plan.status = TaskStatus(status)
            execution_plan.updated_at = datetime.now()
            self.db.add(execution_plan)
            self.db.commit()
            logger.info(f"[StreamService] ExecutionPlan {execution_plan.id} 状态更新为 {status}")

    def _build_human_interrupt_event(
        self,
        thread_id: str,
        current_plan: list[dict],
        plan_version: int,
        run_id: str | None = None,
        execution_plan_id: str | None = None,
    ) -> str:
        """构建 human.interrupt 事件 (HITL)"""
        return build_human_interrupt_event(
            thread_id=thread_id,
            current_plan=current_plan,
            plan_version=plan_version,
            run_id=run_id,
            execution_plan_id=execution_plan_id,
        )
