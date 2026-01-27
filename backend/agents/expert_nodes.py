"""
专家节点（动态版本）

使用数据库加载的 Prompt，不再依赖硬编码常量
"""
from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from datetime import datetime

from agents.expert_loader import get_expert_config_cached
from agents.experts import EXPERT_DESCRIPTIONS


async def run_expert_node(
    expert_key: str,
    state: Dict[str, Any],
    llm
) -> Dict[str, Any]:
    """
    通用专家节点：根据 expert_key 从数据库加载配置

    Args:
        expert_key: 专家类型标识（如 'coder', 'search'）
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 更新后的 AgentState（包含 output_result）
    """
    # 从数据库/缓存加载专家配置
    expert_config = get_expert_config_cached(expert_key)

    if not expert_config:
        # 降级：使用硬编码 Prompt（如果数据库中没有）
        from agents.experts import EXPERT_PROMPTS
        expert_config = {
            "expert_key": expert_key,
            "name": EXPERT_DESCRIPTIONS.get(expert_key, expert_key),
            "system_prompt": EXPERT_PROMPTS.get(expert_key, ""),
            "model": "gpt-4o",
            "temperature": 0.5
        }
        print(f"[ExpertNode] Using fallback config for '{expert_key}'")

    system_prompt = expert_config["system_prompt"]
    model = expert_config["model"]
    temperature = expert_config["temperature"]

    print(f"[ExpertNode] Running {expert_key} with model={model}, temp={temperature}")

    # 获取当前任务
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        return {"error": "没有待执行的任务"}

    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    started_at = datetime.now()

    try:
        # 使用配置的模型和温度参数
        llm_with_config = llm.bind(
            model=model,
            temperature=temperature
        )

        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        print(f"[{expert_key.upper()}] 专家完成 (耗时: {duration_ms/1000:.2f}s)")

        result = {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms
        }

        # 添加 text artifact
        result["artifact"] = {
            "type": "text",
            "title": f"{expert_config['name']}结果",
            "content": response.content,
            "source": f"{expert_key}_expert"
        }

        return result

    except Exception as e:
        print(f"[{expert_key.upper()}] 专家失败: {e}")
        return {
            "output_result": f"{expert_config['name']}失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
        }


def format_input_data(input_data: Dict) -> str:
    """格式化输入数据为文本"""
    if not input_data:
        return "（无额外参数）"

    lines = []
    for key, value in input_data.items():
        if isinstance(value, (list, dict)):
            lines.append(f"- {key}: {value}")
        else:
            lines.append(f"- {key}: {value}")

    return "\n".join(lines)
