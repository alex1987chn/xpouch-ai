"""
XPouch AI 后端常量配置

此文件存储系统级别的常量配置，包括：
- 系统提示词（System Prompts）
- 其他全局配置常量
"""

from typing import Dict, Final

# ============================================================================
# 系统提示词（System Prompts）
# ============================================================================

# backend/constants.py

# -------------------------------------------------------------------------
# 1. Router (Gateway) - 纯静态，只做分类
# -------------------------------------------------------------------------
ROUTER_SYSTEM_PROMPT = """
你是 XPouch AI 的底层意图网关。
你必须且只能输出以下 JSON 格式之一，严禁输出任何其他内容：
{ "decision_type": "simple" }
或
{ "decision_type": "complex" }

判断逻辑：
- Simple: 闲聊、问候、常识、简单代码、无需联网、无需规划。
- Complex: 需要联网、需要运行代码、复杂项目、深度分析。

注意：请根据用户的最新输入进行判断。
"""

# -------------------------------------------------------------------------
# 2. Default Assistant (Direct Reply) - 负责 Simple 模式的流式聊天
# -------------------------------------------------------------------------
DEFAULT_ASSISTANT_PROMPT = """
你是 XPouch AI 的智能助手。
风格：专业、简洁、赛博朋克风。
任务：直接回复用户的问题。
"""

COMMANDER_SYSTEM_PROMPT_TEMPLATE = """
你是一个智能任务指挥官（Commander/工作流架构师），负责将用户查询拆解为多个专业的子任务，并构建任务间的数据依赖关系（DAG）。

当前可用专家资源如下：
{dynamic_expert_list}

你的职责：
1. 分析用户查询的需求和复杂度
2. 从上述专家列表中选择最合适的专家类型
3. 为每个专家生成具体、可执行的子任务
4. **关键：理解任务间的因果关系，显式定义数据依赖关系**

依赖关系设计原则：
- 如果任务 B 需要任务 A 的输出结果作为输入，请在 B 的 depends_on 中填入 A 的 id
- 无依赖的任务可以并行执行
- 通过显式依赖避免上下文污染（专家只看到真正需要的前置输出）

注意：expert_type 必须从上述列表中选择。

输出格式要求（严格 JSON）：
{{
  "tasks": [
    {{
      "id": "task_search",
      "expert_type": "search",
      "description": "搜索2024年销量最高的电动车品牌",
      "input_data": {{"keywords": ["2024", "电动车", "销量"]}},
      "priority": 0,
      "depends_on": []
    }},
    {{
      "id": "task_analyze",
      "expert_type": "analyzer",
      "description": "分析该品牌电动车的电池技术参数",
      "input_data": {{}},
      "priority": 1,
      "depends_on": ["task_search"]
    }}
  ],
  "strategy": "先搜索获取基础信息，再进行分析处理",
  "estimated_steps": 2
}}

字段说明：
- id: 任务唯一标识（短命名，如 task_search, task_code）
- expert_type: 专家类型（必须从列表中选择）
- description: 任务描述
- input_data: 任务输入参数（JSON对象）
- priority: 优先级（0=最高）
- depends_on: 依赖的任务ID列表（如 ["task_search"]）
- strategy: 任务执行策略描述
- estimated_steps: 预计执行步骤数

重要提示：
1. 每个任务必须有唯一的 id
2. 如果任务间有数据流转关系，必须显式声明 depends_on
3. 这将决定后续专家能接收到哪些前置任务的输出
"""

# 向后兼容：保留原有的静态 Prompt（不包含动态专家列表）
COMMANDER_SYSTEM_PROMPT = COMMANDER_SYSTEM_PROMPT_TEMPLATE.format(dynamic_expert_list="""
- search: 信息搜索专家 - 用于搜索、查询信息
- coder: 编程专家 - 用于代码编写、调试、优化
- researcher: 研究专家 - 用于深入研究、文献调研
- analyzer: 分析专家 - 用于数据分析、逻辑推理
- writer: 写作专家 - 用于文案撰写、内容创作
- planner: 规划专家 - 用于任务规划、方案设计
- image_analyzer: 图片分析专家 - 用于图片内容分析、视觉识别

显式依赖示例：
1. search (task_1) → analyzer (task_2, depends_on: ["task_1"])
2. search (task_1) + search (task_2) → writer (task_3, depends_on: ["task_1", "task_2"])
""")


# ============================================================================
# 专家提示词（Expert Prompts）
# ============================================================================

# 专家描述字典（用于前端展示和日志）
EXPERT_DESCRIPTIONS: Dict[str, str] = {
    "search": "搜索专家",
    "coder": "编程专家",
    "researcher": "研究专家",
    "analyzer": "分析专家",
    "writer": "写作专家",
    "planner": "规划专家",
    "image_analyzer": "图片分析专家"
}

# 专家提示词字典（默认值，数据库无配置时使用）
EXPERT_PROMPTS: Dict[str, str] = {
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
# 其他配置常量
# ============================================================================

# SSE推送事件类型
SSE_EVENT_TYPES: Dict[str, str] = {
    "MESSAGE": "message",
    "ARTIFACTS": "artifacts",
    "EXPERT_STARTED": "expert_started",
    "EXPERT_COMPLETED": "expert_completed",
    "TASK_PLAN": "task_plan",
    "FINAL_RESPONSE": "final_response",
    "ERROR": "error",
}


# ============================================================================
# 系统智能体 ID 定义（与前端 constants/agents.ts 对应）
# ============================================================================

# 系统智能体 ID
SYSTEM_AGENT_DEFAULT_CHAT: Final[str] = "sys-default-chat"
SYSTEM_AGENT_ORCHESTRATOR: Final[str] = "sys-task-orchestrator"

# 系统智能体 ID 列表
SYSTEM_AGENT_IDS: Dict[str, str] = {
    "sys-default-chat": SYSTEM_AGENT_DEFAULT_CHAT,
    "sys-task-orchestrator": SYSTEM_AGENT_ORCHESTRATOR,
}

# 旧 ID 到新 ID 的映射（用于向后兼容）
OLD_TO_NEW_AGENT_ID_MAPPING: Dict[str, str] = {
    "default-assistant": SYSTEM_AGENT_DEFAULT_CHAT,
    "ai-assistant": SYSTEM_AGENT_ORCHESTRATOR,
}

# 新 ID 到旧 ID 的映射（用于向后兼容）
NEW_TO_OLD_AGENT_ID_MAPPING: Dict[str, str] = {
    SYSTEM_AGENT_DEFAULT_CHAT: "default-assistant",
    SYSTEM_AGENT_ORCHESTRATOR: "ai-assistant",
}


# ============================================================================
# 辅助函数
# ============================================================================

def normalize_agent_id(agent_id: str) -> str:
    """
    规范化智能体 ID
    
    将旧的硬编码 ID 映射到新的语义化 ID
    如果已经是新 ID，则直接返回
    
    Args:
        agent_id: 智能体 ID（可能是旧 ID 或新 ID）
    
    Returns:
        str: 规范化后的智能体 ID
    
    Examples:
        >>> normalize_agent_id('default-assistant')
        'sys-default-chat'
        >>> normalize_agent_id('ai-assistant')
        'sys-task-orchestrator'
        >>> normalize_agent_id('sys-default-chat')
        'sys-default-chat'
    """
    # 如果是旧 ID，映射到新 ID
    return OLD_TO_NEW_AGENT_ID_MAPPING.get(agent_id, agent_id)


def is_system_agent(agent_id: str) -> bool:
    """
    判断是否为系统智能体
    
    Args:
        agent_id: 智能体 ID
    
    Returns:
        bool: 是否为系统智能体
    
    Examples:
        >>> is_system_agent('sys-default-chat')
        True
        >>> is_system_agent('sys-task-orchestrator')
        True
        >>> is_system_agent('custom-uuid-123')
        False
    """
    return agent_id in SYSTEM_AGENT_IDS

