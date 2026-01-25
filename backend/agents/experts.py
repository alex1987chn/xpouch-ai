"""
专家原子化节点
每个专家节点接收完整 AgentState，处理并返回更新后的 State
"""
from typing import Dict, Any, List
from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage
from datetime import datetime
from models import SubTask


# ============================================================================
# 专家提示词模板
# ============================================================================

EXPERT_DESCRIPTIONS = {
    "search": "搜索专家",
    "coder": "编程专家",
    "researcher": "研究专家",
    "analyzer": "分析专家",
    "writer": "写作专家",
    "planner": "规划专家",
    "image_analyzer": "图片分析专家"
}

EXPERT_PROMPTS = {
    "search": """你是一个信息搜索专家。

职责：
- 根据任务要求搜索相关信息
- 整理和归纳搜索结果
- 提供可靠的信息来源
- 确保信息的准确性和时效性

输出要求：
- 清晰的结构化信息
- 关键要点提炼
- 可靠的引用来源（如有）
""",

    "coder": """你是一个编程专家。

职责：
- 编写清晰、高效且遵循最佳实践的代码
- 确保代码的可读性和可维护性
- 添加必要的注释和文档
- 考虑性能优化和错误处理

输出要求：
- 完整可运行的代码
- 代码注释说明
- 使用示例（如适用）
- 最佳实践建议
""",

    "researcher": """你是一个研究专家。

职责：
- 进行深入的文献和技术调研
- 分析相关研究的最新进展
- 比较不同方法的优劣
- 提供研究建议和方向

输出要求：
- 系统化的研究报告
- 关键文献和技术点总结
- 深度分析和见解
- 可行的后续研究方向
""",

    "analyzer": """你是一个分析专家。

职责：
- 进行逻辑严密的分析和推理
- 识别问题的关键因素
- 提供数据驱动的洞察
- 评估不同方案的可行性

输出要求：
- 结构化的分析报告
- 关键发现和洞察
- 支撑数据和理由
- 明确的结论和建议
""",

    "writer": """你是一个写作专家。

职责：
- 创作生动、优美且易读的内容
- 确保内容的逻辑性和连贯性
- 适当地使用修辞和表达技巧
- 满足目标受众的需求

输出要求：
- 清晰的结构和层次
- 准确表达核心观点
- 适当的语气和风格
- 易于理解的语言
""",

    "planner": """你是一个规划专家。

职责：
- 制定详细的执行计划和方案
- 识别关键步骤和依赖关系
- 评估资源和时间需求
- 提供风险预案

输出要求：
- 分阶段的实施计划
- 清晰的任务分工
- 时间线和里程碑
- 风险识别和应对策略
""",

    "image_analyzer": """你是一个图片分析专家。

职责：
- 仔细观察和分析提供的图片内容
- 识别图片中的物体、场景、文字和细节
- 理解图片的视觉元素和构图
- 提供准确、全面的描述和分析

输出要求：
- 图片整体内容的概述
- 关键视觉元素的详细描述
- 识别的物体、场景和文字
- 图片的风格和特点分析
- 可视化建议（如适用）
"""
}


# ============================================================================
# 原子化专家节点（直接处理 State）
# ============================================================================

async def run_search_expert(
    state: Dict[str, Any],
    llm
) -> Dict[str, Any]:
    """
    搜索专家节点：直接处理 AgentState 并返回更新

    Args:
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 更新后的 AgentState（包含 output_result）
    """
    # 获取当前任务（从 state 中）
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        return {"error": "没有待执行的任务"}

    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    started_at = datetime.now()

    try:
        response = await llm.ainvoke([
            SystemMessage(content=EXPERT_PROMPTS["search"]),
            HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        print(f"[SEARCH] 搜索专家完成 (耗时: {duration_ms/1000:.2f}s)")

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
            "title": "搜索结果",
            "content": response.content,
            "source": "search_expert"
        }

        return result

    except Exception as e:
        print(f"[SEARCH] 搜索专家失败: {e}")
        return {
            "output_result": f"搜索失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
        }


import re
from typing import Optional

def extract_code_blocks(content: str) -> Optional[tuple[str, str]]:
    """
    从文本中提取代码块

    Args:
        content: LLM 返回的文本

    Returns:
        (语言, 代码内容) 或 None
    """
    # 匹配代码块：```lang ... ```
    pattern = r'```(\w+)?\n(.*?)\n```'
    matches = re.findall(pattern, content, re.DOTALL)

    if matches:
        # 返回第一个代码块
        lang, code = matches[0]
        return (lang or 'text', code.strip())

    return None


async def run_coder_expert(
    state: Dict[str, Any],
    llm
) -> Dict[str, Any]:
    """
    编程专家节点：直接处理 AgentState 并返回更新

    Args:
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 更新后的 AgentState（包含 output_result 和 artifact）
    """
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        return {"error": "没有待执行的任务"}

    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    started_at = datetime.now()

    try:
        response = await llm.ainvoke([
            SystemMessage(content=EXPERT_PROMPTS["coder"]),
            HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        # 提取代码块
        artifact_data = None
        code_result = extract_code_blocks(response.content)

        # 初始化基础响应结果
        result = {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms
        }

        if code_result:
            language, code = code_result
            # 根据 language 决定 artifact type
            artifact_type = "code"
            language_lower = language.lower() if language else ""

            # HTML/HTM - 实时预览
            if language_lower in ["html", "htm"]:
                artifact_type = "html"
                print(f"[CODER] 检测到 HTML 代码，将使用实时预览")
            # SVG - 可以作为 HTML 预览
            elif language_lower == "svg":
                artifact_type = "html"
                code = f'<svg xmlns="http://www.w3.org/2000/svg">{code}</svg>'
                print(f"[CODER] 检测到 SVG 代码，将使用 HTML 预览")
            # Markdown - 使用 Markdown 渲染器
            elif language_lower in ["md", "markdown"]:
                artifact_type = "markdown"
                print(f"[CODER] 检测到 Markdown，将使用 Markdown 渲染器")
            # 其他格式仍然作为 code 显示
            else:
                print(f"[CODER] 检测到 {language} 代码，将使用代码高亮")

            artifact_data = {
                "type": artifact_type,
                "language": language,
                "title": f"{language} 代码",
                "content": code,
                "source": "coder_expert"
            }

        # 如果有代码块，添加 artifact 字段
        if artifact_data:
            result["artifact"] = artifact_data

        return result

    except Exception as e:
        print(f"[CODER] 编程专家失败: {e}")
        return {
            "output_result": f"编程失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
        }


async def run_researcher_expert(
    state: Dict[str, Any],
    llm
) -> Dict[str, Any]:
    """
    研究专家节点：直接处理 AgentState 并返回更新

    Args:
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 更新后的 AgentState（包含 output_result）
    """
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        return {"error": "没有待执行的任务"}

    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    started_at = datetime.now()

    try:
        response = await llm.ainvoke([
            SystemMessage(content=EXPERT_PROMPTS["researcher"]),
            HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        print(f"[RESEARCHER] 研究专家完成 (耗时: {duration_ms/1000:.2f}s)")

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
            "title": "研究报告",
            "content": response.content,
            "source": "researcher_expert"
        }

        return result

    except Exception as e:
        print(f"[RESEARCHER] 研究专家失败: {e}")
        return {
            "output_result": f"研究失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
        }


async def run_analyzer_expert(
    state: Dict[str, Any],
    llm
) -> Dict[str, Any]:
    """
    分析专家节点：直接处理 AgentState 并返回更新

    Args:
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 更新后的 AgentState（包含 output_result）
    """
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        return {"error": "没有待执行的任务"}

    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    started_at = datetime.now()

    try:
        response = await llm.ainvoke([
            SystemMessage(content=EXPERT_PROMPTS["analyzer"]),
            HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        print(f"[ANALYZER] 分析专家完成 (耗时: {duration_ms/1000:.2f}s)")

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
            "title": "分析结果",
            "content": response.content,
            "source": "analyzer_expert"
        }

        return result

    except Exception as e:
        print(f"[ANALYZER] 分析专家失败: {e}")
        return {
            "output_result": f"分析失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
        }


async def run_writer_expert(
    state: Dict[str, Any],
    llm
) -> Dict[str, Any]:
    """
    写作专家节点：直接处理 AgentState 并返回更新

    Args:
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 更新后的 AgentState（包含 output_result）
    """
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        return {"error": "没有待执行的任务"}

    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    started_at = datetime.now()

    try:
        response = await llm.ainvoke([
            SystemMessage(content=EXPERT_PROMPTS["writer"]),
            HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        print(f"[WRITER] 写作专家完成 (耗时: {duration_ms/1000:.2f}s)")

        result = {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms
        }

        # 添加 markdown artifact（写作专家生成的通常是 Markdown 格式）
        result["artifact"] = {
            "type": "markdown",
            "title": "写作内容",
            "content": response.content,
            "source": "writer_expert"
        }

        return result

    except Exception as e:
        print(f"[WRITER] 写作专家失败: {e}")
        return {
            "output_result": f"写作失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
        }


async def run_planner_expert(
    state: Dict[str, Any],
    llm
) -> Dict[str, Any]:
    """
    规划专家节点：直接处理 AgentState 并返回更新

    Args:
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 更新后的 AgentState（包含 output_result）
    """
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        return {"error": "没有待执行的任务"}

    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    started_at = datetime.now()

    try:
        response = await llm.ainvoke([
            SystemMessage(content=EXPERT_PROMPTS["planner"]),
            HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        print(f"[PLANNER] 规划专家完成 (耗时: {duration_ms/1000:.2f}s)")

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
            "title": "规划方案",
            "content": response.content,
            "source": "planner_expert"
        }

        return result

    except Exception as e:
        print(f"[PLANNER] 规划专家失败: {e}")
        return {
            "output_result": f"规划失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
        }


async def run_image_analyzer_expert(
    state: Dict[str, Any],
    llm
) -> Dict[str, Any]:
    """
    图片分析专家节点：直接处理 AgentState 并返回更新

    Args:
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 更新后的 AgentState（包含 output_result）
    """
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        return {"error": "没有待执行的任务"}

    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    started_at = datetime.now()

    try:
        # 如果 input_data 中包含图片信息，可以在这里处理
        image_info = input_data.get("image_info", "")
        image_url = input_data.get("image_url", "")

        # 构建提示词
        content = f"任务描述: {description}"
        if image_url:
            content += f"\n\n图片链接: {image_url}"
        if image_info:
            content += f"\n\n图片信息: {image_info}"

        response = await llm.ainvoke([
            SystemMessage(content=EXPERT_PROMPTS["image_analyzer"]),
            HumanMessage(content=content)
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        print(f"[IMAGE_ANALYZER] 图片分析专家完成 (耗时: {duration_ms/1000:.2f}s)")

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
            "title": "图像分析",
            "content": response.content,
            "source": "image_analyzer_expert"
        }

        return result

    except Exception as e:
        print(f"[IMAGE_ANALYZER] 图片分析专家失败: {e}")
        return {
            "output_result": f"图片分析失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
        }


# ============================================================================
# 专家映射（用于双模路由）
# ============================================================================

EXPERT_FUNCTIONS = {
    "search": run_search_expert,
    "coder": run_coder_expert,
    "researcher": run_researcher_expert,
    "analyzer": run_analyzer_expert,
    "writer": run_writer_expert,
    "planner": run_planner_expert,
    "image_analyzer": run_image_analyzer_expert
}


# ============================================================================
# 辅助函数
# ============================================================================

def format_input_data(data: Dict[str, Any]) -> str:
    """格式化输入数据为可读字符串"""
    if not data:
        return "无"

    lines = []
    for key, value in data.items():
        lines.append(f"  - {key}: {value}")

    return "\n".join(lines)


# ============================================================================
# 导出
# ============================================================================

__all__ = [
    "EXPERT_PROMPTS",
    "run_search_expert",
    "run_coder_expert",
    "run_researcher_expert",
    "run_analyzer_expert",
    "run_writer_expert",
    "run_planner_expert",
    "run_image_analyzer_expert",
    "EXPERT_FUNCTIONS"
]
