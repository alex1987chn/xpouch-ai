"""
XPouch AI 动态专家执行模块 (v2.7 架构 - 数据库驱动版)
实现各个垂直领域专家的具体执行逻辑，优先读取数据库配置，支持硬编码回退。
"""
from typing import Dict, Any, Tuple, Optional
from datetime import datetime
import re
from langchain_core.messages import SystemMessage, HumanMessage
from agents.expert_loader import get_expert_config_cached
from constants import EXPERT_DESCRIPTIONS, EXPERT_PROMPTS
from utils.llm_factory import get_effective_model, get_default_model

# ============================================================================
# 🛠️ 核心辅助函数：获取专家配置
# ============================================================================

def _get_expert_settings(expert_key: str) -> Tuple[str, str, float]:
    """
    获取专家的运行时配置 (Prompt, Model, Temperature)
    优先级：数据库动态配置 > 硬编码默认值
    模型兜底：如果配置的模型不可用，自动切换为环境变量中的默认模型
    """
    # 1. 尝试读库
    db_config = get_expert_config_cached(expert_key)

    if db_config:
        # 数据库中有配置
        prompt = db_config.get("system_prompt") or EXPERT_PROMPTS.get(expert_key, "")
        # 应用模型兜底机制
        model = get_effective_model(db_config.get("model"))
        temp = db_config.get("temperature", 0.5)
        return prompt, model, temp

    # 2. 回退到硬编码
    prompt = EXPERT_PROMPTS.get(expert_key, "You are a helpful assistant.")
    return prompt, get_default_model(), 0.5

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

# v3.1: 新增辅助函数 - 构建带依赖上下文的专家 Prompt
def _build_expert_prompt(current_task: Dict[str, Any]) -> str:
    """
    构建专家执行的 HumanMessage 内容
    支持依赖上下文注入（通过 __dependency_context 字段）
    
    关键改进：明确指示专家必须基于前置任务输出执行当前任务
    
    Args:
        current_task: 当前任务字典
        
    Returns:
        str: 构造好的 Prompt 内容
    """
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})
    
    # 提取依赖上下文（内部字段，不暴露给 LLM）
    dependency_context = input_data.get("__dependency_context", "")
    # 清理 input_data，移除内部字段
    clean_input_data = {k: v for k, v in input_data.items() if not k.startswith("__")}
    
    if dependency_context:
        return f"""【重要】你必须基于以下前置任务的输出结果来完成当前任务。不要编造信息，必须从提供的上下文中提取关键数据。

前置任务输出（这是你唯一的信息来源）：
{dependency_context}

---

当前任务指令: {description}

附加输入参数:
{format_input_data(clean_input_data)}

---

⚠️ 执行要求：
1. 你必须引用并使用前置任务输出中的具体数据
2. 如果前置任务提供了多个选项/数据点，请明确说明你使用了哪一个
3. 不要返回占位符（如"[请在此处插入...]"），必须填入实际从前置输出中提取的内容"""
    else:
        return f"""任务描述: {description}

输入参数:
{format_input_data(clean_input_data)}"""

# ============================================================================
# 🔍 Search Expert
# ============================================================================

async def run_search_expert(state: Dict[str, Any], llm) -> Dict[str, Any]:
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    if current_index >= len(task_list): return {"error": "无任务"}
    
    current_task = task_list[current_index]
    started_at = datetime.now()

    # [NEW] 读取配置
    system_prompt, model, temp = _get_expert_settings("search")
    llm_with_config = llm.bind(model=model, temperature=temp)

    try:
        # v3.1: 使用新的 Prompt 构建函数，支持依赖上下文注入
        human_prompt = _build_expert_prompt(current_task)
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
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
    started_at = datetime.now()

    # [NEW] 读取配置
    system_prompt, model, temp = _get_expert_settings("coder")
    llm_with_config = llm.bind(model=model, temperature=temp)

    try:
        # v3.1: 使用新的 Prompt 构建函数，支持依赖上下文注入
        human_prompt = _build_expert_prompt(current_task)
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
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
        # v3.1: 使用新的 Prompt 构建函数，支持依赖上下文注入
        human_prompt = _build_expert_prompt(current_task)
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
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
        # v3.1: 使用新的 Prompt 构建函数，支持依赖上下文注入
        human_prompt = _build_expert_prompt(current_task)
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
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
        # v3.1: 使用新的 Prompt 构建函数，支持依赖上下文注入
        human_prompt = _build_expert_prompt(current_task)
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
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
        # v3.1: 使用新的 Prompt 构建函数，支持依赖上下文注入
        human_prompt = _build_expert_prompt(current_task)
        response = await llm_with_config.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
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
        # v3.1: 构建带依赖上下文的 content
        dependency_context = input_data.get("__dependency_context", "")
        clean_input_data = {k: v for k, v in input_data.items() if not k.startswith("__")}
        
        content_parts = []
        if dependency_context:
            content_parts.append(f"参考上下文（前置任务输出）：\n{dependency_context}\n\n---\n")
        
        content_parts.append(f"任务: {current_task.get('description')}")
        if clean_input_data.get("image_url"): 
            content_parts.append(f"\n\n图片URL: {clean_input_data['image_url']}")
        
        content = "\n".join(content_parts)

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