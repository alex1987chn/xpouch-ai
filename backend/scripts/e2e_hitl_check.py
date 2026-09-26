"""HITL 端到端实机验证脚本。

走真实 HTTP + 真实 LLM，验证「规划 → 审批暂停 → 批准 → 执行完成」全链路：

    用法（后端需已启动在 3002）：
        cd backend && uv run python scripts/e2e_hitl_check.py

为什么需要它：单元测试覆盖不到「图真的停在 interrupt 上」「Command(resume)
真的能把图从断点续跑」这类跨进程行为——用真节点 + MemorySaver 的测试只能
证明节点语义，证明不了 HTTP + checkpointer + 流式三者的组合。

脚本会新建一个手机号用户（本地 dev 下 send-code 对新用户返回 _debug_code），
因此可重复运行、每次都是干净会话。

两个已知的接口细节（写脚本前踩过）：
1. `human.interrupt` 的 SSE payload 是**扁平**的（`build_sse_event` 展开了
   event data），字段为 current_plan / plan_version / run_id / execution_plan_id；
   **thread_id 不在 payload 里**，只在响应头 `X-Thread-ID`。
2. `Command(resume=None)` 会让 langgraph 内部报错（见 docs/TARGET-ARCHITECTURE.md
   的已知地雷），故恢复值一律传 dict。
"""

from __future__ import annotations

import http.cookiejar
import json
import re
import secrets
import sys
import time
import urllib.error
import urllib.request

API = "http://127.0.0.1:3002/api"
TIMEOUT = 420  # 单次流式读取上限（秒）
COMPLEX_QUERY = "帮我调研最新的 AI Agent 框架，然后写一份对比报告"


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


def _stream(
    opener, path: str, payload: dict, stop_on: re.Pattern | None = None
) -> tuple[list[str], dict[str, str]]:
    """POST 并按行读取 SSE，返回 (行列表, 响应头)。"""
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    lines: list[str] = []
    started = time.time()
    with opener.open(req, timeout=TIMEOUT) as resp:
        headers = {k.lower(): v for k, v in resp.headers.items()}
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").rstrip("\n")
            lines.append(line)
            if stop_on and stop_on.search(line):
                break
            if time.time() - started > TIMEOUT:
                lines.append("!! 读取超时")
                break
    return lines, headers


def _event_counts(lines: list[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for ln in lines:
        m = re.match(r"^event: ([a-z._]+)", ln)
        if m:
            counts[m.group(1)] = counts.get(m.group(1), 0) + 1
    return counts


def _print_counts(lines: list[str], label: str) -> None:
    print(f"  {label}: {len(lines)} 行")
    for name, n in sorted(_event_counts(lines).items()):
        print(f"    - {name}: {n}")


def _extract_interrupt(lines: list[str]) -> dict | None:
    for i, ln in enumerate(lines):
        if ln.startswith("event: human.interrupt"):
            for nxt in lines[i + 1 : i + 5]:
                if nxt.startswith("data: "):
                    return json.loads(nxt[6:])
            return None
    return None


def main() -> int:
    opener = _client()
    # 手机号段需符合本地校验；用密码学随机源避免可预测
    phone = f"1390001{secrets.randbelow(9000) + 1000}"

    print(f"### 1. 注册并登录 {phone}")
    sent = _post_json(opener, "/auth/send-code", {"phone_number": phone, "purpose": "login"})
    code = sent.get("_debug_code")
    if not code:
        print("  ✗ 未拿到 _debug_code（该号已存在？本地 dev 仅对新用户返回）")
        return 1
    logged = _post_json(opener, "/auth/verify-code", {"phone_number": phone, "code": code})
    print(f"  ✓ 登录成功 user={logged.get('username')}")

    print("### 2. 发复杂任务（含「最新」→ 确定性 complex 路由）")
    t0 = time.time()
    s1, h1 = _stream(
        opener,
        "/chat",
        {"message": COMPLEX_QUERY, "history": []},
        stop_on=re.compile(r"^data: \[DONE\]"),
    )
    print(f"  耗时 {time.time() - t0:.1f}s | X-Thread-ID={h1.get('x-thread-id')}")
    _print_counts(s1, "首轮 SSE")

    payload = _extract_interrupt(s1)
    if not payload:
        print("  ✗ 未出现 human.interrupt —— 审批暂停未生效")
        print("    尾部:", "\n".join(s1[-6:]))
        return 1

    thread_id = h1.get("x-thread-id")
    plan = payload.get("current_plan") or []
    print("  ✓ 审批中断已触发")
    print("    thread_id =", thread_id)
    print(f"    run_id = {payload.get('run_id')} | plan_version = {payload.get('plan_version')}")
    print("    计划任务数 =", len(plan))
    for t in plan[:5]:
        print("      -", t.get("expert_type"), "|", str(t.get("description"))[:44])
    if not thread_id or not payload.get("run_id"):
        print("  ✗ 缺少 thread_id / run_id，无法恢复")
        return 1

    print("### 3. 批准并恢复执行")
    t1 = time.time()
    s2, _ = _stream(
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
    print(f"  耗时 {time.time() - t1:.1f}s")
    _print_counts(s2, "恢复 SSE")

    counts = _event_counts(s2)
    ok_done = counts.get("message.done", 0) > 0
    ok_task = counts.get("task.completed", 0) > 0
    print(f"  task.completed: {'✓' if ok_task else '✗'} | message.done: {'✓' if ok_done else '✗'}")
    if not (ok_done and ok_task):
        print("    尾部:", "\n".join(s2[-8:]))
        return 1

    print("\n✅ 端到端链路通过：规划 → 审批暂停 → 批准 → 执行完成")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        print("HTTPError", e.code, e.read().decode()[:400])
        sys.exit(1)
