"""transform_langgraph_event 的行为特征测试。

锁住「哪些节点的 token 允许变成 message.delta / message.thinking」这条规则，
作为 Tier 2（审批迁 interrupt/Command）重写的安全网。

判据契约（已在 langgraph 1.2.11 上实测）：
- 节点边界事件（on_chain_start/end/stream）metadata 只含 langgraph_node；
- 节点内部 LLM 的 token 事件（on_chat_model_stream）metadata 同时含
  langgraph_node（框架注入）与 node_type（节点自挂），二者合并共存。
- 只有 aggregator 允许产生 message.delta；commander/expert/router 的
  产出经 sse_event 通道直达（plan.thinking / artifact 等）。
"""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.chat.stream_service import StreamService  # noqa: E402


def _make_stream_token(
    node_type: str = "", langgraph_node: str = "", content: str = "", reasoning: str = ""
):
    """构造 on_chat_model_stream 事件 token。"""
    from langchain_core.messages import AIMessageChunk

    additional = {"reasoning_content": reasoning} if reasoning else {}
    chunk = AIMessageChunk(content=content, additional_kwargs=additional)
    return {
        "event": "on_chat_model_stream",
        "name": "ChatDeepSeek",
        "metadata": {
            k: v for k, v in {"node_type": node_type, "langgraph_node": langgraph_node}.items() if v
        },
        "data": {"chunk": chunk},
    }


class TestMessageDeltaGating:
    def setup_method(self):
        # transform_langgraph_event 是无依赖的纯函数，传 None db 即可调用
        self.service = StreamService.__new__(StreamService)

    def test_aggregator_content_becomes_delta(self):
        token = _make_stream_token(
            node_type="aggregator", langgraph_node="aggregator", content="hello"
        )
        out = self.service.transform_langgraph_event(token, message_id="m1")
        assert out is not None and "message.delta" in out and "hello" in out

    def test_aggregator_reasoning_becomes_thinking(self):
        token = _make_stream_token(
            node_type="aggregator", langgraph_node="aggregator", reasoning="think"
        )
        out = self.service.transform_langgraph_event(token, message_id="m1")
        assert out is not None and "message.thinking" in out and "think" in out

    def test_commander_is_blocked(self):
        token = _make_stream_token(
            node_type="commander", langgraph_node="commander", content="plan"
        )
        assert self.service.transform_langgraph_event(token, message_id="m1") is None

    def test_expert_is_blocked(self):
        token = _make_stream_token(
            node_type="expert", langgraph_node="generic", content="artifact text"
        )
        assert self.service.transform_langgraph_event(token, message_id="m1") is None

    def test_router_is_blocked(self):
        token = _make_stream_token(
            node_type="router", langgraph_node="router", content='{"decision_type":"simple"}'
        )
        assert self.service.transform_langgraph_event(token, message_id="m1") is None

    def test_router_is_blocked_by_langgraph_node_alone(self):
        # 只带 langgraph_node（无 node_type）的 router token 也必须被拦
        token = _make_stream_token(langgraph_node="router", content="should not appear")
        assert self.service.transform_langgraph_event(token, message_id="m1") is None

    def test_empty_chunk_returns_none(self):
        token = {"event": "on_chat_model_stream", "metadata": {}, "data": {}}
        assert self.service.transform_langgraph_event(token, message_id="m1") is None

    def test_non_stream_event_returns_none(self):
        token = {"event": "on_chain_start", "metadata": {"langgraph_node": "aggregator"}}
        assert self.service.transform_langgraph_event(token, message_id="m1") is None

    def test_reasoning_collects_into_collector(self):
        collector = []
        token = _make_stream_token(
            node_type="aggregator", langgraph_node="aggregator", reasoning="part1"
        )
        self.service.transform_langgraph_event(
            token, message_id="m1", reasoning_collector=collector
        )
        assert collector == ["part1"]

    def test_message_id_propagates(self):
        token = _make_stream_token(node_type="aggregator", langgraph_node="aggregator", content="x")
        out = self.service.transform_langgraph_event(token, message_id="mid-9")
        assert out is not None and '"message_id": "mid-9"' in out
