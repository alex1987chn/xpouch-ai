"""
HITL 计划修订服务（v4 循环核心，方案 A）

用户驳回并附反馈后，规划专家（与 commander 同源配置）对当前计划做一次
结构化修订，产出 v(n+1) 计划草案。人仍是裁决者：修订结果必须再次通过
审批才会执行，本服务没有任何自动执行权。

超时与失败安全：单次修订硬超时（REVISION_TIMEOUT_SECONDS），失败时由
调用方保持原计划待审并落 HITL_REVISION_FAILED 事件——最坏情况是
"驳回退化为当前计划仍可批准/终止"，不会出现卡死或计划丢失。
"""

import asyncio

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from pydantic import ValidationError

from agents.nodes.commander import ExecutionPlan as PlanSchema
from config import settings
from constants import COMMANDER_SYSTEM_PROMPT
from providers_config import get_model_config
from utils.logger import logger


class PlanRevisionError(RuntimeError):
    """修订未产出合法计划。调用方对修订失败一律宽兜底（保持原计划待审），
    故这里只需一个可辨识的异常类型用于日志与语义表达。"""


REVISION_TIMEOUT_SECONDS = 240

REVISION_DIRECTIVE = """

【当前任务：根据用户反馈修订执行计划】
用户驳回了当前计划并给出反馈。请输出修订后的完整执行计划 JSON（schema 与原计划一致）。

修订规则：
1. 用户反馈必须被吸收：受影响的任务要体现修订意图，必要时可增删任务。
2. 未被反馈涉及的任务尽量保持原样，不要无谓重写。
3. tasks[i].id 重新从 "1" 开始连续编号；depends_on 同步更新，不得成环。
4. expert_type 只能使用原计划中出现过的专家。
5. 只输出 JSON，不要对话、不要 markdown 代码块。"""


def _load_commander_config() -> tuple[str, str, float]:
    """加载 commander 配置（系统提示词 / 模型 / 温度），DB 优先，常量兜底。"""
    try:
        from sqlmodel import select

        from database import get_session
        from models import SystemExpert

        with get_session() as session:
            expert = session.exec(
                select(SystemExpert).where(SystemExpert.expert_key == "commander")
            ).first()
        if expert:
            return (
                expert.system_prompt,
                expert.model or settings.model_name,
                float(expert.temperature if expert.temperature is not None else 0.5),
            )
    except Exception as exc:  # noqa: BLE001 — 配置读取失败必须兜底到常量
        logger.warning(f"[PLAN_REVISION] commander 配置读取失败，使用常量兜底: {exc}")
    return (
        COMMANDER_SYSTEM_PROMPT,
        settings.model_name,
        0.5,
    )


def _build_llm(model: str, temperature: float):
    from utils.llm_factory import get_llm_instance

    model_config = get_model_config(model)
    if model_config and model_config.get("provider"):
        provider = model_config["provider"]
        actual_model = model_config.get("model", model)
        llm = get_llm_instance(provider=provider, streaming=False, temperature=temperature)
        logger.info(f"[PLAN_REVISION] 模型 '{model}' -> '{actual_model}' (provider={provider})")
        return llm.bind(model=actual_model, temperature=temperature)
    logger.warning(f"[PLAN_REVISION] 模型 '{model}' 无 provider 配置，使用默认 LLM 实例")
    return get_llm_instance(streaming=False, temperature=temperature).bind(
        model=model, temperature=temperature
    )


def _build_revision_prompt(
    user_query: str,
    previous_tasks: list[dict],
    plan_version: int,
    feedback: str,
) -> str:
    import json

    return f"""用户的原始需求：
{user_query}

当前执行计划（v{plan_version}，JSON）：
{json.dumps(previous_tasks, ensure_ascii=False, indent=2)}

用户的驳回反馈（必须吸收）：
{feedback}
{REVISION_DIRECTIVE}"""


async def revise_plan_tasks(
    *,
    user_query: str,
    previous_tasks: list[dict],
    plan_version: int,
    feedback: str,
) -> PlanSchema:
    """规划专家修订：输入原任务 + 反馈，输出校验后的修订计划 schema。

    超时（REVISION_TIMEOUT_SECONDS）或校验失败抛异常，由调用方兜底。
    """
    system_prompt, model, temperature = _load_commander_config()
    llm = _build_llm(model, temperature)
    human_prompt = _build_revision_prompt(user_query, previous_tasks, plan_version, feedback)

    async def _invoke() -> PlanSchema:
        # 结构化输出：schema 由 function-calling 保证，不再手抽 JSON
        # （原实现复用 commander 的 _extract_json_string，随该函数一并移除）
        structured = llm.with_structured_output(PlanSchema)
        parsed = await structured.ainvoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=human_prompt)],
            config=RunnableConfig(tags=["plan_revision", "structured_output"]),
        )
        if parsed is None:
            raise PlanRevisionError("结构化输出未产出合法修订计划")
        return parsed

    try:
        revised = await asyncio.wait_for(_invoke(), timeout=REVISION_TIMEOUT_SECONDS)
        logger.info(
            f"[PLAN_REVISION] 修订完成：{len(revised.tasks)} 个任务（原 {len(previous_tasks)} 个）"
        )
        return revised
    except TimeoutError as exc:
        logger.error(f"[PLAN_REVISION] 修订超时（>{REVISION_TIMEOUT_SECONDS}s）")
        raise TimeoutError("计划修订超时") from exc
    except ValidationError as exc:
        logger.error(f"[PLAN_REVISION] 修订输出不符合计划 schema: {exc}")
        raise
