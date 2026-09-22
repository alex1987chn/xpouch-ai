"""并发上限的端到端验证脚本（C2）。

验证的不是「配置能存进去」，而是**真实运行里同层任务真的并发了**：

    1. 新建用户 → 临时提为管理员 → 通过管理端 API 把并发上限设为 2
    2. 走一遍真实 HITL 链路（规划 → 批准 → 执行），计划里含同层任务
    3. 查库比对同层任务的 started_at/completed_at **时间窗是否重叠**（并发的硬证据）
    4. 复原为串行（1），避免留下非默认状态

为什么必须查库比对时间窗：只看到「两个任务都完成了」证明不了并发——串行也会完成。
时间窗重叠是并发唯一的直接证据（单元/集成测试里用 LLM 调用时间窗，这里用真实落库时间）。

用法（后端需已启动在 3002，且当前工作副本的迁移已应用）：
    backend/.venv/Scripts/python.exe backend/scripts/e2e_concurrency_check.py
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

API = "http://127.0.0.1:3002/api"
TIMEOUT = 420
COMPLEX_QUERY = "帮我调研最新的 AI Agent 框架，然后写一份对比报告"
# 目标并发上限；设为 1 可当**反向对照**（串行下不应出现重叠）
TARGET_CONCURRENCY = int(os.environ.get("E2E_CONCURRENCY", "2"))
# 把计划依赖清空以制造同层任务：LLM 给的形状随机，纯链计划验证不了并发
FLATTEN_PLAN = True


def _client() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def _request(opener, method: str, path: str, payload: dict | None = None, stream: bool = False):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "Content-Type": "application/json",
            **({"Accept": "text/event-stream"} if stream else {}),
        },
        method=method,
    )
    return opener.open(req, timeout=TIMEOUT)


def _json_call(opener, method: str, path: str, payload: dict | None = None) -> dict:
    with _request(opener, method, path, payload) as resp:
        return json.loads(resp.read().decode())


def _stream(opener, path: str, payload: dict, stop_on: re.Pattern) -> tuple[list[str], dict]:
    lines: list[str] = []
    with _request(opener, "POST", path, payload, stream=True) as resp:
        headers = {k.lower(): v for k, v in resp.headers.items()}
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").rstrip("\n")
            lines.append(line)
            if stop_on.search(line):
                break
    return lines, headers


def _extract_interrupt(lines: list[str]) -> dict | None:
    for i, ln in enumerate(lines):
        if ln.startswith("event: human.interrupt"):
            for nxt in lines[i + 1 : i + 5]:
                if nxt.startswith("data: "):
                    return json.loads(nxt[6:])
    return None


def _task_windows(run_id: str) -> list[tuple[str, datetime, datetime]]:
    """该 run 下每个任务的执行时间窗，取自**运行事件账本**（task_started/completed）。

    为什么不用 `SubTask.started_at`：流式恢复路径不写它（`_save_langgraph_result`
    只在首轮与旧的同步恢复路径被调用），所以库里那一列在 HITL 链路里恒为 None
    ——用它做判定会得到「永远没有重叠」的假阴性（本脚本初版就这么错过一次）。
    账本按任务配对起止，是运行期事实的落库形态。
    """
    from sqlmodel import Session, select

    from database import engine
    from models import RunEvent

    with Session(engine) as session:
        events = session.exec(
            select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.timestamp)
        ).all()

    starts: dict[str, tuple[str, datetime]] = {}
    windows: list[tuple[str, datetime, datetime]] = []
    for ev in events:
        label = str(getattr(ev, "event_data", "") or "")
        name = label.split("'description': ")[-1].split(",")[0].strip("'\"")[:20]
        if ev.event_type == "task_started" and ev.task_id:
            starts[str(ev.task_id)] = (name or "task", ev.created_at)
        elif ev.event_type == "task_completed" and ev.task_id:
            start = starts.pop(str(ev.task_id), None)
            if start:
                windows.append((start[0] or name, start[1], ev.created_at))
    return windows


def main() -> int:
    from scripts.promote_admin import promote_user

    opener = _client()
    phone = f"1390002{secrets.randbelow(9000) + 1000}"

    print(f"### 1. 注册并登录 {phone}")
    sent = _json_call(
        opener, "POST", "/auth/send-code", {"phone_number": phone, "purpose": "login"}
    )
    code = sent.get("_debug_code")
    if not code:
        print("  ✗ 未拿到 _debug_code（本地 dev 仅对新用户返回）")
        return 1
    _json_call(opener, "POST", "/auth/verify-code", {"phone_number": phone, "code": code})
    print("  ✓ 已登录；临时提为管理员（仅为调用管理端接口）")
    promote_user(phone, is_phone=True)

    print(f"### 2. 通过管理端 API 把并发上限设为 {TARGET_CONCURRENCY}")
    status = _json_call(opener, "GET", "/admin/system-status")
    concurrency = status.get("graph_max_concurrency")
    if not isinstance(concurrency, dict):
        print("  ✗ system-status 未返回 graph_max_concurrency：", concurrency)
        return 1
    print(f"  ✓ 读取成功: {concurrency}")
    updated = _json_call(
        opener, "PUT", "/admin/graph-max-concurrency", {"graph_max_concurrency": TARGET_CONCURRENCY}
    )
    if updated.get("graph_max_concurrency") != TARGET_CONCURRENCY:
        print("  ✗ 写入失败:", updated)
        return 1
    print("  ✓ 写入成功")

    try:
        print("### 3. 真实链路：规划 → 批准 → 执行")
        s1, h1 = _stream(
            opener,
            "/chat",
            {"message": COMPLEX_QUERY, "history": []},
            stop_on=re.compile(r"^data: \[DONE\]"),
        )
        payload = _extract_interrupt(s1)
        thread_id = h1.get("x-thread-id")
        if not payload or not thread_id:
            print("  ✗ 未出现 human.interrupt")
            return 1
        run_id = payload.get("run_id")
        plan = payload.get("current_plan") or []
        print(f"  ✓ 计划 {len(plan)} 个任务，run_id={run_id}")
        for task in plan:
            print(f"      - {task.get('expert_type')} deps={task.get('depends_on')}")

        # LLM 给出的计划可能是一条纯链（没有同层任务），那样并发无从体现。
        # 这里用**审批页编辑计划**这条真实路径把所有依赖清掉，制造同层任务
        # （顺带覆盖「带编辑的批准」这条链路在新执行器下的行为）。
        updated_plan = None
        if FLATTEN_PLAN and any(task.get("depends_on") for task in plan):
            updated_plan = [{**task, "depends_on": []} for task in plan]
            print(f"  ℹ️ 已把 {len(plan)} 个任务的依赖清空（制造同层任务以验证并发）")

        t0 = time.time()
        resume_payload = {
            "thread_id": thread_id,
            "run_id": run_id,
            "approved": True,
            "action": "approve",
            "plan_version": payload.get("plan_version"),
        }
        if updated_plan is not None:
            resume_payload["updated_plan"] = updated_plan
        s2, _ = _stream(
            opener,
            "/chat/resume",
            resume_payload,
            stop_on=re.compile(r"^data: \[DONE\]"),
        )
        completed = sum(1 for ln in s2 if ln.startswith("event: task.completed"))
        print(f"  ✓ 恢复完成，耗时 {time.time() - t0:.1f}s，task.completed={completed}")

        print("### 4. 比对同层任务的时间窗（运行事件账本）")
        windows = _task_windows(run_id)
        for label, started, completed_at in windows:
            print(f"      {label:<22} {started.time()} → {completed_at.time()}")
        overlaps = [
            (a[0], b[0])
            for idx, a in enumerate(windows)
            for b in windows[idx + 1 :]
            if a[1] < b[2] and b[1] < a[2]
        ]
        if overlaps:
            print(f"  ✅ 检测到重叠执行（并发生效）: {overlaps}")
            return 0
        print("  ⚠️ 未检测到重叠：该计划可能没有同层任务（看上面的 deps），并发无从体现")
        return 2
    finally:
        print("### 5. 复原为串行（1）")
        restored = _json_call(
            opener, "PUT", "/admin/graph-max-concurrency", {"graph_max_concurrency": None}
        )
        print("  ✓ 已复原:", restored)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        print("HTTPError", e.code, e.read().decode()[:400])
        sys.exit(1)
