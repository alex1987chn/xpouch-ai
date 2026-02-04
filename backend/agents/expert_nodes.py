"""
专家节点（动态版本）

使用数据库加载的 Prompt，不再依赖硬编码常量
"""
import os
from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from datetime import datetime

from agents.expert_loader import get_expert_config_cached
from agents.experts import EXPERT_DESCRIPTIONS
from utils.llm_factory import get_effective_model, get_default_model


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
        # 👈 使用环境变量中的模型，而不是硬编码的 gpt-4o
        default_model = get_default_model()
        expert_config = {
            "expert_key": expert_key,
            "name": EXPERT_DESCRIPTIONS.get(expert_key, expert_key),
            "system_prompt": EXPERT_PROMPTS.get(expert_key, ""),
            "model": default_model,
            "temperature": 0.5
        }
        print(f"[ExpertNode] Using fallback config for '{expert_key}': model={default_model}")

    system_prompt = expert_config["system_prompt"]
    # 👈 应用模型兜底机制
    model = get_effective_model(expert_config.get("model"))
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

        # 根据专家类型和内容自动确定 artifact 类型
        artifact_type = _detect_artifact_type(response.content, expert_key)

        # 添加 artifact
        result["artifact"] = {
            "type": artifact_type,
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


def _detect_artifact_type(content: str, expert_key: str) -> str:
    """
    根据内容自动检测 artifact 类型

    优先根据内容特征判断，其次根据专家类型兜底

    Args:
        content: 专家输出的内容
        expert_key: 专家类型标识

    Returns:
        str: artifact 类型 (code | html | markdown | text | search)
    """
    import re
    content_lower = content.lower().strip()

    # 1. HTML 检测（最高优先级）
    # 检测完整的 HTML 文档或包含 <html> 标签的内容
    if (content_lower.startswith("<!doctype html") or
        content_lower.startswith("<html") or
        ("<html" in content_lower and "</html>" in content_lower)):
        return "html"

    # 2. 检测是否包含 HTML 代码块（```html）
    html_code_block = re.search(r'```html\n([\s\S]*?)```', content, re.IGNORECASE)
    if html_code_block:
        html_content = html_code_block.group(1).lower().strip()
        if html_content.startswith("<") and (">" in html_content or "</" in html_content):
            return "html"

    # 3. 检测 Markdown 格式
    has_markdown = any(marker in content for marker in ['# ', '## ', '### ', '> ', '- ', '* '])
    has_code_block = '```' in content

    # 4. 根据专家类型兜底
    artifact_type_map = {
        "coder": "code",
        "writer": "markdown",
        "search": "search",
        "planner": "markdown",
        "researcher": "markdown",
        "analyzer": "markdown",
        "image_analyzer": "text",
    }
    default_type = artifact_type_map.get(expert_key, "text")

    # 5. 特殊处理：如果 coder 生成了 markdown，返回 markdown
    if expert_key == "coder" and has_markdown and not has_code_block:
        return "markdown"

    return default_type


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
