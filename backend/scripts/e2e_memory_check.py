"""记忆链路端到端实机验证脚本（写入 → 审批 → 落库 → 删除 → 落库校验）。

为什么需要它（2026-09-26 两次事故的教训）：记忆功能的
①教材↔代码协议错配（教材教 JSON 数组、消费端逐行）、②绑定↔执行接线
错配（工具只注入 bind_tools 侧、ToolNode 报 not a valid tool）——都是
"各部件各自正确、拼装错了"，桩式单测测不住。只有真实 LLM + 真实 HTTP +
真实 DB 的闭环能拦住这一类。

用法（后端需已启动在 3002）：
    cd backend && uv run python scripts/e2e_memory_check.py

流程：
1. 注册临时用户（同 e2e_hitl_check：随机手机号 + _debug_code）
2. 发「记住…」（确定性 complex 路由）→ 审批中断 → 批准 → 执行完成
3. DB 断言：该用户记忆落库（含目标关键词）
4. 发「删除…记忆」→ 审批中断 → 批准 → 执行完成
5. DB 断言：目标记忆清零；**且没有把删除报告存成新记忆**（历史回声病）；
   绑定/执行两侧工具清单一致由单测钉住，本脚本钉的是真实调用发生
"""

from __future__ import annotations

import json
import re
import secrets
import sys
import time
import urllib.error
import urllib.request

try:
    from e2e_hitl_check import _client, _event_counts, _extract_interrupt, _post_json, _stream
except ImportError:
    from scripts.e2e_hitl_check import (  # type: ignore[no-redef]
        _client,
        _event_counts,
        _extract_interrupt,
        _post_json,
        _stream,
    )

API = "http://127.0.0.1:3002/api"
TIMEOUT = 420
WRITE_QUERY = "请记住：我是记忆链路测试用户，我最喜欢的颜色是青色"
DELETE_QUERY = "删除我关于青色的记忆"
# 关键词的语言容忍：模型可能把中文事实转写成英文存储（实测"青色"→"cyan"），
# 写入断言任一命中即过；删除断言仍严格（目标记忆必须真被删掉——跨语言
# 匹配若失效会在删除阶段暴露，这正是本 e2e 要守的体验）
KEYWORD_VARIANTS = ("青色", "cyan", "teal")


def _get_json(opener, path: str) -> dict:
    req = urllib.request.Request(API + path, method="GET")
    with opener.open(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def _memories(user_id: str) -> list[str]:
    import sys as _sys
    from pathlib import Path

    backend_root = str(Path(__file__).resolve().parents[1])
    if backend_root not in _sys.path:
        _sys.path.insert(0, backend_root)

    import psycopg

    from config import settings

    conn = psycopg.connect(settings.get_database_url(sync_driver="plain"))
    try:
        rows = conn.execute(
            "SELECT content FROM user_memories WHERE user_id = %s ORDER BY created_at",
            (user_id,),
        ).fetchall()
        return [r[0] for r in rows]
    finally:
        conn.close()


def _run_approved_flow(opener, label: str, query: str) -> bool:
    """发消息 → 等审批中断 → 批准 → 等执行完成。返回是否走通。"""
    print(f"### {label}")
    t0 = time.time()
    lines, headers = _stream(
        opener,
        "/chat",
        {"message": query, "history": []},
        stop_on=re.compile(r"^data: \[DONE\]"),
    )
    thread_id = headers.get("x-thread-id")
    print(f"  耗时 {time.time() - t0:.1f}s | thread={thread_id}")

    payload = _extract_interrupt(lines)
    if not payload:
        print("  ✗ 未出现 human.interrupt —— 复杂路由或审批暂停未生效")
        print("    尾部:", "\n".join(lines[-6:]))
        return False

    plan = payload.get("current_plan") or []
    experts = [t.get("expert_type") for t in plan]
    print(f"  ✓ 审批中断 | 计划任务 {len(plan)} 个 | 专家: {experts}")
    if "memorize_expert" not in experts:
        print("  ✗ 计划里没有 memorize_expert —— commander 归口失效")
        return False

    t1 = time.time()
    resume_lines, _ = _stream(
        opener,
        "/chat/resume",
        {
            "thread_id": thread_id,
            "run_id": payload.get("run_id"),
            "approved": True,
            "action": "approve",
            "plan_version": payload.get("plan_version"),
        },
        stop_on=re.compile(r"^data: \[DONE\]"),
    )
    resume_counts = _event_counts(resume_lines)
    print(f"  批准恢复耗时 {time.time() - t1:.1f}s")
    tool_calls = resume_counts.get("tool.calling", 0)
    print(
        f"  task.completed: {resume_counts.get('task.completed', 0)} | "
        f"message.done: {resume_counts.get('message.done', 0)} | tool.calling: {tool_calls}"
    )
    if not resume_counts.get("message.done"):
        print("    尾部:", "\n".join(resume_lines[-8:]))
        return False
    return True


def main() -> int:
    opener = _client()
    phone = f"1390001{secrets.randbelow(9000) + 1000}"

    print(f"### 0. 注册并登录 {phone}")
    sent = _post_json(opener, "/auth/send-code", {"phone_number": phone, "purpose": "login"})
    code = sent.get("_debug_code")
    if not code:
        print("  ✗ 未拿到 _debug_code（该号已存在？本地 dev 仅对新用户返回）")
        return 1
    _post_json(opener, "/auth/verify-code", {"phone_number": phone, "code": code})
    user_id = _get_json(opener, "/user/me").get("id")
    print(f"  ✓ user_id={user_id}")

    if not _run_approved_flow(opener, "1. 记忆写入", WRITE_QUERY):
        return 1
    mems = _memories(user_id)
    print(f"  落库记忆 {len(mems)} 条:")
    for m in mems:
        print("    -", m[:60])
    lowered = [m.lower() for m in mems]
    if not any(v in m for m in lowered for v in KEYWORD_VARIANTS):
        print(f"  ✗ 记忆落库缺失：没有包含 {KEYWORD_VARIANTS} 任一的条目")
        return 1
    print("  ✓ 写入闭环通过（目标记忆已落库）")

    if not _run_approved_flow(opener, "2. 记忆删除", DELETE_QUERY):
        return 1
    mems_after = _memories(user_id)
    print(f"  删除后记忆 {len(mems_after)} 条:")
    for m in mems_after:
        print("    -", m[:60])
    lowered_after = [m.lower() for m in mems_after]
    if any(v in m for m in lowered_after for v in KEYWORD_VARIANTS):
        print(f"  ✗ 删除未生效：仍有包含 {KEYWORD_VARIANTS} 任一的记忆（跨语言匹配失效？）")
        return 1
    echo = [m for m in mems_after if "删除" in m or "已为您" in m or "已删" in m]
    if echo:
        print(f"  ✗ 删除报告被存成了记忆（历史回声病复发）: {echo}")
        return 1
    print("  ✓ 删除闭环通过（目标记忆清零，删除报告未入库）")

    print("\n✅ 记忆链路端到端通过：写入 → 落库 → 删除 → 清零（全程真实 LLM）")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        print("HTTPError", e.code, e.read().decode()[:400])
        sys.exit(1)
