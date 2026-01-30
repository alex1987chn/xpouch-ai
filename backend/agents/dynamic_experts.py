"""
动态专家执行系统（使用数据库加载的 Prompt）

重构专家执行逻辑：
1. 使用 expert_loader 从数据库加载配置
2. 使用动态模型和温度参数
3. 支持管理员实时更新 Prompt
"""
import os
from typing import Dict, Any, List
from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage
from langchain_openai import ChatOpenAI
from datetime import datetime

from agents.expert_loader import get_expert_config_cached, refresh_cache
from agents.experts import EXPERT_DESCRIPTIONS
from agents.model_fallback import get_effective_model, get_default_model


def create_expert_function(expert_key: str):
    """
    创建专家函数工厂

    根据专家类型动态生成执行函数

    Args:
        expert_key: 专家类型标识

    Returns:
        callable: 专家执行函数
    """
    async def expert_node(state: Dict[str, Any], llm: ChatOpenAI) -> Dict[str, Any]:
        """
        动态专家节点：从数据库加载配置并执行

        Args:
            state: 完整的 AgentState
            llm: LLM 实例

        Returns:
            Dict: 更新后的 AgentState
        """
        # 从数据库/缓存加载专家配置
        expert_config = get_expert_config_cached(expert_key)

        if not expert_config:
            # 降级：使用硬编码 Prompt
            from agents.experts import EXPERT_PROMPTS
            # 👈 使用环境变量中的模型，而不是硬编码的 gpt-4o
            default_model = get_default_model()
            expert_config = {
                "expert_key": expert_key,
                "name": EXPERT_DESCRIPTIONS.get(expert_key, expert_key),
                "system_prompt": EXPERT_PROMPTS.get(expert_key, ""),
                "model": default_model,
                "temperature": 0.5
            }
            print(f"[DynamicExpert] Using fallback config for '{expert_key}': model={default_model}")

        system_prompt = expert_config["system_prompt"]
        # 👈 应用模型兜底机制
        model = get_effective_model(expert_config.get("model"))
        temperature = expert_config["temperature"]

        print(f"[DynamicExpert] Running {expert_key} with model={model}, temp={temperature}")

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

    return expert_node


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


# 构建专家函数映射
DYNAMIC_EXPERT_FUNCTIONS = {
    "search": create_expert_function("search"),
    "coder": create_expert_function("coder"),
    "researcher": create_expert_function("researcher"),
    "analyzer": create_expert_function("analyzer"),
    "writer": create_expert_function("writer"),
    "planner": create_expert_function("planner"),
    "image_analyzer": create_expert_function("image_analyzer"),
}


def initialize_expert_cache(session):
    """
    初始化专家配置缓存

    在应用启动时调用，预加载所有专家配置

    Args:
        session: 数据库会话
    """
    from agents.expert_loader import get_expert_config_cached

    print("[DynamicExpert] Initializing expert cache...")

    # 预加载所有专家
    for expert_key in DYNAMIC_EXPERT_FUNCTIONS.keys():
        config = get_expert_config_cached(expert_key, session)
        if config:
            print(f"  - Loaded: {config['name']} ({expert_key})")
        else:
            print(f"  - Not found: {expert_key} (will use fallback)")

    print("[DynamicExpert] Expert cache initialized")
