"""
Prompt 工具函数

提供 System Prompt 增强功能：
- 当前时间注入（用户墙钟：utils.time.display_now，随 DISPLAY_TIMEZONE 配置）
- 通用 Prompt 增强
"""

from utils.time import display_now, format_display_datetime


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
    now = display_now()
    time_str = format_display_datetime(now)
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


def format_tool_manifest(bindable_tools: list, builtin_names: set[str], max_tools: int = 30) -> str:
    """生成本次执行实际绑定的工具清单（真名 + 首行描述 + 来源标注）。

    这是专家"认知"MCP 工具的唯一通道：bind_tools 只把 schema 给了模型，
    若 prompt 里不列清单、不给选择指引，教材只教过内置工具的专家
    （如 search 教材定向到网页搜索）永远不会主动翻 schema 用 maps_*。
    动态生成的好处：新接 MCP 服务器零教材改动，清单永远是真名——
    此前指令层硬编码 `search_web`/`read_webpage`，与实际绑定的
    `asearch_web`/`aread_webpage` 对不上，模型全靠猜（实测漏洞）。
    """
    lines = []
    for tool in bindable_tools[:max_tools]:
        name = getattr(tool, "name", None) or getattr(tool, "__name__", str(tool))
        description = (getattr(tool, "description", "") or "").strip()
        first_line = description.splitlines()[0][:80] if description else "（无描述）"
        source = "内置" if name in builtin_names else "MCP"
        lines.append(f"- {name}（{source}）：{first_line}")
    if len(bindable_tools) > max_tools:
        lines.append(f"…（其余 {len(bindable_tools) - max_tools} 个工具见调用规范）")
    return "\n".join(lines)


def enhance_system_prompt_with_tools(
    system_prompt: str,
    bindable_tools: list | None = None,
    builtin_names: set[str] | None = None,
) -> str:
    """
    【增强版】System Prompt 注入（Generic Worker 专用）

    注入：当前时间 + **本次实际绑定的工具清单**（真名动态生成）+ 工具选择
    指引 + 防偷懒协议。bindable_tools 缺省（禁用工具/熔断收尾路径）时
    不注入清单段，保持时间与容错指令。
    """
    now = display_now()
    time_str = format_display_datetime(now)
    date_str = now.strftime("%Y-%m-%d")

    manifest_section = ""
    if bindable_tools:
        manifest = format_tool_manifest(bindable_tools, builtin_names or set())
        manifest_section = f"""
【可用工具清单】（本次执行实际绑定，调用时必须使用这里的准确名称）：
{manifest}

【工具选择指引】：
- 任务与某个 MCP 工具的领域强相关时（如地点/POI/餐厅点评/路线 → maps_* 类），
  **优先使用该 MCP 工具**而非通用网页搜索——结构化数据比网页摘要更准。
- 通用网络信息、技术调研 → 网页搜索工具；给定 URL 的全文阅读 → 网页阅读工具。
"""

    enhanced_prompt = f"""【当前系统时间】：{time_str}
【当前日期】：{date_str}

{system_prompt}
{manifest_section}
【防偷懒协议 (Anti-Laziness Protocol)】：
1. **禁止复用上下文**：即使之前的对话里好像提到过相关信息，针对当前任务你依然**必须**重新执行工具调用。
2. **看到 URL 就去读**：任务包含 http/https 链接时，直接调用网页阅读工具读取全文，不要猜测内容。
3. **一步一动**：不要试图在一个回合里把所有事做完。先调工具 -> 拿到结果 -> 再分析。

【执行逻辑】：
检测到任务需求 -> 从【可用工具清单】选择最合适的工具 -> **输出 Tool Call** -> (等待执行) -> 获取结果 -> 生成回答。

【容错处理指令 (Fault Tolerance)】：
如果参考上下文中提到某些上游任务的输出，但这些内容缺失或为空，
请不要抱怨或询问，而是基于你已有的知识和当前可用信息，尽最大努力完成任务。
忽略对缺失内容的引用，专注于完成核心任务目标。
"""
    return enhanced_prompt
