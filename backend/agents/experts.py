"""
XPouch AI 动态专家执行模块 (v2.7 架构 - 数据库驱动版)
实现各个垂直领域专家的具体执行逻辑，优先读取数据库配置，支持硬编码回退。
"""
from typing import Dict, Any, Tuple, Optional
from datetime import datetime
import re
from langchain_core.messages import SystemMessage, HumanMessage
from agents.expert_loader import get_expert_config_cached

# ============================================================================
# 0. 默认提示词 (作为 Fallback)
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

# 这些是硬编码的默认提示词，仅当数据库无配置时使用
EXPERT_PROMPTS = {
    "search": """你是一个信息搜索专家。
职责：根据任务要求搜索相关信息，整理归纳。
输出要求：清晰的结构化信息，关键要点提炼。""",

    "coder": """你是一个编程专家。
职责：编写清晰、高效且遵循最佳实践的代码。
输出要求：完整可运行的代码，包含必要的注释。""",

    "researcher": """你是一个研究专家。
职责：进行深入的文献和技术调研。
输出要求：系统化的研究报告，深度分析。""",

    "analyzer": """你是一个分析专家。
职责：进行逻辑严密的分析和推理。
输出要求：结构化的分析报告，明确结论。""",

    "writer": """你是一个写作专家。
职责：创作生动、优美且易读的内容。
输出要求：清晰的结构，准确的表达。""",

    "planner": """你是一个规划专家。
职责：制定详细的执行计划和方案。
输出要求：分阶段计划，明确分工。""",

    "image_analyzer": """你是一个图片分析专家。
职责：分析图片内容，识别物体和场景。
输出要求：详细的视觉描述。"""
}

# ============================================================================
# 🛠️ 核心辅助函数：获取专家配置
# ============================================================================

def _get_expert_settings(expert_key: str) -> Tuple[str, str, float]:
    """
    获取专家的运行时配置 (Prompt, Model, Temperature)
    优先级：数据库动态配置 > 硬编码默认值
    """
    # 1. 尝试读库
    db_config = get_expert_config_cached(expert_key)
    
    if db_config:
        # 数据库中有配置
        prompt = db_config.get("system_prompt") or EXPERT_PROMPTS.get(expert_key, "")
        model = db_config.get("model", "gpt-4o") # 默认模型
        temp = db_config.get("temperature", 0.5)
        return prompt, model, temp
    
    # 2. 回退到硬编码
    prompt = EXPERT_PROMPTS.get(expert_key, "You are a helpful assistant.")
    return prompt, "gpt-4o", 0.5

def format_input_data(data: Dict[str, Any]) -> str:
    """格式化输入数据"""
    if not data: return "无"
    return "\n".join([f"  - {k}: {v}" for k, v in data.items()])

def extract_code_blocks(content: str) -> Optional[tuple[str, str]]:
    """提取代码块 (用于 Coder 专家)"""
    pattern = r'```(\w+)?\n(.*?)\n```'
    matches = re.findall(pattern, content, re.DOTALL)
    if matches:
        lang, code = matches[0]
        return (lang or 'text', code.strip())
    return None

# ============================================================================
# 🔍 Search Expert
# ============================================================================

async def run_search_expert(state: Dict[str, Any], llm) -> Dict[str, Any]:
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    if current_index >= len(task_list): return {"error": "无任务"}
    
    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})
    started_at = datetime.now()

    # [NEW] 读取配置
    system_prompt, model, temp = _get_expert_settings("search")
    llm_with_config = llm.bind(model=model, temperature=temp)

    try:
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)
        print(f"[SEARCH] 完成 ({duration_ms}ms)")

        result = {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms,
            "artifact": {
                "type": "text",
                "title": "搜索结果",
                "content": response.content,
                "source": "search_expert"
            }
        }
        return result
    except Exception as e:
        return {"error": str(e), "status": "failed"}

# ============================================================================
# 💻 Coder Expert
# ============================================================================

async def run_coder_expert(state: Dict[str, Any], llm) -> Dict[str, Any]:
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    if current_index >= len(task_list): return {"error": "无任务"}

    current_task = task_list[current_index]
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})
    started_at = datetime.now()

    # [NEW] 读取配置
    system_prompt, model, temp = _get_expert_settings("coder")
    llm_with_config = llm.bind(model=model, temperature=temp)

    try:
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        # Artifact 处理逻辑保持不变
        artifact_data = None
        code_result = extract_code_blocks(response.content)
        
        if code_result:
            lang, code = code_result
            lang_lower = lang.lower() if lang else ""
            artifact_type = "code"
            
            if lang_lower in ["html", "htm", "svg"]: artifact_type = "html"
            elif lang_lower in ["md", "markdown"]: artifact_type = "markdown"

            artifact_data = {
                "type": artifact_type,
                "language": lang,
                "title": f"{lang} 代码",
                "content": code,
                "source": "coder_expert"
            }

        result = {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms
        }
        if artifact_data:
            result["artifact"] = artifact_data
            
        return result
    except Exception as e:
        return {"error": str(e), "status": "failed"}

# ============================================================================
# 🔬 Researcher Expert
# ============================================================================

async def run_researcher_expert(state: Dict[str, Any], llm) -> Dict[str, Any]:
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    if current_index >= len(task_list):
        return {"error": "无任务", "status": "failed"}
    current_task = task_list[current_index]
    started_at = datetime.now()

    # [NEW] 读取配置
    system_prompt, model, temp = _get_expert_settings("researcher")
    llm_with_config = llm.bind(model=model, temperature=temp)

    try:
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"任务描述: {current_task.get('description')}\n\n输入:\n{format_input_data(current_task.get('input_data'))}")
        ])
        
        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        return {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms,
            "artifact": {
                "type": "text",
                "title": "研究报告",
                "content": response.content,
                "source": "researcher_expert"
            }
        }
    except Exception as e:
        return {"error": str(e), "status": "failed"}

# ============================================================================
# 📊 Analyzer Expert
# ============================================================================

async def run_analyzer_expert(state: Dict[str, Any], llm) -> Dict[str, Any]:
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    if current_index >= len(task_list):
        return {"error": "无任务", "status": "failed"}
    current_task = task_list[current_index]
    started_at = datetime.now()

    # [NEW] 读取配置
    system_prompt, model, temp = _get_expert_settings("analyzer")
    llm_with_config = llm.bind(model=model, temperature=temp)

    try:
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"任务: {current_task.get('description')}\n\n输入:\n{format_input_data(current_task.get('input_data'))}")
        ])
        
        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        return {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms,
            "artifact": {
                "type": "text",
                "title": "分析结果",
                "content": response.content,
                "source": "analyzer_expert"
            }
        }
    except Exception as e:
        return {"error": str(e), "status": "failed"}

# ============================================================================
# 📝 Writer Expert
# ============================================================================

async def run_writer_expert(state: Dict[str, Any], llm) -> Dict[str, Any]:
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    if current_index >= len(task_list):
        return {"error": "无任务", "status": "failed"}
    current_task = task_list[current_index]
    started_at = datetime.now()

    # [NEW] 读取配置
    system_prompt, model, temp = _get_expert_settings("writer")
    llm_with_config = llm.bind(model=model, temperature=temp)

    try:
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"任务: {current_task.get('description')}\n\n输入:\n{format_input_data(current_task.get('input_data'))}")
        ])
        
        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        return {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms,
            "artifact": {
                "type": "markdown",
                "title": "写作内容",
                "content": response.content,
                "source": "writer_expert"
            }
        }
    except Exception as e:
        return {"error": str(e), "status": "failed"}

# ============================================================================
# 🧠 Planner Expert (子任务模式)
# ============================================================================

async def run_planner_expert(state: Dict[str, Any], llm) -> Dict[str, Any]:
    # Planner 通常作为 graph.py 的一部分，但如果作为子任务调用，逻辑如下
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    if current_index >= len(task_list):
        return {"error": "无任务", "status": "failed"}
    current_task = task_list[current_index]
    started_at = datetime.now()

    # [NEW] 读取配置 (注意 key 仍然是 commander 以保持兼容)
    system_prompt, model, temp = _get_expert_settings("commander")
    llm_with_config = llm.bind(model=model, temperature=temp)

    try:
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"规划任务: {current_task.get('description')}")
        ])
        
        completed_at = datetime.now()
        return {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": int((completed_at - started_at).total_seconds() * 1000),
            "artifact": {
                "type": "text",
                "title": "规划方案",
                "content": response.content,
                "source": "planner_expert"
            }
        }
    except Exception as e:
        return {"error": str(e), "status": "failed"}

# ============================================================================
# 🖼️ Image Analyzer Expert
# ============================================================================

async def run_image_analyzer_expert(state: Dict[str, Any], llm) -> Dict[str, Any]:
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    current_task = task_list[current_index]
    input_data = current_task.get("input_data", {})
    started_at = datetime.now()

    # [NEW] 读取配置
    system_prompt, model, temp = _get_expert_settings("image_analyzer")
    llm_with_config = llm.bind(model=model, temperature=temp)

    try:
        content = f"任务: {current_task.get('description')}"
        if input_data.get("image_url"): content += f"\n\n图片URL: {input_data['image_url']}"

        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=content)
        ])
        
        completed_at = datetime.now()
        return {
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": int((completed_at - started_at).total_seconds() * 1000),
            "artifact": {
                "type": "text",
                "title": "图像分析",
                "content": response.content,
                "source": "image_analyzer_expert"
            }
        }
    except Exception as e:
        return {"error": str(e), "status": "failed"}

# ============================================================================
# 专家映射
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

__all__ = [
    "EXPERT_PROMPTS",
    "EXPERT_FUNCTIONS",
    "run_search_expert", "run_coder_expert", "run_researcher_expert",
    "run_analyzer_expert", "run_writer_expert", "run_planner_expert", 
    "run_image_analyzer_expert"
]