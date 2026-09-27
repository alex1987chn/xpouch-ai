"""审批动作端到端实机验证：修订循环 + 终止。

走真实 HTTP + 真实 LLM，补齐 e2e_hitl_check（只覆盖「批准-原样」）之外
的两个人类裁决动作：

    用法（后端需已启动在 3002）：
        cd backend && uv run python scripts/e2e_plan_actions_check.py

场景 A（修订循环，2026-09-27 修订重提事故的回归锚点）：
    计划审批中断 → revise+反馈 → 后台 LLM 修订 → 轮询 v(n+1) →
    批准新计划 → 跑完 → 产物落库数 ≥ 1（队列保存路径必须活着）
场景 B（终止）：
    计划审批中断 → terminate → run 进终态，计划不再执行

脚本自建手机号用户，可重复运行。
"""

from __future__ import annotations

import http.cookiejar
import json
import secrets
import sys
import time
import urllib.error
import urllib.request

API = "http://127.0.0.1:3002/api"
TIMEOUT = 420
REVISION_TIMEOUT = 240  # 后台 LLM 修订上限（秒）
COMPLEX_QUERY_A = "帮我调研最新的 AI Agent 框架并写一份对比报告，任务尽量拆细"
COMPLEX_QUERY_B = "帮我做一个个人博客网站的规划，包含设计与内容方案"


def _client() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def _post_json(opener, path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def _get_json(opener, path: str) -> dict:
    with opener.open(API + path, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _stream(opener, path: str, payload: dict) -> tuple[list[str], dict[str, str]]:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    lines: list[str] = []
    with opener.open(req, timeout=TIMEOUT) as resp:
        headers = dict(resp.headers)
        for raw in resp:
            line = raw.decode("utf-8", "replace").rstrip("\n")
            lines.append(line)
            if line.startswith("data: [DONE]"):
                break
    return lines, headers


def _extract_interrupt(lines: list[str]) -> dict | None:
    for i, ln in enumerate(lines):
        if ln.startswith("event: human.interrupt"):
            for nxt in lines[i + 1 : i + 5]:
                if nxt.startswith("data: "):
                    return json.loads(nxt[6:])
            return None
    return None


def _start_plan(opener, query: str) -> tuple[str, str, int, int]:
    """发复杂任务到审批中断，返回 (thread_id, run_id, plan_version, 任务数)。"""
    lines, headers = _stream(opener, "/chat", {"message": query, "history": []})
    payload = _extract_interrupt(lines)
    thread_id = headers.get("x-thread-id") or headers.get("X-Thread-ID")
    if not payload or not thread_id or not payload.get("run_id"):
        print("  ✗ 未到达审批中断")
        print("    尾部:", "\n".join(lines[-4:]))
        sys.exit(1)
    plan = payload.get("current_plan") or []
    return thread_id, payload["run_id"], int(payload.get("plan_version") or 1), len(plan)


def _resume(opener, payload: dict) -> tuple[list[str], dict[str, str]]:
    return _stream(opener, "/chat/resume", payload)


def main() -> int:
    opener = _client()
    phone = f"1390005{secrets.randbelow(9000) + 1000}"
    print(f"### 0. 注册并登录 {phone}")
    code = _post_json(opener, "/auth/send-code", {"phone_number": phone, "purpose": "login"}).get(
        "_debug_code"
    )
    if not code:
        print("  ✗ 未拿到 _debug_code")
        return 1
    _post_json(opener, "/auth/verify-code", {"phone_number": phone, "code": code})
    print("  ✓ 登录成功")

    failures: list[str] = []

    # ===== 场景 A：修订循环 =====
    print("### A1. 发任务到审批中断")
    thread_id, run_id, v0, task_count = _start_plan(opener, COMPLEX_QUERY_A)
    print(f"  ✓ 中断于 v{v0}（{task_count} 个任务）thread={thread_id[:8]}")

    print("### A2. 提交修订（附反馈）")
    revise_resp = _post_json(
        opener,
        "/chat/resume",
        {
            "thread_id": thread_id,
            "run_id": run_id,
            "plan_version": v0,
            "approved": False,
            "action": "revise",
            "feedback": "任务太多，请压缩到两个以内：先搜索一次，然后直接写出最终报告。",
        },
    )
    if revise_resp.get("status") != "revising":
        failures.append(
            f"revise 未进入 revising: {json.dumps(revise_resp, ensure_ascii=False)[:120]}"
        )
        print("  ✗", failures[-1])
    else:
        print("  ✓ 进入修订中（后台 LLM 执行）")

    print("### A3. 轮询计划直到 v(n+1)")
    new_version = None
    deadline = time.time() + REVISION_TIMEOUT
    while time.time() < deadline:
        plan_state = _get_json(opener, f"/runs/{run_id}/plan")
        if plan_state.get("revision_error"):
            failures.append(f"修订失败: {plan_state['revision_error']}")
            print("  ✗", failures[-1])
            break
        if not plan_state.get("revising") and plan_state.get("plan_version", v0) > v0:
            new_version = plan_state["plan_version"]
            new_count = len(plan_state.get("tasks") or [])
            print(f"  ✓ 修订完成: v{v0} → v{new_version}（{new_count} 个任务）")
            break
        time.sleep(5)
    else:
        failures.append(f"修订轮询超时（{REVISION_TIMEOUT}s）")
        print("  ✗", failures[-1])

    if new_version:
        print("### A4. 批准新计划并等执行完成")
        s2, h2 = _resume(
            opener,
            {
                "thread_id": thread_id,
                "run_id": run_id,
                "plan_version": new_version,
                "approved": True,
                "action": "approve",
            },
        )
        counts = {}
        for line in s2:
            if line.startswith("event: "):
                ev = line[len("event: ") :].strip()
                counts[ev] = counts.get(ev, 0) + 1
        done = any(line.startswith("data: [DONE]") for line in s2)
        print(
            f"  恢复 SSE {len(s2)} 行 [DONE]={done} task.completed={counts.get('task.completed', 0)}"
        )
        if not done or not counts.get("task.completed"):
            failures.append("修订后批准未正常跑完（缺 task.completed 或 [DONE]）")
            print("  ✗", failures[-1])

        print("### A5. 产物落库校验（队列保存路径必须活着）")
        arts = _get_json(opener, f"/artifacts?thread_id={thread_id}&limit=50")
        items = arts.get("items") or []
        print(f"  ✓ thread 产物 {len(items)} 个")
        if not items:
            failures.append("修订后批准的运行产物为 0（队列保存路径又断了）")
            print("  ✗", failures[-1])

    # ===== 场景 B：终止 =====
    print("### B1. 发第二个任务到审批中断")
    thread_b, run_b, v_b, _ = _start_plan(opener, COMPLEX_QUERY_B)
    print(f"  ✓ 中断于 v{v_b} thread={thread_b[:8]}")

    print("### B2. 终止")
    term_resp = _post_json(
        opener,
        "/chat/resume",
        {
            "thread_id": thread_b,
            "run_id": run_b,
            "plan_version": v_b,
            "approved": False,
            "action": "terminate",
        },
    )
    print(f"  响应: {json.dumps(term_resp, ensure_ascii=False)[:120]}")

    print("### B3. 校验 run 进终态")
    deadline = time.time() + 30
    status = None
    while time.time() < deadline:
        st = _get_json(opener, f"/runs/{run_b}/status")
        status = st.get("status")
        if status in ("cancelled", "failed", "completed", "terminated"):
            break
        time.sleep(2)
    if status in ("cancelled", "terminated"):
        print(f"  ✓ run 终态: {status}")
    else:
        failures.append(f"终止后 run 状态异常: {status}")
        print("  ✗", failures[-1])

    print()
    if failures:
        print(f"❌ {len(failures)} 项失败:")
        for f in failures:
            print("  -", f)
        return 1
    print("✅ 审批动作全链路通过：修订循环（含产物落库）+ 终止")
    return 0


if __name__ == "__main__":
    sys.exit(main())
