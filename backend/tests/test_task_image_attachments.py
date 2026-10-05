"""附件图片进 worker 的门控契约（路线 A，2026-10-05）。

此前图片只挂在初始消息上（router 的多模态部件），commander 分派后专家
worker 完全不可见——「看这张图做 X」在复杂模式是坏的。现在图片随
AgentState.attachments → 波次分派 branch_context → 任务消息，构造时按
专家模型的 vision 能力门控：

- vision 模型：图片以 image_url 部件进任务 HumanMessage，随工具循环
  历史贯穿（可「回头看图」）
- 非 vision 模型：剥离图片 + 正文显式标注（模型知道限制、答案能如实
  说明，而不是静默丢图）
- 无附件：纯文本消息，零变化
"""

from unittest.mock import patch

from agents.nodes.message_normalization import build_task_human_message
from agents.nodes.wave_scheduler import build_branch_payload


def _vision_models(model_id: str):
    return {"vision-model": {"vision": True}, "text-model": {"vision": False}}.get(model_id)


class TestBuildTaskHumanMessage:
    def test_no_attachments_plain_text(self):
        msg = build_task_human_message("任务描述", None, "text-model")
        assert msg.content == "任务描述"

    def test_empty_list_plain_text(self):
        msg = build_task_human_message("任务描述", [], "vision-model")
        assert msg.content == "任务描述"

    def test_vision_model_gets_image_parts(self):
        with patch(
            "providers_config.get_model_config",
            side_effect=lambda m: _vision_models(m),
        ):
            msg = build_task_human_message(
                "看图作答", ["data:image/png;base64,AAA"], "vision-model"
            )
        assert isinstance(msg.content, list)
        kinds = [p["type"] for p in msg.content]
        assert kinds == ["text", "image_url"]
        assert msg.content[1]["image_url"]["url"] == "data:image/png;base64,AAA"

    def test_non_vision_model_strips_and_annotates(self):
        with patch(
            "providers_config.get_model_config",
            side_effect=lambda m: _vision_models(m),
        ):
            msg = build_task_human_message("看图作答", ["data:image/png;base64,AAA"], "text-model")
        # 纯文本 + 显式标注：模型知道图存在但未参与，能如实告知用户
        assert isinstance(msg.content, str)
        assert "看图作答" in msg.content
        assert "1 张图片" in msg.content and "不支持" in msg.content

    def test_unknown_model_config_strips(self):
        # 配置缺失（BYO 场景模型名对不上）：按不支持处理，宁可降级不可炸
        with patch("providers_config.get_model_config", return_value=None):
            msg = build_task_human_message("任务", ["data:image/png;base64,AAA"], "mystery")
        assert isinstance(msg.content, str)
        assert "1 张图片" in msg.content


class TestBranchPayloadCarriesAttachments:
    def test_attachments_ride_branch_context(self):
        state = {
            "thread_id": "t1",
            "run_id": "r1",
            "user_id": "u1",
            "task_list": [{"id": "1"}],
            "attachments": ["data:image/png;base64,AAA", "data:image/jpeg;base64,BBB"],
        }
        payload = build_branch_payload(state, {"id": "1", "depends_on": []})
        assert payload["branch_context"]["attachments"] == [
            "data:image/png;base64,AAA",
            "data:image/jpeg;base64,BBB",
        ]

    def test_no_attachments_empty_list(self):
        payload = build_branch_payload(
            {"thread_id": "t1", "task_list": []}, {"id": "1", "depends_on": []}
        )
        assert payload["branch_context"]["attachments"] == []
