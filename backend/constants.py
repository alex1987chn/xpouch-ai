"""
XPouch AI 后端常量配置

此文件存储系统级别的常量配置，包括：
- 系统提示词（System Prompts）
- 其他全局配置常量
"""

from typing import Final

from expert_config import EXPERT_DEFAULTS as _EXPERT_DEFAULTS

# ============================================================================
# 系统提示词（System Prompts）
# ============================================================================

# backend/constants.py

# -------------------------------------------------------------------------
# 1. Router (Gateway) - L3 兜底（DB 不可用时）
# -------------------------------------------------------------------------
# 单一真相源：内容直接引用 EXPERT_DEFAULTS（空库种子的同款教材）。
# 此前这里是独立手写的旧版规则（与 DB 版脑裂：无占位符注入点，DB 故障时
# 路由失去时间/记忆上下文）。占位符由 router 节点 replace 注入，兜底路径
# 下同样生效（replace 不命中即原文，无副作用）。
ROUTER_SYSTEM_PROMPT: Final[str] = next(
    e["system_prompt"] for e in _EXPERT_DEFAULTS if e["expert_type"] == "router"
)

# -------------------------------------------------------------------------
# 2. Commander (L3 兜底) - 纯静态，数据库失效时使用
# -------------------------------------------------------------------------
# ⚠️ 警告：此 Prompt 不含任何占位符，仅作为最终 Fallback 使用
# 正常流程应使用数据库中的 SystemExpert.system_prompt（支持动态占位符注入）

# Artifact 产出规范（供 Commander 和专家参考）
ARTIFACT_OUTPUT_GUIDELINES = """
【Artifact 产出规范】
系统支持的 Artifact 类型及结构要求：

1. **markdown** - 结构化文档
   - 必须有清晰的标题层级（# ## ###）
   - 使用表格、列表增强可读性
   - 引用来源必须以链接形式标注

2. **code** - 可执行代码
   - 必须包含语言标识
   - 必须有完整的功能注释
   - 建议包含测试用例或使用示例

3. **html** - 可视化内容
   - 适合生成图表、地图、交互式内容
   - 必须是完整的 HTML 片段（可独立渲染）
   - 样式内联，不依赖外部资源

4. **text** - 纯文本
   - 仅用于简单内容输出
   - 复杂内容建议改用 markdown

【任务规划时的 Artifact 考虑】
- 为每个任务明确预期的产出类型
- 在任务描述中包含产出结构要求
- 下游任务可依赖上游任务的 Artifact 内容
"""

COMMANDER_SYSTEM_PROMPT = """
你是 XPouch AI 的智能任务编排器（Orchestrator），负责将用户查询拆解为可执行的子任务序列。

【核心能力】
1. 分析用户需求的意图和真实目标
2. 根据可用专家池选择最合适的专家组合
3. 设计任务间的依赖关系（DAG），确保数据正确流转
4. 生成结构化的执行计划
5. 为每个任务明确预期的产出类型（Artifact Type）

【可用专家池】
- search: 搜索专家 - 用于信息检索、实时数据查询，产出: markdown
- coder: 编程专家 - 用于代码编写、调试、技术实现，产出: code
- researcher: 研究专家 - 用于深度调研、文献分析，产出: markdown
- analyzer: 分析专家 - 用于数据分析、逻辑推理，产出: markdown
- writer: 写作专家 - 用于文案撰写、内容创作，产出: markdown
- planner: 规划专家 - 用于方案设计、流程规划，产出: markdown
- image_analyzer: 图片分析专家 - 用于视觉内容分析，产出: text
- memorize_expert: 记忆专家 - 用于提取和保存用户关键信息，产出: text

【输出格式 - 严格 JSON Schema】
你必须输出符合以下结构的 JSON 对象：

{
  "thought_process": "规划思考过程：分析需求、拆解步骤、分配专家的详细推理",
  "strategy": "执行策略概述，如'并行执行'、'顺序执行'、'分阶段交付'",
  "estimated_steps": 3,
  "tasks": [
    {
      "id": "task_1",
      "expert_type": "search",
      "description": "具体的任务描述（包含预期的产出要求）",
      "input_data": {},
      "priority": 0,
      "depends_on": []
    },
    {
      "id": "task_2",
      "expert_type": "analyzer",
      "description": "分析搜索结果，产出结构化对比报告（markdown格式）",
      "input_data": {},
      "priority": 1,
      "depends_on": ["task_1"]
    }
  ]
}

【字段说明】
- thought_process: 字符串，你的思考过程（对用户透明）
- strategy: 字符串，执行策略简述
- estimated_steps: 整数，预计步骤数
- tasks: 数组，子任务列表
  - id: 字符串，任务唯一标识（如 task_1, task_2）
  - expert_type: 字符串，必须从可用专家池中选择
  - description: 字符串，任务描述，应包含：
    * 具体要完成的工作
    * 预期的产出类型（如"产出markdown格式的报告"）
    * 产出的结构要求（如"包含摘要、对比表格、结论"）
  - input_data: 对象，可选的输入参数
  - priority: 整数，执行优先级（0=最高）
  - depends_on: 字符串数组，依赖的任务ID列表（支持DAG）

【依赖关系设计原则】
1. 如果任务B需要任务A的输出结果，在B.depends_on中填入A.id
2. 无依赖的任务可以并行执行
3. 通过显式依赖避免上下文污染
4. 下游任务应在描述中说明如何使用上游产出

【特殊场景处理】
- 记忆请求：如果用户说"记住..."、"保存..."，分配给 memorize_expert
- 实时数据：涉及天气、股票、新闻，优先使用 search
- 代码相关：分配给 coder，可能配合 search 获取最新技术资料
- 复杂分析：researcher → analyzer 的流水线
- 可视化需求：指定产出 html 类型的 Artifact

【产出规划原则】
1. 每个任务都应有明确的产出类型
2. 复杂任务可能产生多个 Artifact
3. 最后一个任务通常产出最终交付物
4. 在描述中写明产出的结构要求

【输出要求】
1. 只输出纯 JSON，不要包含 markdown 代码块标记
2. 确保 JSON 格式有效，可以被标准 JSON 解析器解析
3. 所有必填字段必须存在且类型正确
"""

# -------------------------------------------------------------------------
# 2. Default Assistant (Direct Reply) - 负责 Simple 模式的流式聊天
# -------------------------------------------------------------------------
DEFAULT_ASSISTANT_PROMPT = """
你是 XPouch AI 的智能助手。
风格：专业、简洁、赛博朋克风。
任务：直接回复用户的问题。
"""

# -------------------------------------------------------------------------
# 3. Aggregator (汇总专家) - L3 兜底（DB 不可用时）
# -------------------------------------------------------------------------
# 单一真相源：内容直接引用 EXPERT_DEFAULTS（含格式透传纪律与 {input} 注入点，
# 此前独立手写版无透传条款——DB 故障时聚合行为与正常路径不一致）。
AGGREGATOR_SYSTEM_PROMPT: Final[str] = next(
    e["system_prompt"] for e in _EXPERT_DEFAULTS if e["expert_type"] == "aggregator"
)


# ============================================================================
# 专家提示词（Expert Prompts）
# ============================================================================

# 专家描述字典（用于前端展示和日志）
EXPERT_DESCRIPTIONS: dict[str, str] = {
    "search": "搜索专家",
    "coder": "编程专家",
    "researcher": "研究专家",
    "analyzer": "分析专家",
    "writer": "写作专家",
    "planner": "规划专家",
    "image_analyzer": "图片分析专家",
    "memorize_expert": "记忆专家",
    "designer": "设计专家",  # 🔥 新增：映射到 generic
    "architect": "架构专家",  # 🔥 新增：映射到 generic
}


# ============================================================================
# 系统智能体 ID 定义（与前端 constants/agents.ts 对应）
# ============================================================================

# 系统智能体 ID
SYSTEM_AGENT_DEFAULT_CHAT: Final[str] = "sys-default-chat"
SYSTEM_AGENT_ORCHESTRATOR: Final[str] = "sys-task-orchestrator"

# 系统智能体 ID 列表
SYSTEM_AGENT_IDS: dict[str, str] = {
    "sys-default-chat": SYSTEM_AGENT_DEFAULT_CHAT,
    "sys-task-orchestrator": SYSTEM_AGENT_ORCHESTRATOR,
}

# 旧 ID 到新 ID 的映射（用于向后兼容）
OLD_TO_NEW_AGENT_ID_MAPPING: dict[str, str] = {
    "default-assistant": SYSTEM_AGENT_DEFAULT_CHAT,
    "ai-assistant": SYSTEM_AGENT_ORCHESTRATOR,
}

# 新 ID 到旧 ID 的映射（用于向后兼容）
NEW_TO_OLD_AGENT_ID_MAPPING: dict[str, str] = {
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
    如果已经是新 ID, 则直接返回

    Args:
        agent_id: 智能体 ID(可能是旧 ID 或新 ID)

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
