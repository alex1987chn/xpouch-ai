"""记忆专家分支（批次 4 拆出，2026-09-27）。

expert_worker_node 中 memorize_expert 专属的「写入/跳过/拒绝」三分支逻辑：
- 用过记忆工具 → 输出是操作报告，跳过入库
- 缺 user_id → 拒绝入库（不落共享账号——跨用户串记忆的事故案底）
- 正常 → 教材协议逐行入库（"无"/空行不是记忆）

修改本模块前先读 tests/test_memory_write_guard.py 与 e2e_memory_check.py
锁定的护栏语义。
"""

from __future__ import annotations

from langchain_core.messages import AIMessage

from agents.nodes.message_normalization import _branch_used_memory_tools
from services.memory_manager import memory_manager
from utils.logger import logger


async def handle_memory_branch(
    response: AIMessage, existing_messages: list, branch_context: dict
) -> None:
    """记忆专家的入库/跳过/拒绝三分支。原地修改 response.content。"""
    memory_content = response.content.strip()
    # user_id 由 Send payload 的 branch_context 带过来（wave_scheduler 的
    # build_branch_payload）。缺失即异常路径：宁可不入库也不落共享
    # default_user——落了就把记忆记到公共账号，任何同样缺 user_id 的
    # 请求都能检索到（跨用户串记忆，存量 default_user 脏数据即其产物）
    user_id = branch_context.get("user_id")

    # 删除/查看类操作：用过记忆工具的分支，输出是操作报告不是记忆素材，
    # 逐行入库必须跳过（否则"已删除 3 条…"会被存成记忆）
    if _branch_used_memory_tools(existing_messages):
        logger.info("[GenericWorker] 记忆管理操作完成，跳过记忆写入（输出为操作报告）")
        response.content = memory_content
    elif not user_id:
        logger.warning(
            "[GenericWorker] branch_context 缺 user_id，记忆拒绝入库（不落共享账号）: "
            "thread=%s run=%s",
            branch_context.get("thread_id"),
            branch_context.get("run_id"),
        )
        response.content = "未能识别当前用户，本次记忆未保存。"
    else:
        # 教材约定「一行一条记忆、无值得记录时只输出：无」（见
        # expert_config.memorize_expert）——逐行入库（分条存储检索精度更高），
        # 「无」/空行不是记忆，跳过。曾把整段输出（含 JSON 数组形态的
        # 结构包裹）当一条 content 存：结构字段无人承接，空数组 [] 也是垃圾记忆。
        memory_lines = [
            ln.strip() for ln in memory_content.splitlines() if ln.strip() and ln.strip() != "无"
        ]
        if memory_lines:
            logger.info(f"[GenericWorker] 正在保存 {len(memory_lines)} 条记忆")
            try:
                for line in memory_lines:
                    await memory_manager.add_memory(
                        user_id=user_id,
                        content=line,
                        source="conversation",
                        memory_type="fact",
                    )
                logger.info("[GenericWorker] 记忆保存成功!")
                response.content = "已为您记录：\n" + "\n".join(memory_lines)
            except (RuntimeError, ValueError) as mem_err:
                # 如实上报失败——不说"我会记住"（没存上就是没存上）；
                # 重试安全：已入库的行会被 MemoryManager 的同内容去重挡住
                logger.warning(f"[GenericWorker] 记忆保存失败: {mem_err}")
                response.content = "记忆保存失败（向量生成或写入出错），本次未记住，请重试。"
        else:
            response.content = "本次对话没有需要记住的内容。"
