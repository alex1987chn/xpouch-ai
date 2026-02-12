"""
Prompt 工具函数

提供 System Prompt 增强功能：
- 当前时间注入
- 通用 Prompt 增强
"""

from datetime import datetime


def inject_current_time(system_prompt: str) -> str:
    """
    在 System Prompt 中注入当前时间

    让 LLM 知道当前的确切时间，自动将"今天"、"昨天"等相对时间转换为具体日期

    Args:
        system_prompt: 原始 System Prompt

    Returns:
        注入时间信息后的增强 Prompt

    Example:
        >>> prompt = inject_current_time("你是一个助手。")
        >>> print(prompt)
        【当前系统时间】：2026年02月12日 14:30:00 星期四
        【当前日期】：2026-02-12

        你是一个助手。

        【时间处理指令】：
        - 如果用户询问"今天"、"昨天"或"最近"的新闻/事件，请根据【当前日期】将相对时间转换为具体日期格式
        ...
    """
    now = datetime.now()
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    weekday_str = weekdays[now.weekday()]

    # 格式化时间：2026年02月06日 14:30:00 星期五
    time_str = now.strftime(f"%Y年%m月%d日 %H:%M:%S {weekday_str}")
    date_str = now.strftime("%Y-%m-%d")

    # 构建增强的 System Prompt
    enhanced_prompt = f"""【当前系统时间】：{time_str}
【当前日期】：{date_str}

{system_prompt}

【时间处理指令】：
- 如果用户询问"今天"、"昨天"或"最近"的新闻/事件，请根据【当前日期】将相对时间转换为具体日期格式（如 "{date_str}"）
- 调用搜索工具时，请使用具体日期而非相对时间（例如："{date_str} AI新闻" 而不是 "今天的新闻"）
- 这会帮助搜索工具返回更精准的结果
"""

    return enhanced_prompt


def enhance_system_prompt_with_tools(system_prompt: str) -> str:
    """
    【增强版】System Prompt 注入
    
    功能: 注入时间 + 强制工具使用指令 + 防偷懒逻辑
    
    用于 Generic Worker 节点，强制模型使用工具而非脑补答案。
    """
    now = datetime.now()
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    weekday_str = weekdays[now.weekday()]
    time_str = now.strftime(f"%Y年%m月%d日 %H:%M:%S {weekday_str}")
    date_str = now.strftime("%Y-%m-%d")

    # 🔥 核心增强：给模型洗脑，强制它使用工具，禁止脑补
    enhanced_prompt = f"""【当前系统时间】：{time_str}
【当前日期】：{date_str}

{system_prompt}

【工具使用强制指令 (Mandatory Tool Usage)】：
你拥有强大的外部工具，针对以下情况 **必须** 调用工具，**严禁** 仅凭训练数据回答：
1. **涉及具体 URL**：如果任务包含 http/https 链接（如 GitHub, 技术博客），**必须** 调用 `read_webpage` 读取全文。
2. **涉及参数对比/最新技术**：如果任务要求"研究 DeepSeek-V3"、"参数对比"，**必须** 调用 `search_web` 或 `read_webpage` 获取一手数据。

【防偷懒协议 (Anti-Laziness Protocol)】：
1. **禁止复用上下文**：即使你觉得之前的对话里好像提到过相关信息，针对当前的具体任务（特别是 GitHub 阅读任务），你依然**必须**重新执行工具调用。
2. **看到 URL 就去读**：不要盯着 URL 发呆，不要猜测 URL 里的内容。直接调用 `read_webpage`！
3. **一步一动**：不要试图在一个回合里把所有事做完。先调工具 -> 拿到结果 -> 再分析。

【执行逻辑】：
检测到任务需求 -> 决定工具 (Search 或 Read) -> **输出 Tool Call** -> (等待执行) -> 获取 Artifact -> 生成回答。

【容错处理指令 (Fault Tolerance)】：
如果参考上下文中提到某些上游任务（如代码生成、数据分析等）的输出，但这些内容缺失或为空，
请不要抱怨或询问，而是基于你已有的知识和当前可用信息，尽最大努力完成任务。
忽略对缺失内容的引用，专注于完成核心任务目标。
"""
    return enhanced_prompt
