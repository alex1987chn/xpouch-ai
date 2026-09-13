"""计划审批节点 —— HITL 的人机分界点（批次 B3）。

用 LangGraph 原生 `interrupt()` 表达「停在审批点等人」，替代旧式
`interrupt_before=["expert_dispatcher"]` 静态中断。

为什么必须换：静态中断会在**每次到达 dispatcher** 时都停（包括任务切换路过），
框架不提供「把用户裁决传回图里」的通道，于是只能在外层堆脚手架——
`while` 循环反复拉起图、用 `current_index > 0` 的位置启发式区分「首次审批」
与「任务切换」、伪造 `HumanMessage` 注入触发续跑、每 run 一个新 checkpoint。
这些全部随本节点消失。

拓扑上把审批独立出来还有一个好处：任务切换的回路是
`generic → expert_dispatcher`，**天然绕过本节点**，所以「要不要问人」由图的
形状表达，不再依赖运行时判断。

⚠️ 代码顺序约束（LangGraph 语义）：恢复时本节点**从头重新执行**，
`interrupt()` 之前的代码会再跑一遍，之后的只执行一次。因此副作用与裁决
应用一律放在 `interrupt()` 之后。

修订（reviser）有意**不**做成图内节点：图只负责「停在审批点等人」，修订是对
计划数据的副作用（后台任务跑 LLM 出 v(n+1) 落库，前端轮询到新版本重亮审批
卡），分钟级 LLM 调用因此留在请求生命周期之外。
"""

from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.types import interrupt

from agents.state import AgentState
from utils.logger import logger

__all__ = ["plan_approval_node"]


async def plan_approval_node(state: AgentState, config: RunnableConfig = None) -> dict[str, Any]:
    """在图执行到此处时暂停，等待人工审批（approve / revise / terminate）。

    - 无任务（例如规划失败退化为空计划）→ 直接放行，不打扰用户
    - 其余情况 → `interrupt()` 暂停；恢复时本函数重跑，`interrupt()` 返回裁决

    裁决的携带方式由调用方决定（服务层经 `Command(resume={"action": ...})`
    回传）。本节点只负责「停」与「记录裁决」，**不**在此访问数据库。
    """
    task_list = state.get("task_list", [])

    if not task_list:
        logger.info("[PLAN_APPROVAL] 计划为空，无需审批，直接放行")
        return {}

    decision = interrupt(
        {
            "type": "plan_approval",
            "task_count": len(task_list),
        }
    )

    # —— 以下仅在图恢复后执行一次 ——
    action = (decision or {}).get("action", "approve") if isinstance(decision, dict) else "approve"
    logger.info("[PLAN_APPROVAL] 收到人工裁决: action=%s", action)

    # 目前只有 approve 会恢复图（terminate 由服务层直接取消运行，不恢复图；
    # revise 由后台修订任务产出新计划后由用户再次裁决）。这里如实记录裁决，
    # 供后续（如计划 diff 视图、步骤级确认）扩展。
    return {"approval_action": action}
