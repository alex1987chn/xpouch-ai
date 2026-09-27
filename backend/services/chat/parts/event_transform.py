"""LangGraph 事件 → SSE 线格式的转换器（批次 2 拆出，2026-09-27）。

transform_langgraph_event 是消息流/任务事件的**纯转换**层：输入 astream_events
的 token 与上下文 id，输出 SSE wire 文本或 None。无 DB 依赖。
"""

from __future__ import annotations

import json

_DELTA_ALLOWED_NODES = frozenset({"aggregator", "direct_reply"})


class EventTransformMixin:
    """事件转换（StreamService 组合件）。"""

    def transform_langgraph_event(
        self,
        token,
        message_id: str | None = None,
        reasoning_collector: list | None = None,
        aggregate_message_id: str | None = None,
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

        目标 id 路由：aggregator 的流式正文挂聚合消息（aggregate_message_id，
        与 aggregator 落库同源——聚合行必须排在所有专家消息之后）；
        direct_reply（简单模式）挂请求侧 message_id（占位=正文同一行）。
        """
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

            # 目标 id 路由（见 docstring）：聚合正文挂聚合消息 id（未传时退回
            # 请求侧 id——正常链路恒有，测试桩/直调场景不至发出无主事件）
            target_id = message_id
            if effective_node == "aggregator" and aggregate_message_id:
                target_id = aggregate_message_id

            # 思考过程流式块（DeepSeek reasoning_content；思考 chunk 通常没有正文内容，
            # 必须在 content 判空之前处理，否则会被整体丢弃）
            reasoning = getattr(chunk, "additional_kwargs", {}).get("reasoning_content", "")
            if reasoning:
                if reasoning_collector is not None:
                    reasoning_collector.append(reasoning)
                event_data = {"content": reasoning}
                if target_id:
                    event_data["message_id"] = target_id
                return f"event: message.thinking\ndata: {json.dumps(event_data)}\n\n"

            content = getattr(chunk, "content", None)
            if content:
                # 只发送纯净数据，包含 message_id 用于前端消息关联
                event_data = {"content": content}
                if target_id:
                    event_data["message_id"] = target_id
                return f"event: message.delta\ndata: {json.dumps(event_data)}\n\n"

        # 协议 v2：task.started / task.completed / task.failed / artifact 均由节点
        # 经 custom stream（emit_event）直达，此处不再手造（v1 双发源头已移除）。

        return None
