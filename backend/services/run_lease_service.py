"""run 租约的后台维护：续租 + 回收（决定 2）。

这一个循环同时顶替了两处旧机制：

1. **旧「心跳 + 清理循环的 stale_runs 段」** → 本模块的 `reclaim_expired_leases`：
   `租约过期` 或 `超过 deadline` 的活跃 run 标记超时。旧口径靠
   「`updated_at` 30 分钟没动」猜死活；现在有明确证据（谁持有、到什么时候）。
2. **旧「清理循环顺手回收僵尸」** → 同样由回收段接管。线程保留期清理仍留在
   `session_cleanup_service`（那是另一件事：按保留策略删线程，与存活无关）。

为什么不把回收挂在「有事件」的路径上（原来的做法）：一次 LLM 调用可以几分钟没有
任何 token，那期间进程完全健康却没有任何写入 —— 靠事件续租就会把活着的 run 判死。
所以续租必须是**时间驱动**的，与流量无关。

续租/回收为何放在同一个循环：两者共用一个时间基准（`now`），分开写迟早出现
「回收用的 now 比续租晚一拍」这类时序缝隙。每轮极轻：本进程的活跃 run 通常只有几条。
"""

from __future__ import annotations

import asyncio

from sqlmodel import Session, select

from crud.agent_run import ACTIVE_RUN_STATUSES, mark_run_timed_out_by_id
from database import engine
from models import AgentRun
from utils.logger import logger
from utils.run_lease import (
    RUN_LEASE_RENEW_INTERVAL_SECONDS,
    RUN_LEASE_TTL_SECONDS,
    RUN_OWNER_ID,
    is_deadline_exceeded,
    is_lease_alive,
    lease_deadline,
)
from utils.time import utc_now_naive

# 回收时一轮最多扫描多少条活跃 run。正常每次 0-2 条；设上限只是防止迁移后第一次
# tick 撞上历史遗留的一大堆活跃行时把时间全花在这。按 created_at 升序取——
# 最老的活跃 run 最可能是僵尸。
MAX_ACTIVE_RUNS_SCANNED = 100

# 回收原因文案（事件账本与 error_message 共用，避免两处不一致）
REASON_LEASE_EXPIRED = "运行进程失联（租约过期），已标记为超时"
REASON_DEADLINE_EXCEEDED = "运行超过执行预算，已标记为超时"


def renew_owned_leases(session: Session) -> int:
    """续租本进程持有的所有活跃 run。返回续租条数。

    ⚠️ 副作用（写在这里，免得后人踩）：`AgentRun.updated_at` 配了 `onupdate=now()`，
    所以续租会顺带把它刷新。这可以接受——`updated_at` 目前**没有任何功能性消费者**
    （曾用它做「30 分钟没动就猜 run 死了」的启发式，已随租约一起删除）。但**不要**
    在它上面再建「最后活动时间」这类判据：它现在的含义是「最后一次被续租」，每 20s
    就会变。真正的「最后活动」看 `last_heartbeat_at`，生死看 `lease_expires_at`。
    """
    owned = session.exec(
        select(AgentRun)
        .where(AgentRun.owner == RUN_OWNER_ID)
        .where(AgentRun.status.in_(ACTIVE_RUN_STATUSES))
    ).all()

    deadline = lease_deadline()
    for run in owned:
        run.lease_expires_at = deadline
        session.add(run)
    session.commit()
    return len(owned)


def reclaim_expired_leases(session: Session, now=None) -> list[tuple[str, list[str]]]:
    """回收「没有存活证据 / 预算用尽」的活跃 run。

    返回 `(thread_id, [run_id])` 供调用方清理 checkpoint。两类目标：
    - 租约过期或无租约 → 没有进程在管它
    - 超过 deadline → 进程可能还在，但预算已用尽（HITL 等待期 deadline 被挂起，
      所以等待中的 run 不会命中这条）

    存活与预算的判定**复用 `utils/run_lease` 的同一对函数**，不在查询里重写一遍
    —— 判定散落正是旧口径的病根（互斥认为它活着、回收认为它死了）。所以这里是
    「取一页活跃行 → 用同一个判定筛」，代价可控（见 MAX_ACTIVE_RUNS_SCANNED）。
    """
    now = now or utc_now_naive()
    rows = session.exec(
        select(AgentRun)
        .where(AgentRun.status.in_(ACTIVE_RUN_STATUSES))
        .order_by(AgentRun.created_at)
        .limit(MAX_ACTIVE_RUNS_SCANNED)
    ).all()

    reclaimed: list[tuple[str, list[str]]] = []
    for run in rows:
        lease_alive = is_lease_alive(run.lease_expires_at, now)
        over_budget = is_deadline_exceeded(run.deadline_at, now)
        # ⚠️ 两个判据是**或**关系，不能写成「租约有效就跳过」：进程活着但流早断了
        # （SSE 断开后没人驱动图）时，租约一直续、run 永远不超时，预算就成了死条款。
        # 旧清理循环里 `deadline_at < now` 那条分支管的正是这种情形，换机制时必须带过来。
        if lease_alive and not over_budget:
            continue
        # 两种情况用户看到的都是「超时」，但排查结论完全不同（进程没了 vs 跑太久），
        # 所以原因分开写。
        reason = REASON_DEADLINE_EXCEEDED if over_budget else REASON_LEASE_EXPIRED
        timed_out = mark_run_timed_out_by_id(
            session,
            run.id,
            error_message=reason,
            current_node=run.current_node,
        )
        if timed_out is None:
            continue
        session.commit()
        reclaimed.append((run.thread_id, [run.id]))
        logger.warning(
            "[RunLease] 回收 run | run_id=%s | 原因=%s | owner=%s | lease=%s",
            run.id,
            reason,
            run.owner,
            run.lease_expires_at,
        )
    return reclaimed


def supervisor_tick() -> tuple[int, list[tuple[str, list[str]]]]:
    """一轮维护：续租 + 回收。

    抽成模块级函数是为了能被直接测（含「单轮失败不能让循环死掉」这条安全性）。
    """
    with Session(engine) as session:
        return renew_owned_leases(session), reclaim_expired_leases(session)


async def run_run_lease_supervisor() -> None:
    """租约 supervisor：每 RUN_LEASE_RENEW_INTERVAL_SECONDS 续租一次并回收过期租约。

    以 asyncio 任务随应用启动（main.py lifespan）；取消时随进程退出，
    退出后不再续租 → 本进程持有的 run 会在 TTL 后由**任意**进程回收，这正是
    「进程崩溃了怎么办」的答案，不需要额外的崩溃检测。
    """
    logger.info(
        "[RunLease] supervisor 启动 | owner=%s | ttl=%ss | interval=%ss",
        RUN_OWNER_ID,
        RUN_LEASE_TTL_SECONDS,
        RUN_LEASE_RENEW_INTERVAL_SECONDS,
    )

    while True:
        try:
            renewed, reclaimed = await asyncio.to_thread(supervisor_tick)
            if reclaimed:
                logger.warning("[RunLease] 本轮续租 %d 个、回收 %d 个 run", renewed, len(reclaimed))
            for thread_id, run_ids in reclaimed:
                # 与其余终态路径一致：run 终态后清 checkpoint（LangGraph 无自动 TTL）
                from utils.db import cleanup_terminal_run

                await cleanup_terminal_run(thread_id, run_ids)
        except Exception as exc:  # noqa: BLE001
            # 单轮失败不能让 supervisor 死掉：租约停止续期会让**所有**本进程的 run
            # 在 TTL 后被误回收。宁可这一轮什么都没做，也要活着等下一轮。
            logger.warning("[RunLease] 本轮续租/回收失败: %s", exc)
        await asyncio.sleep(RUN_LEASE_RENEW_INTERVAL_SECONDS)
