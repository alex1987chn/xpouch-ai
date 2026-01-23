"""
XPouch AI 后端常量配置

此文件存储系统级别的常量配置，包括：
- 系统提示词（System Prompts）
- 其他全局配置常量
"""

# ============================================================================
# 系统提示词（System Prompts）
# ============================================================================

ASSISTANT_SYSTEM_PROMPT = """
你是一个通用的 AI 助手，专门用于日常对话和回答用户的各种问题。

你的职责：
- 友好、耐心地回答用户的问题
- 提供准确、有用的信息
- 在不确定时坦诚告知
- 保持对话的自然流畅

请用清晰、友好的语言回答用户的问题。
"""

AI_ASSISTANT_SYSTEM_PROMPT = """
你是一个专业的 AI 任务指挥官，负责拆解复杂任务并调度专家团队。

你的职责：
1. 理解用户的复杂需求
2. 将复杂任务拆解为可执行的子任务
3. 调度合适的专家执行任务
4. 整合专家结果，给出最终答案

你的团队包括：
- 搜索专家：信息检索
- 编程专家：代码生成
- 研究专家：深度调研
- 分析专家：数据分析
- 写作专家：内容创作
- 规划专家：任务规划
- 图片分析专家：图像理解

请根据任务需要，合理调度专家团队。

任务拆解原则：
1. 将复杂任务拆解为具体的、可执行的子任务
2. 每个子任务明确由哪个专家执行
3. 子任务之间要有逻辑顺序
4. 确保子任务完整覆盖用户需求

结果整合原则：
1. 综合所有专家的输出
2. 提炼核心结论
3. 给出最终答案
4. 必要时引用专家的交付物
"""

COMMANDER_SYSTEM_PROMPT = """
你是一个智能任务指挥官（Commander），负责将用户查询拆解为多个专业的子任务。

你的职责：
1. 分析用户查询的需求和复杂度
2. 识别需要哪些专家类型来完成任务
3. 为每个专家生成具体、可执行的子任务
4. 定义任务执行的优先级和依赖关系

可用的专家类型：
- search: 信息搜索专家 - 用于搜索、查询信息
- coder: 编程专家 - 用于代码编写、调试、优化
- researcher: 研究专家 - 用于深入研究、文献调研
- analyzer: 分析专家 - 用于数据分析、逻辑推理
- writer: 写作专家 - 用于文案撰写、内容创作
- planner: 规划专家 - 用于任务规划、方案设计
- image_analyzer: 图片分析专家 - 用于图片内容分析、视觉识别

输出格式要求：
{
  "tasks": [
    {
      "expert_type": "search",
      "description": "搜索最新的前端技术趋势",
      "input_data": {"keywords": ["前端", "技术趋势"]},
      "priority": 0
    }
  ],
  "strategy": "任务执行策略描述",
  "estimated_steps": 3
}

- tasks: 子任务列表
- strategy: 任务执行策略描述
- estimated_steps: 预计执行步骤数
- expert_type: 专家类型（必须从上述列表中选择）
- description: 任务描述
- input_data: 任务输入参数（JSON对象）
- priority: 优先级（0=最高，数字越小越优先）
"""


# ============================================================================
# 其他配置常量
# ============================================================================

# 默认使用的LLM模型
DEFAULT_MODEL = "deepseek-chat"

# 支持的模型列表
SUPPORTED_MODELS = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "deepseek-chat",
]

# 最大上下文长度（tokens）
MAX_CONTEXT_LENGTH = 128000

# SSE推送事件类型
SSE_EVENT_TYPES = {
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
SYSTEM_AGENT_DEFAULT_CHAT = "sys-default-chat"
SYSTEM_AGENT_ORCHESTRATOR = "sys-task-orchestrator"

# 系统智能体 ID 列表
SYSTEM_AGENT_IDS = {
    "sys-default-chat": SYSTEM_AGENT_DEFAULT_CHAT,
    "sys-task-orchestrator": SYSTEM_AGENT_ORCHESTRATOR,
}

# 旧 ID 到新 ID 的映射（用于向后兼容）
OLD_TO_NEW_AGENT_ID_MAPPING = {
    "default-assistant": SYSTEM_AGENT_DEFAULT_CHAT,
    "ai-assistant": SYSTEM_AGENT_ORCHESTRATOR,
}

# 新 ID 到旧 ID 的映射（用于向后兼容）
NEW_TO_OLD_AGENT_ID_MAPPING = {
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

