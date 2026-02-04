"""
动态专家执行系统（使用数据库加载的 Prompt）

重构专家执行逻辑：
1. 使用 expert_loader 从数据库加载配置
2. 使用动态模型和温度参数
3. 支持管理员实时更新 Prompt
"""
import os
from typing import Dict, Any, List, Optional
from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage
from langchain_openai import ChatOpenAI
from datetime import datetime
from sqlmodel import Session, select

from agents.expert_loader import get_expert_config_cached, refresh_cache
from agents.experts import EXPERT_DESCRIPTIONS
from agents.model_fallback import get_effective_model, get_default_model
from models import SystemExpert


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
        # 从数据库读取温度，但如果模型配置中有特殊约束，则使用模型配置中的值
        db_temperature = expert_config["temperature"]

        # 检查模型配置，获取实际的 API 模型名称和 temperature 约束
        from providers_config import get_model_config
        model_config = get_model_config(model)
        if model_config:
            # 使用 providers.yaml 中定义的 model 字段（实际 API 模型名称）
            actual_model = model_config.get('model', model)
            temperature = model_config.get('temperature', db_temperature)
        else:
            # 未找到配置，使用原始值
            actual_model = model
            temperature = db_temperature

        print(f"[DynamicExpert] Running {expert_key} with model={actual_model}, temp={temperature} (db={db_temperature}, config={model})")

        # 获取当前任务
        task_list = state.get("task_list", [])
        current_index = state.get("current_task_index", 0)

        if current_index >= len(task_list):
            return {"error": "没有待执行的任务"}

        current_task = task_list[current_index]
        description = current_task.get("description", "")
        input_data = current_task.get("input_data", {})

        # v3.1: 提取依赖上下文（如果有）
        dependency_context = input_data.get("__dependency_context", "")
        # 从 input_data 中移除内部字段，避免暴露给 LLM
        clean_input_data = {k: v for k, v in input_data.items() if not k.startswith("__")}

        started_at = datetime.now()

        try:
            # 使用配置的模型和温度参数
            # 注意：使用 actual_model（providers.yaml 中定义的 API 模型名称）
            llm_with_config = llm.bind(
                model=actual_model,
                temperature=temperature
            )

            # v3.1: 构造带依赖上下文的 Prompt
            # 如果有前置任务输出，明确指示专家必须基于这些输出执行
            if dependency_context:
                human_message_content = f"""【重要】你必须基于以下前置任务的输出结果来完成当前任务。不要编造信息，必须从提供的上下文中提取关键数据。

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
                human_message_content = f"""任务描述: {description}

输入参数:
{format_input_data(clean_input_data)}"""

            # 👈 添加 RunnableConfig 标签，便于流式输出过滤
            from langchain_core.runnables import RunnableConfig
            response = await llm_with_config.ainvoke(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=human_message_content)
                ],
                config=RunnableConfig(
                    tags=["expert", expert_key],
                    metadata={"node_type": "expert", "expert_type": expert_key}
                )
            )

            completed_at = datetime.now()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            print(f"[{expert_key.upper()}] 专家完成 (耗时: {duration_ms/1000:.2f}s)")

            # 检查并清理输出内容（避免 task plan JSON 泄露到用户界面）
            cleaned_content = _clean_expert_output(response.content, expert_key)

            result = {
                "output_result": cleaned_content,
                "status": "completed",
                "started_at": started_at.isoformat(),
                "completed_at": completed_at.isoformat(),
                "duration_ms": duration_ms
            }

            # 根据专家类型和内容自动确定 artifact 类型
            artifact_type = _detect_artifact_type(cleaned_content, expert_key)

            # 添加 artifact（使用清理后的内容）
            result["artifact"] = {
                "type": artifact_type,
                "title": f"{expert_config['name']}结果",
                "content": cleaned_content,
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


def _clean_expert_output(content: str, expert_key: str) -> str:
    """
    清理专家输出，避免 task plan JSON 泄露到用户界面
    
    有些专家（如 writer、planner）可能会输出 task plan 格式的 JSON，
    这不是用户想要的结果。这个函数会检测并转换这种输出。
    """
    import json
    import re
    
    content_stripped = content.strip()
    
    # 移除 Markdown 代码块标记（如 ```json ... ```）
    code_block_pattern = r'^```(?:json)?\s*([\s\S]*?)\s*```$'
    match = re.match(code_block_pattern, content_stripped)
    if match:
        content_stripped = match.group(1).strip()
    
    # 检查是否是 task plan JSON
    if content_stripped.startswith('{') and content_stripped.endswith('}'):
        try:
            data = json.loads(content_stripped)
            # 如果包含 tasks 和 strategy 字段，说明是 task plan
            if isinstance(data, dict) and 'tasks' in data and 'strategy' in data:
                print(f"[{expert_key.upper()}] 检测到 task plan JSON，转换为自然语言描述")
                # 转换为自然语言描述
                tasks = data.get('tasks', [])
                strategy = data.get('strategy', '')
                
                lines = ["## 执行计划", ""]
                if strategy:
                    lines.append(f"**策略**: {strategy}")
                    lines.append("")
                
                if tasks:
                    lines.append("**任务列表**:")
                    for i, task in enumerate(tasks, 1):
                        expert_type = task.get('expert_type', 'unknown')
                        description = task.get('description', '')
                        lines.append(f"{i}. [{expert_type}] {description}")
                
                return "\n".join(lines)
        except json.JSONDecodeError:
            pass  # 不是有效的 JSON，保持原样
    
    return content

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
    content_lower = content.lower().strip()

    # 1. HTML 检测（最高优先级）
    # 检测完整的 HTML 文档或包含 <html> 标签的内容
    if (content_lower.startswith("<!doctype html") or
        content_lower.startswith("<html") or
        ("<html" in content_lower and "</html>" in content_lower)):
        return "html"

    # 2. 检测是否包含 HTML 代码块（```html）
    import re
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


async def generic_worker_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    通用工作节点：处理自定义专家（非系统内置专家）
    
    对于数据库中动态创建的专家，使用此通用节点执行。
    该节点自己负责创建 LLM 实例并加载专家配置。
    
    Args:
        state: 完整的 AgentState
    
    Returns:
        Dict: 执行结果（包含 output_result、status、artifact 等）
    """
    # 获取当前任务
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    
    if current_index >= len(task_list):
        return {"error": "没有待执行的任务"}
    
    current_task = task_list[current_index]
    expert_type = current_task.get("expert_type", "unknown")
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})
    
    print(f"[GenericWorker] 处理自定义专家: {expert_type}")
    
    # 从缓存加载专家配置，如果没有则从数据库加载
    expert_config = get_expert_config_cached(expert_type)
    
    # 如果缓存中没有，尝试从数据库加载（支持动态创建的自定义专家）
    if not expert_config and "db_session" in state:
        db = state["db_session"]
        try:
            from agents.expert_loader import get_expert_config
            expert_config = get_expert_config(expert_type, db)
            print(f"[GenericWorker] 从数据库加载专家配置: {expert_type}")
        except Exception as e:
            print(f"[GenericWorker] 从数据库加载失败: {e}")
    
    if not expert_config:
        return {
            "error": f"未找到专家 '{expert_type}' 的配置",
            "status": "failed",
            "output_result": f"专家 '{expert_type}' 未配置"
        }
    
    # 自己创建 LLM 实例
    from utils.llm_factory import get_expert_llm
    if 'provider' in expert_config:
        llm = get_expert_llm(provider=expert_config['provider'])
    else:
        llm = get_expert_llm()
    
    # 应用模型兜底机制
    model = get_effective_model(expert_config.get("model"))
    temperature = expert_config.get("temperature", 0.5)
    system_prompt = expert_config.get("system_prompt", "你是一个专业的AI助手。")
    expert_name = expert_config.get("name", expert_type)
    
    print(f"[GenericWorker] 使用模型: {model}, 温度: {temperature}")
    
    started_at = datetime.now()
    
    try:
        # 使用配置的模型和温度参数
        llm_with_config = llm.bind(
            model=model,
            temperature=temperature
        )
        
        from langchain_core.runnables import RunnableConfig
        response = await llm_with_config.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{format_input_data(input_data)}")
            ],
            config=RunnableConfig(
                tags=["expert", expert_type, "generic"],
                metadata={"node_type": "expert", "expert_type": expert_type, "is_generic": True}
            )
        )
        
        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)
        
        print(f"[GenericWorker] 专家完成 (耗时: {duration_ms/1000:.2f}s)")
        
        # 检查并清理输出内容
        cleaned_content = _clean_expert_output(response.content, expert_type)
        
        # 根据内容自动确定 artifact 类型
        artifact_type = _detect_artifact_type(cleaned_content, expert_type)
        
        return {
            "output_result": cleaned_content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms,
            "artifact": {
                "type": artifact_type,
                "title": f"{expert_name}结果",
                "content": cleaned_content,
                "source": f"{expert_type}_expert"
            }
        }
        
    except Exception as e:
        print(f"[GenericWorker] 专家失败: {e}")
        return {
            "output_result": f"{expert_name}失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
        }


def get_expert_function(expert_type: str):
    """
    获取专家执行函数
    
    对于系统内置专家（search, coder, researcher, analyzer, writer, planner, image_analyzer），
    返回对应的硬编码函数。
    
    对于自定义专家（数据库中动态创建的），返回 generic_worker_node。
    
    Args:
        expert_type: 专家类型标识
    
    Returns:
        callable: 专家执行函数
    """
    if expert_type in DYNAMIC_EXPERT_FUNCTIONS:
        return DYNAMIC_EXPERT_FUNCTIONS[expert_type]
    else:
        return generic_worker_node


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


def get_all_expert_list(db_session: Optional[Session] = None) -> List[tuple]:
    """
    获取所有可用专家的列表（包括动态创建的专家）
    
    从数据库中获取所有 SystemExpert 记录，返回格式化的专家信息列表。
    用于 Commander Node 动态注入专家列表到 System Prompt。
    
    Args:
        db_session: 数据库会话，如果为 None 则返回硬编码专家列表
        
    Returns:
        List[tuple]: 专家列表，每个元素为 (expert_key, name, description) 元组
        
    Example:
        >>> experts = get_all_expert_list(db_session)
        >>> print(experts)
        [('search', '搜索专家', '擅长信息搜索和查询'), ('coder', '编程专家', '擅长代码编写和调试')]
    """
    # 硬编码专家列表作为回退
    fallback_experts = [
        ("search", "搜索专家", "用于搜索、查询信息"),
        ("coder", "编程专家", "用于代码编写、调试、优化"),
        ("researcher", "研究专家", "用于深入研究、文献调研"),
        ("analyzer", "分析专家", "用于数据分析、逻辑推理"),
        ("writer", "写作专家", "用于文案撰写、内容创作"),
        ("planner", "规划专家", "用于任务规划、方案设计"),
        ("image_analyzer", "图片分析专家", "用于图片内容分析、视觉识别"),
    ]
    
    # 如果没有提供数据库会话，直接返回硬编码列表
    if db_session is None:
        print("[DynamicExpert] 未提供数据库会话，使用硬编码专家列表")
        return fallback_experts
    
    experts = []
    
    try:
        # 从数据库查询所有 SystemExpert（包括动态创建的）
        statement = select(SystemExpert).order_by(SystemExpert.expert_key)
        results = db_session.exec(statement).all()
        
        for expert in results:
            experts.append((
                expert.expert_key,
                expert.name,
                expert.description or "暂无描述"
            ))
        
        print(f"[DynamicExpert] 从数据库加载了 {len(experts)} 个专家")
            
    except Exception as e:
        print(f"[DynamicExpert] 获取专家列表失败: {e}，使用硬编码列表")
        # 发生异常时返回硬编码的专家列表
        experts = fallback_experts
    
    return experts


def format_expert_list_for_prompt(experts: List[tuple]) -> str:
    """
    将专家列表格式化为适合插入 Prompt 的字符串
    
    格式：- expert_key (Name): Description
    
    Args:
        experts: 专家列表，每个元素为 (expert_key, name, description) 元组
        
    Returns:
        str: 格式化后的专家列表字符串
        
    Example:
        >>> experts = [('search', '搜索专家', '擅长信息搜索')]
        >>> format_expert_list_for_prompt(experts)
        '- search (搜索专家): 擅长信息搜索'
    """
    if not experts:
        return "（暂无可用专家）"
    
    lines = []
    for expert_key, name, description in experts:
        lines.append(f"- {expert_key} ({name}): {description}")
    
    return "\n".join(lines)
