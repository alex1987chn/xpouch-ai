"""记忆管理工具（per-invocation 工厂，非模块级单例）。

与 search_web / calculator 不同，这两个工具**必须**按请求构建：user_id 从
branch_context 由服务端闭包捕获注入，绝不作为工具参数暴露给模型——模型
填报的 user_id 就是跨用户读删漏洞（与 generic 写入端的 fail-loud 护栏同源，
见 docs/DECISIONS.md 记忆写入护栏条目）。

治理：名称注册在 agents/tool_policy.BUILTIN_TOOL_POLICIES，
allowed_experts=("memorize_expert",)——只有记忆专家看得到它们。
"""

from langchain_core.tools import StructuredTool

from services.memory_manager import memory_manager

# 记忆管理工具名集合：generic 用它判断"本分支用过记忆工具"（此时输出是
# 操作报告而非记忆素材，逐行入库必须跳过——否则删除报告自己会变成记忆，
# 历史"已为您删除…"回声即此形态）
MEMORY_TOOL_NAMES = frozenset({"search_memories", "delete_memories"})


def _format_rows(rows: list[str], headline: str) -> str:
    if not rows:
        return "（无匹配记忆）"
    lines = [f"{i}. {content}" for i, content in enumerate(rows, start=1)]
    return f"{headline}（共 {len(rows)} 条）:\n" + "\n".join(lines)


def build_memory_tools(user_id: str) -> list[StructuredTool]:
    """为指定用户构建记忆检索/删除工具（闭包捕获 user_id，隔离铁律）。"""

    async def _search_memories(keyword: str) -> str:
        """按关键词预览当前用户匹配的记忆；空关键词=列出全部（最近的在前）。"""
        if keyword.strip():
            rows = await memory_manager.delete_memories(user_id, keyword, dry_run=True)
            return _format_rows(rows, f"关键词「{keyword.strip()}」匹配")
        rows = await memory_manager.list_memories(user_id)
        return _format_rows(rows, "当前已保存的全部记忆")

    async def _delete_memories(keyword: str) -> str:
        """删除当前用户匹配关键词的记忆，返回被删清单。"""
        deleted = await memory_manager.delete_memories(user_id, keyword)
        if not deleted:
            return f"关键词「{keyword.strip()}」没有匹配的记忆，未删除任何内容。"
        return _format_rows(deleted, "已删除")

    return [
        StructuredTool.from_function(
            coroutine=_search_memories,
            name="search_memories",
            description=(
                "预览当前用户已保存的长期记忆：传入关键词做匹配预览（删除前先用它确认范围），"
                "不传关键词则列出全部。只读，不改动任何数据。"
            ),
        ),
        StructuredTool.from_function(
            coroutine=_delete_memories,
            name="delete_memories",
            description=(
                "删除当前用户匹配关键词的长期记忆（关键词从用户指令提取，如"
                "「删掉关于苹果的记忆」→ keyword=苹果），返回被删除的清单。"
                "破坏性操作：调用前应先用 search_memories 预览匹配范围。"
            ),
        ),
    ]
