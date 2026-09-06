"""自定义智能体双路径处理（Mixin）。

自 StreamService 拆出：流式/同步两路径与 LLM 构建、记忆注入。
实现与原方法逐一对应（搬运而非重写），公开签名不变。
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime

from fastapi.responses import StreamingResponse
from langchain_core.messages import BaseMessage

from config import settings
from models import AgentRun, CustomAgent, RunStatus, Thread
from providers_config import get_model_config, get_provider_api_key, get_provider_config
from utils.error_codes import ErrorCode
from utils.exceptions import AppError
from utils.llm_factory import get_llm_instance


class CustomAgentMixin:
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
                await self._update_agent_run_status(
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
                await self._mark_agent_run_failed(agent_run.id, str(e))
                yield self._build_error_event(ErrorCode.STREAM_ERROR, str(e))
                return
            except Exception as e:
                await self._mark_agent_run_failed(agent_run.id, str(e))
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
            await self._update_agent_run_status(
                agent_run.id, RunStatus.COMPLETED, current_node="done"
            )
            yield self._build_message_done_event(actual_message_id, full_response)
            # 传输级完成标记：前端据此区分"正常结束"与"异常断流"
            yield "data: [DONE]\n\n"

        from services.chat.run_lifecycle import sse_stream_headers

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers=sse_stream_headers(thread_id, agent_run.id),
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
            await self._update_agent_run_status(
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
            await self._mark_agent_run_failed(agent_run.id, str(e))
            raise AppError(f"自定义智能体调用失败: {str(e)}") from e
        except Exception as e:
            await self._mark_agent_run_failed(agent_run.id, str(e))
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

        await self._update_agent_run_status(agent_run.id, RunStatus.COMPLETED, current_node="done")
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
