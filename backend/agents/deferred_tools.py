"""延迟工具层：低频 MCP 工具按需检索展开（client-side Tool Search）。

行业范式（2026-10）：Anthropic Tool Search Tool / OpenAI defer_loading——
低频工具不随每次调用进上下文，agent 需要时检索、按需展开。官方实现
（服务端 tool_reference 展开）绑定其平台 API；本项目模型自选（DeepSeek 等），
故做客户端版，协议对齐：

1. **标记**：`ToolPolicy.deferred`（管理台按工具开关，默认全 false——
   未配置时行为与改造前完全一致，零风险上线）。defer 只对 MCP 工具生效，
   内置工具体量小、常驻。
2. **绑定侧**（generic）：常驻集 = 允许且未标延迟的工具 + `search_tools`
   伪工具；延迟工具不进 bind_tools、不进 prompt 工具清单。
3. **检索**：模型调 `search_tools(query)` → 关键词匹配延迟工具的名称与
   描述，返回匹配清单（名称 + 净化后的一句话说明）。**零匹配自愈**：
   返回全部延迟工具的名称列表让模型自行挑选（与记忆检索零匹配自愈同一
   设计先例——搜不到就列全量，绝不静默报"没有"）。
4. **展开协议**：search_tools 的返回**由服务端生成**，首行带机器可读头
   `[matched]: a,b,c`（非模型文本，解析可靠）。`worker_tools_node` 适配层
   解析该头并入分支状态 `expanded_tool_names`；worker 每次重入都重新绑定
   （见 generic 绑定段），已展开的延迟工具随之进入绑定集——模型下一轮
   即可直接调用。
5. **不可信输入**：第三方 MCP 工具的描述可能携带提示注入（Tool Poisoning
   类攻击，Invariant Labs 2025-04 披露——指令藏在工具描述里，用户不可见、
   模型可见）。检索结果里的描述一律**净化后呈现**（压缩空白 + 截断），
   且只作为能力说明；本层代码不解析、不执行描述内容中的任何指令。

执行侧（dynamic_tool_node）保留全量工具可执行（含延迟工具与 search_tools），
模型可见性由绑定侧唯一控制——与现行「绑定过滤 + 执行复核」双层结构一致。
"""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

from agents.tool_policy import get_tool_name, resolve_tool_metadata
from services.tool_policy_service import ToolPolicyOverride

SEARCH_TOOL_NAME = "search_tools"
# 服务端生成的机器可读头：适配层据此解析匹配名单（只信我们自己生成的这行）
MATCHED_HEADER = "[matched]"
# 单次检索返回的匹配上限（清单太长反而稀释注意力）
MAX_MATCHES = 8
# 零匹配自愈：全量列名时的上限
MAX_LIST_ALL = 20
# 第三方描述净化截断上限
DESC_LIMIT = 160

SEARCH_TOOL_DESCRIPTION = (
    "检索当前任务可按需启用的额外工具（低频工具不预加载）。"
    "输入与需求相关的关键词（支持中英文、空格分词），返回匹配工具的名称与说明；"
    "返回清单中的工具即可直接调用。检索不到时也会列出全部可启用工具的名称。"
)


def sanitize_description(description: str | None) -> str:
    """净化第三方工具描述：压缩空白并截断。

    不可信输入纪律（见模块 docstring 第 5 条）：描述只作为能力说明呈现，
    压掉换行可以阻止"多行伪装成系统消息"的注入形态，截断限制单条体积。
    """
    if not description:
        return ""
    collapsed = " ".join(str(description).split())
    return collapsed[:DESC_LIMIT]


def _match_score(query: str, name: str, description: str) -> int:
    """朴素关键词打分：名称命中权重 3，描述命中权重 1，名称子串命中再加成。

    工具量级在几十以内，朴素打分即够（Anthropic 用 BM25 是因为延迟池有
    上千个工具）；不引外部检索依赖，行为可单测钉死。
    """
    tokens = [t for t in query.lower().split() if len(t) >= 2]
    if not tokens:
        return 0
    name_l = name.lower()
    desc_l = description.lower()
    score = 0
    for token in tokens:
        if token in name_l:
            score += 3
            if name_l == token or name_l.startswith(token):
                score += 2
        if token in desc_l:
            score += 1
    return score


def match_deferred_tools(query: str, deferred_tools: list[Any]) -> list[Any]:
    """按查询匹配延迟工具，返回按得分降序的前 MAX_MATCHES 个。"""
    scored: list[tuple[int, Any]] = []
    for tool_obj in deferred_tools:
        name = get_tool_name(tool_obj)
        description = sanitize_description(getattr(tool_obj, "description", None))
        score = _match_score(query, name, description)
        if score > 0:
            scored.append((score, tool_obj))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [tool_obj for _, tool_obj in scored[:MAX_MATCHES]]


def format_matches(matched: list[Any], all_deferred: list[Any]) -> str:
    """构造检索结果文本：首行机器可读头 + 人类/模型可读清单。

    首行 `[matched]: name1,name2` 由本函数生成（非模型输出），适配层
    `parse_matched_names` 只解析这一行。
    """
    if not matched:
        # 零匹配自愈：列全部名称（仅名称 + 超短说明），绝不只报"无结果"
        names = [get_tool_name(t) for t in all_deferred[:MAX_LIST_ALL]]
        lines = [
            f"{MATCHED_HEADER}: ",
            "没有直接匹配。以下是当前可按需启用的全部工具（换用其中的英文关键词重试，或直接选用）：",
        ]
        lines += [
            f"- {name}：{sanitize_description(getattr(t, 'description', None))}"
            for name, t in zip(names, all_deferred[:MAX_LIST_ALL], strict=True)
        ]
        return "\n".join(lines)

    names = [get_tool_name(t) for t in matched]
    lines = [f"{MATCHED_HEADER}: {','.join(names)}"]
    lines.append("以下工具已匹配，可直接调用（参数见各自 schema）：")
    lines += [
        f"- {name}：{sanitize_description(getattr(t, 'description', None))}"
        for name, t in zip(names, matched, strict=True)
    ]
    return "\n".join(lines)


def parse_matched_names(content: str) -> list[str]:
    """从 search_tools 的 ToolMessage 内容解析匹配工具名（只认首行机器头）。

    内容由 `format_matches` 生成——服务端产物，非模型文本；解析不到（模型
    编造的消息形态等异常）返回空列表，静默忽略即可（绑定集不变，无损）。
    """
    if not content:
        return []
    first_line = str(content).splitlines()[0].strip()
    prefix = f"{MATCHED_HEADER}:"
    if not first_line.startswith(prefix):
        return []
    payload = first_line[len(prefix) :].strip()
    if not payload:
        return []
    return [name.strip() for name in payload.split(",") if name.strip()]


def extract_deferred(
    tools: list[Any],
    *,
    expert_type: str | None = None,
    overrides: dict[tuple[str, str], ToolPolicyOverride] | None = None,
) -> tuple[list[Any], list[Any]]:
    """把允许绑定的工具分成（延迟, 常驻）两组。

    放在 `filter_tools_for_binding` **之后**单独成层（不并入其签名）：
    绑定过滤的调用面已有测试桩钉住，分层让「延迟」成为可独立回归的
    关注点。defer 只对 MCP 工具生效——resolve 侧强制，内置工具恒常驻。
    """
    deferred: list[Any] = []
    resident: list[Any] = []
    from agents.tool_policy import get_builtin_tool_names

    builtin_names = get_builtin_tool_names()
    for tool_obj in tools:
        name = get_tool_name(tool_obj)
        source = "builtin" if name in builtin_names else "mcp"
        metadata = resolve_tool_metadata(
            name,
            source=source,
            description=getattr(tool_obj, "description", None),
            overrides=overrides,
        )
        if metadata.source == "mcp" and metadata.deferred:
            deferred.append(tool_obj)
        else:
            resident.append(tool_obj)
    return deferred, resident


def build_search_tool(deferred_tools: list[Any]) -> Any:
    """构造 search_tools 伪工具（闭包持有本任务的延迟工具集）。"""

    @tool(SEARCH_TOOL_NAME, description=SEARCH_TOOL_DESCRIPTION)
    async def search_tools(query: str) -> str:
        matched = match_deferred_tools(query, deferred_tools)
        return format_matches(matched, deferred_tools)

    return search_tools
