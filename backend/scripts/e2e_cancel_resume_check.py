"""取消与断线续传端到端实机验证脚本（StreamService / generic 拆解的安全网）。

为什么需要它：主链两大件（StreamService、generic 节点，各约千行）的分解
重构已排期。动这类手术前，桩式单测证明不了三件跨进程的事：
「HTTP 断连后图还在跑」「取消真的级联收口不留僵尸」「续传真的不重不漏」。
只有真实 LLM + 真实 HTTP + 真实 DB 的闭环能拦住。

用法（后端需已启动在 3002）：
    cd backend && uv run python scripts/e2e_cancel_resume_check.py

注意：dev 模式后端用 watchfiles 盯整个 backend/ 树热重载——**新建或修改本
脚本会触发后端重启**，先等重启落定（health 200）再跑，否则首请求会撞上
连接拒绝窗口。

三个场景（每个都是新手机号用户，可重复运行）：

A. 审批点断连 → 审批卡自己回来：规划早期断连，轮询到 waiting_for_approval
   后 resume，应整段重放含 human.interrupt 并以 [DONE] 收尾（paused replay 路径）
B. 执行中断连 → live 续传不重不漏：批准后读到首个 task.started 即断连，
   resume 应从 last_seq+1 精确接续直到 [DONE]（帧 id 是 run 级 +1 持久游标，
   首帧 == 断点+1 同时证明了「不重」与「不漏」）
C. 执行中取消 → 级联收口：批准进入执行后 cancel，run/plan 双双 cancelled、
   subtask 零僵尸（无 pending/running/waiting 残留）、账本留 run_cancelled；
   终态后续传 410、重复取消幂等

已知时序细节（写脚本前核对过的契约）：
1. 每帧线格式带 `id: <seq>`，seq 由 RunFrameRecorder 按 run 级 +1 分配
   （services/chat/frame_recorder.py），断言「+1 接续」由此成立
2. X-Thread-ID / X-Run-ID 在流打开时即可读（sse_stream_headers 统一注入）
3. cancel 走 mark_run_cancelled_by_id → close_orphaned_task_state 级联收口
   （crud/agent_run.py），不插消息载体——可见性由账本 run_cancelled 事件承载
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
COMPLEX_QUERY = "帮我调研最新的 AI Agent 框架，然后写一份对比报告"  # 「最新」→ 确定性 complex 路由
ID_RE = re.compile(r"^id: (\d+)$")


def _get_json(opener, path: str) -> dict:
    req = urllib.request.Request(API + path, method="GET")
    with opener.open(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def _db_one(query: str, params: tuple):
    """跑一条只读 SQL 取单值（断言用；连接方式同 e2e_memory_check）。"""
    import sys as _sys
    from pathlib import Path

    backend_root = str(Path(__file__).resolve().parents[1])
    if backend_root not in _sys.path:
        _sys.path.insert(0, backend_root)

    import psycopg

    from config import settings

    conn = psycopg.connect(settings.get_database_url(sync_driver="plain"))
    try:
        return conn.execute(query, params).fetchone()
    finally:
        conn.close()


def _stream_partial(
    opener, path: str, payload: dict, *, min_ids: int = 0, stop_re: re.Pattern | None = None
) -> tuple[list[str], dict[str, str]]:
    """POST SSE 读到条件即**断连**（退出 with 块关闭连接——服务端继续跑）。

    停止条件（先到先停）：stop_re 命中 / 收满 min_ids 条带 id 的帧。
    """
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    lines: list[str] = []
    ids_seen = 0
    with opener.open(req, timeout=TIMEOUT) as resp:
        headers = {k.lower(): v for k, v in resp.headers.items()}
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").rstrip("\n")
            lines.append(line)
            if ID_RE.match(line):
                ids_seen += 1
            if stop_re and stop_re.search(line):
                break
            if min_ids and ids_seen >= min_ids:
                break
    return lines, headers


def _get_sse(opener, path: str) -> list[str]:
    """GET SSE 读到 [DONE] 或流关闭，返回行列表。"""
    req = urllib.request.Request(API + path, headers={"Accept": "text/event-stream"}, method="GET")
    lines: list[str] = []
    with opener.open(req, timeout=TIMEOUT) as resp:
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").rstrip("\n")
            lines.append(line)
            if line == "data: [DONE]":
                break
    return lines


def _ids_of(lines: list[str]) -> list[int]:
    return [int(m.group(1)) for ln in lines if (m := ID_RE.match(ln))]


def _wait_run_status(opener, run_id: str, wanted: set[str], timeout_s: int = 180) -> str:
    t0 = time.time()
    last = "?"
    while time.time() - t0 < timeout_s:
        last = _get_json(opener, f"/runs/{run_id}/status").get("status", "?")
        if last in wanted:
            return last
        time.sleep(2)
    raise AssertionError(f"run {run_id} 未在 {timeout_s}s 内到达 {wanted}（当前 {last}）")


def _register(opener) -> str:
    phone = f"1390002{secrets.randbelow(9000) + 1000}"
    sent = _post_json(opener, "/auth/send-code", {"phone_number": phone, "purpose": "login"})
    code = sent.get("_debug_code")
    if not code:
        raise RuntimeError("未拿到 _debug_code（该号已存在？本地 dev 仅对新用户返回）")
    _post_json(opener, "/auth/verify-code", {"phone_number": phone, "code": code})
    return _get_json(opener, "/user/me").get("id")


def _start_complex(opener, label: str) -> tuple[dict, str]:
    """发复杂任务等审批中断，返回 (interrupt payload, thread_id)。"""
    print(f"### {label}")
    t0 = time.time()
    lines, headers = _stream(
        opener,
        "/chat",
        {"message": COMPLEX_QUERY, "history": []},
        stop_on=re.compile(r"^data: \[DONE\]"),
    )
    thread_id = headers.get("x-thread-id")
    payload = _extract_interrupt(lines)
    if not payload or not thread_id:
        raise RuntimeError(f"未出现 human.interrupt / 缺 thread_id，尾部: {''.join(lines[-6:])}")
    print(f"  耗时 {time.time() - t0:.1f}s | thread={thread_id} | run={payload.get('run_id')}")
    return payload, thread_id


def _approve_payload(payload: dict, thread_id: str) -> dict:
    return {
        "thread_id": thread_id,
        "run_id": payload.get("run_id"),
        "approved": True,
        "action": "approve",
        "plan_version": payload.get("plan_version"),
    }


def _assert_ids_continuous(ids: list[int], label: str) -> None:
    if ids != sorted(ids) or len(ids) != len(set(ids)):
        raise AssertionError(f"{label}: 帧序号非严格递增/有重复: {ids[:20]}")
    print(f"  ✓ {label}: {len(ids)} 帧，seq {ids[0]}..{ids[-1]}")


def scenario_a_paused_replay() -> None:
    """A. 审批点断连：错过的 human.interrupt 由 resume 整段重放补回。"""
    opener = _client()
    _register(opener)

    lines, headers = _stream_partial(
        opener, "/chat", {"message": COMPLEX_QUERY, "history": []}, min_ids=1
    )
    thread_id = headers.get("x-thread-id")
    run_id = headers.get("x-run-id")
    if not thread_id or not run_id:
        raise RuntimeError(f"断连时未拿到 X-Thread-ID / X-Run-ID 头: {sorted(headers)}")
    print(f"  首帧即断连 | thread={thread_id} run={run_id}")

    status = _wait_run_status(opener, run_id, {"waiting_for_approval"})
    print(f"  ✓ 断连后图继续跑，run 到达 {status}")
    time.sleep(2)  # 让本轮 producer 收尾，避开「状态已变、缓冲未闭」窗口

    rlines = _get_sse(opener, f"/chat/{thread_id}/stream/resume?last_event_id=0")
    counts = _event_counts(rlines)
    if counts.get("human.interrupt", 0) < 1:
        raise AssertionError(f"重放里没有 human.interrupt——审批卡没有自己回来: {counts}")
    if "data: [DONE]" not in rlines:
        raise AssertionError("重放未以 [DONE] 收尾")
    ids = _ids_of(rlines)
    _assert_ids_continuous(ids, "A 重放")
    print(f"  ✓ 审批卡自己回来了（重放含 human.interrupt，{len(ids)} 帧 + [DONE]）")

    # 收尾：取消这个停在审批点的 run（顺带覆盖「审批等待态取消」路径）
    resp = _post_json(opener, f"/runs/{run_id}/cancel", {})
    if resp.get("status") != "cancelled":
        raise AssertionError(f"审批点取消失败: {resp}")
    _wait_run_status(opener, run_id, {"cancelled"}, timeout_s=60)
    print("  ✓ 审批点取消收尾完成")


def scenario_b_live_resume() -> None:
    """B. 执行中断连：resume 从断点 +1 精确续到 [DONE]（不重不漏）。"""
    opener = _client()
    _register(opener)

    payload, thread_id = _start_complex(opener, "B1. 规划到审批中断")
    run_id = payload.get("run_id")

    print("### B2. 批准后读到首个 task.started 即断连")
    alines, _ = _stream_partial(
        opener,
        "/chat/resume",
        _approve_payload(payload, thread_id),
        stop_re=re.compile(r"^event: task\.started"),
    )
    if not any(ln.startswith("event: task.started") for ln in alines):
        raise AssertionError("没等到 task.started（执行未开始?）")
    ids = _ids_of(alines)
    if not ids:
        raise AssertionError("断连前没收到任何带 id 的帧")
    last_seq = ids[-1]
    print(f"  ✓ 执行已开始后断连 | 断点 seq={last_seq}（共 {len(ids)} 帧）")

    print("### B3. live 续传")
    rlines = _get_sse(opener, f"/chat/{thread_id}/stream/resume?last_event_id={last_seq}")
    rids = _ids_of(rlines)
    if not rids:
        raise AssertionError("续传没收到任何帧")
    if rids[0] != last_seq + 1:
        raise AssertionError(
            f"续传首帧 seq={rids[0]} ≠ 断点+1={last_seq + 1}——"
            f"{'漏帧' if rids[0] > last_seq + 1 else '重放了已收帧'}"
        )
    _assert_ids_continuous(rids, "B 续传")
    if "data: [DONE]" not in rlines:
        raise AssertionError("续传未收到 [DONE]——只跟随了半截")
    if _event_counts(rlines).get("message.done", 0) < 1:
        raise AssertionError("续传里没有 message.done")
    print(f"  ✓ 从 seq={last_seq + 1} 精确接续到 [DONE]（{len(rids)} 帧，不重不漏）")

    _wait_run_status(opener, run_id, {"completed"}, timeout_s=120)
    print("  ✓ run 最终 completed（断连没有杀死执行）")


def scenario_c_cancel_cascade() -> None:
    """C. 执行中取消：级联收口无僵尸 + 账本留痕 + 终态守卫。"""
    opener = _client()
    _register(opener)

    payload, thread_id = _start_complex(opener, "C1. 规划到审批中断")
    run_id = payload.get("run_id")

    print("### C2. 批准进入执行，首个 task.started 后断连")
    _stream_partial(
        opener,
        "/chat/resume",
        _approve_payload(payload, thread_id),
        stop_re=re.compile(r"^event: task\.started"),
    )
    time.sleep(8)  # 让执行真正跑进工具调用（在途 LLM 调用中途取消才是真实场景）

    print("### C3. 取消")
    resp = _post_json(opener, f"/runs/{run_id}/cancel", {})
    if resp.get("status") != "cancelled":
        raise AssertionError(f"取消响应异常: {resp}")
    _wait_run_status(opener, run_id, {"cancelled"}, timeout_s=60)
    print("  ✓ run → cancelled")

    plan_row = _db_one("SELECT id, status FROM executionplan WHERE run_id = %s", (run_id,))
    if not plan_row or plan_row[1] != "cancelled":
        raise AssertionError(f"plan 未收口为 cancelled: {plan_row}")
    zombies = _db_one(
        "SELECT count(*) FROM subtask WHERE execution_plan_id = %s"
        " AND status IN ('pending', 'running', 'waiting_for_approval')",
        (plan_row[0],),
    )[0]
    if zombies:
        raise AssertionError(f"取消后残留 {zombies} 个非终态 subtask（僵尸）")
    ledger = _db_one(
        "SELECT count(*) FROM runevent WHERE run_id = %s AND event_type = 'run_cancelled'",
        (run_id,),
    )[0]
    if ledger < 1:
        raise AssertionError("账本没有 run_cancelled 事件（取消不可审计）")
    print("  ✓ 级联收口：plan=cancelled、subtask 零僵尸、账本留 run_cancelled")

    again = _post_json(opener, f"/runs/{run_id}/cancel", {})
    if again.get("status") != "cancelled":
        raise AssertionError(f"重复取消不幂等: {again}")
    print(f"  ✓ 重复取消幂等（{again.get('message')}）")

    try:
        _get_sse(opener, f"/chat/{thread_id}/stream/resume?last_event_id=0")
    except urllib.error.HTTPError as e:
        if e.code != 410:
            raise AssertionError(f"终态后续传应 410，实际 {e.code}") from e
        print("  ✓ 终态守卫：resume 返回 410（前端退化到轮询路径）")
    else:
        raise AssertionError("终态后 resume 未拒绝（应 410）")


def main() -> int:
    print("### 场景 A：审批点断连 → 审批卡自己回来")
    scenario_a_paused_replay()
    print("\n### 场景 B：执行中断连 → live 续传不重不漏")
    scenario_b_live_resume()
    print("\n### 场景 C：执行中取消 → 级联收口")
    scenario_c_cancel_cascade()
    print("\n✅ 取消与续传三场景端到端通过（全程真实 LLM）")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        print("HTTPError", e.code, e.read().decode()[:400])
        sys.exit(1)
    except AssertionError as e:
        print("✗ 断言失败:", e)
        sys.exit(1)
