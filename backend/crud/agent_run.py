"""AgentRun 数据访问层。

**run 租约的读写点都在这里**（决定 2）：创建时认领、状态写/心跳时续租、进入终态时
释放、互斥判定看租约是否有效。策略与判定（TTL、owner 身份、`is_lease_alive`）在
`utils/run_lease.py`；后台续租/回收循环在 `services/run_lease_service.py`。

一句话原则：**`status` 说「应该是什么状态」，租约说「还有人在管它吗」**。
状态写入顺带续租（进程显然活着），终态写入顺带释放（没有所有权了）。
"""

from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, select

from config import settings
from crud.run_event import emit_run_created, emit_run_started, emit_run_timed_out
from models import AgentRun, RunStatus, Thread, ThreadStatus
from models.enums import _NO_RENEW_RUN_STATUSES
from utils.error_codes import ErrorCode
from utils.exceptions import AppError
from utils.run_lease import RUN_OWNER_ID, accepts_renewal, is_lease_alive, lease_deadline
from utils.time import utc_now_naive

ACTIVE_RUN_STATUSES = {
    RunStatus.QUEUED,
    RunStatus.RUNNING,
    RunStatus.RESUMING,
    RunStatus.WAITING_FOR_APPROVAL,
}

TERMINAL_RUN_STATUSES = {
    RunStatus.COMPLETED,
    RunStatus.FAILED,
    RunStatus.CANCELLED,
    RunStatus.TIMED_OUT,
}

# 互斥判定时最多看这么多条活跃记录：过滤「租约是否有效」用同一个纯函数（见
# get_active_run_for_thread 的注释），所以要在 Python 侧过滤，条数必须可控。
# 一个会话同时存在多条活跃 run 只可能是「僵尸 + 新的」这种短暂并存。
MAX_ACTIVE_RUNS_SCANNED = 20


def _claim_lease(run: AgentRun, *, new_attempt: bool = False) -> bool:
    """认领/续租。返回是否续上了（他人持有 / 已终态时返回 False，不许碰）。

    `new_attempt=True` 表示「这是又一次驱动」（创建 / 审批后续跑），计数 +1；
    顺带的写入（状态变更、心跳）只续租不计数。

    终态 run 一律不许认领，这条挡的是一类真实竞态：流已判死、run 刚被回收成
    timed_out，而某个还没退出的在途心跳/状态写入**又把它复活**成「有租约的活跃
    run」——僵尸复活比不回收更难查。
    """
    if run.status not in ACTIVE_RUN_STATUSES:
        return False
    if not accepts_renewal(run.owner):
        return False
    run.owner = RUN_OWNER_ID
    run.lease_expires_at = lease_deadline()
    if new_attempt:
        run.attempt = (run.attempt or 0) + 1
    return True


def _release_lease(run: AgentRun) -> None:
    """进入终态即释放：没有所有权可言（同时也让互斥不再被它挡住）。"""
    run.owner = None
    run.lease_expires_at = None


def derive_thread_status_from_run_status(status: RunStatus) -> ThreadStatus:
    """将运行时状态映射为线程展示态。"""
    if status == RunStatus.WAITING_FOR_APPROVAL:
        return ThreadStatus.PAUSED
    if status in {RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.RESUMING}:
        return ThreadStatus.RUNNING
    return ThreadStatus.IDLE


def _sync_thread_status(db: Session, thread_id: str, status: RunStatus) -> None:
    """根据运行状态同步 Thread.status 作为展示缓存。"""
    thread = db.get(Thread, thread_id)
    if thread is None:
        return

    thread.status = derive_thread_status_from_run_status(status)
    thread.updated_at = utc_now_naive()
    db.add(thread)


def create_agent_run(
    db: Session,
    *,
    thread_id: str,
    user_id: str,
    entrypoint: str,
    mode: str,
    idempotency_key: str | None = None,
    checkpoint_namespace: str | None = None,
) -> AgentRun:
    """创建新的运行实例。"""
    started_at = utc_now_naive()
    run = AgentRun(
        thread_id=thread_id,
        user_id=user_id,
        entrypoint=entrypoint,
        mode=mode,
        status=RunStatus.RUNNING,
        idempotency_key=idempotency_key,
        checkpoint_namespace=checkpoint_namespace,
        started_at=started_at,
        updated_at=started_at,
        deadline_at=started_at + timedelta(seconds=settings.run_deadline_seconds),
    )
    # 出生即持有租约（attempt=1）：新 run 的存活证据从第一刻起就只有这一个来源
    _claim_lease(run, new_attempt=True)
    db.add(run)
    db.flush()

    # 🔥 写入 run_created 事件到账本
    emit_run_created(
        db,
        run_id=run.id,
        thread_id=thread_id,
        entrypoint=entrypoint,
        mode=mode,
    )
    emit_run_started(
        db,
        run_id=run.id,
        thread_id=thread_id,
        current_node="entrypoint",
    )

    _sync_thread_status(db, thread_id, run.status)
    return run


def run_holds_thread(run: AgentRun, *, now=None) -> bool:
    """该 run 是否「活着并占着这条会话」。**存活判定的唯一入口**（互斥与回收共用）。

    停在审批点（waiting_for_approval）的 run **无条件算活着**：它等的是**人**，
    不是进程——这一轮流已收尾，没有任何进程会替它续租（续租只发生在「本进程持有的
    活跃 run」上），而它的执行预算已被 `pause_deadline` 挂起。少了这一条例外会出现
    最坏的一类误杀：计划放着几分钟不点 → 租约到期 → 回收段把它标成「运行进程失联」
    → 审批卡消失、任务再也批不了（2026-09-13 实测：一小时内 5 条待审批 run 全被误杀）。

    其余活跃状态照旧看租约：状态说「应该是什么状态」，租约说「还有人在管它吗」。
    """
    if run.status == RunStatus.WAITING_FOR_APPROVAL:
        return True
    return is_lease_alive(run.lease_expires_at, now)


def get_active_run_for_thread(
    db: Session,
    *,
    thread_id: str,
    user_id: str | None = None,
    exclude_run_id: str | None = None,
) -> AgentRun | None:
    """获取线程下**真正在跑**的运行实例（活跃状态 + `run_holds_thread`）。

    为什么在 Python 侧过滤存活、而不是写进 SQL：存活判定必须只有一处实现
    （`run_holds_thread` → `utils/run_lease.is_lease_alive`）。在 SQL 里再写一遍
    `lease_expires_at > now` 就是第二个真相——两处一旦不一致就会出现「互斥认为
    它活着、回收认为它死了」这种自相矛盾（旧口径的病根正是判定逻辑散落各处）。
    代价是取一小页记录再筛，见 MAX_ACTIVE_RUNS_SCANNED。
    """
    statement = (
        select(AgentRun)
        .where(AgentRun.thread_id == thread_id)
        .where(AgentRun.status.in_(ACTIVE_RUN_STATUSES))
        .order_by(AgentRun.created_at.desc())
        .limit(MAX_ACTIVE_RUNS_SCANNED)
    )
    if user_id is not None:
        statement = statement.where(AgentRun.user_id == user_id)
    if exclude_run_id is not None:
        statement = statement.where(AgentRun.id != exclude_run_id)
    for run in db.exec(statement).all():
        if run_holds_thread(run):
            return run
    return None


def ensure_no_active_run_for_thread(
    db: Session,
    *,
    thread_id: str,
    user_id: str | None = None,
    exclude_run_id: str | None = None,
) -> None:
    """确保线程下没有**真正在跑**的其他运行实例。

    行为变化（决定 2 的收益之一）：僵尸 run（进程已死、状态还挂在 running）不再
    挡住新任务——它的租约过期即被视为已死，新 run 可以立刻开始，由 supervisor
    随后把僵尸回收掉。旧口径下这种情况要等清理循环「猜」满 30 分钟才放行。
    """
    active_run = get_active_run_for_thread(
        db,
        thread_id=thread_id,
        user_id=user_id,
        exclude_run_id=exclude_run_id,
    )
    if active_run is None:
        return

    raise AppError(
        message="当前会话已有进行中的任务，请先等待完成、恢复或取消后再发起新任务",
        code=ErrorCode.ACTIVE_RUN_CONFLICT,
        status_code=409,
        details={
            "thread_id": thread_id,
            "active_run_id": active_run.id,
            "active_run_status": str(active_run.status),
            "current_node": active_run.current_node,
            "lease_expires_at": (
                active_run.lease_expires_at.isoformat() if active_run.lease_expires_at else None
            ),
        },
    )


def acquire_run_lease(db: Session, run_id: str) -> bool:
    """驱动一个 run 之前认领租约（`attempt` +1）。返回是否认领成功。

    什么时候需要它：**续跑**（审批后恢复执行）。新 run 由 `create_agent_run` 出生即
    持有，不需要再认领。返回 False 表示「没能认领」——run 不存在，或**另一个进程正
    持有有效租约**（多实例/重复投递）。调用方必须据此拒绝驱动：硬闯会导致两个进程
    同时驱动一个 run，而对方的 supervisor 会在自己的续租周期里把它当成无主 run 回收。
    """
    run = db.get(AgentRun, run_id)
    if run is None:
        return False
    if not _claim_lease(run, new_attempt=True):
        return False
    db.add(run)
    db.commit()
    return True


def mark_run_completed(db: Session, run: AgentRun) -> None:
    """标记运行完成。"""
    run.status = RunStatus.COMPLETED
    run.completed_at = utc_now_naive()
    run.updated_at = utc_now_naive()
    _release_lease(run)  # 终态即释放：不再享有所有权
    db.add(run)
    _sync_thread_status(db, run.thread_id, run.status)


def mark_run_completed_by_id(db: Session, run_id: str) -> AgentRun | None:
    """按 ID 标记运行完成。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    mark_run_completed(db, run)
    db.commit()  # 🔥 关键：确保修改持久化
    return run


def update_run_status(
    db: Session,
    run: AgentRun,
    status: RunStatus,
    *,
    current_node: str | None = None,
) -> None:
    """更新运行状态和当前节点（顺带续租 / 终态释放）。"""
    run.status = status
    if current_node is not None:
        run.current_node = current_node
    run.last_heartbeat_at = utc_now_naive()
    run.updated_at = utc_now_naive()
    if status in _NO_RENEW_RUN_STATUSES:
        _release_lease(run)
    else:
        # 状态写入本身就证明「本进程在管这个 run」→ 顺带续租，零额外开销
        _claim_lease(run)
    db.add(run)
    _sync_thread_status(db, run.thread_id, run.status)


def mark_run_failed(
    db: Session,
    run: AgentRun,
    *,
    error_message: str,
    error_code: str | None = None,
) -> None:
    """标记运行失败。"""
    run.status = RunStatus.FAILED
    run.error_code = error_code
    run.error_message = error_message
    run.updated_at = utc_now_naive()
    _release_lease(run)
    db.add(run)
    _sync_thread_status(db, run.thread_id, run.status)


def update_run_status_by_id(
    db: Session,
    run_id: str,
    status: RunStatus,
    *,
    current_node: str | None = None,
) -> AgentRun | None:
    """按 ID 更新运行状态。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    update_run_status(db, run, status, current_node=current_node)
    return run


def touch_run_heartbeat_by_id(
    db: Session,
    run_id: str,
    *,
    current_node: str | None = None,
) -> AgentRun | None:
    """更新运行实例心跳，可选同步当前节点。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    if current_node is not None:
        run.current_node = current_node
    now = utc_now_naive()
    run.last_heartbeat_at = now
    run.updated_at = now
    # 心跳顺带续租：这是「进程活着」最频繁的信号，且写的是同一行、零额外开销。
    # 注意它**不是**存活判定的依据（判定只看租约）——心跳是诊断记录。
    _claim_lease(run)
    db.add(run)
    return run


def mark_run_failed_by_id(
    db: Session,
    run_id: str,
    *,
    error_message: str,
    error_code: str | None = None,
) -> AgentRun | None:
    """按 ID 标记运行失败。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    mark_run_failed(db, run, error_message=error_message, error_code=error_code)
    return run


def mark_run_timed_out_by_id(
    db: Session,
    run_id: str,
    *,
    error_message: str = "运行超时",
    error_code: str | None = ErrorCode.RUN_TIMED_OUT,
    current_node: str | None = None,
) -> AgentRun | None:
    """按 ID 将运行标记为超时。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    run.status = RunStatus.TIMED_OUT
    run.current_node = current_node
    run.error_code = error_code
    run.error_message = error_message
    run.timed_out_at = utc_now_naive()
    run.updated_at = utc_now_naive()
    _release_lease(run)
    db.add(run)
    emit_run_timed_out(
        db,
        run_id=run.id,
        thread_id=run.thread_id,
        current_node=current_node,
        deadline_at=run.deadline_at.isoformat() if run.deadline_at else None,
    )
    _sync_thread_status(db, run.thread_id, run.status)
    return run


def mark_run_cancelled_by_id(
    db: Session,
    run_id: str,
    *,
    error_message: str = "运行已取消",
    error_code: str | None = ErrorCode.RUN_CANCELLED,
    current_node: str | None = None,
) -> AgentRun | None:
    """按 ID 将运行标记为取消。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    run.status = RunStatus.CANCELLED
    run.current_node = current_node
    run.error_code = error_code
    run.error_message = error_message
    run.cancelled_at = utc_now_naive()
    run.updated_at = utc_now_naive()
    _release_lease(run)
    db.add(run)
    _sync_thread_status(db, run.thread_id, run.status)
    return run


def add_run_token_usage(
    run_id: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> bool:
    """把一次 LLM 调用的用量增量累加到 run（B5 用量记账）。

    自建 Session（与 async_save_expert_result 同一模式：节点侧不持有
    可靠的请求级会话，后台线程独立开连接）。并发增量在 SQL 层累加，
    避免读改写竞态。返回是否成功。
    """
    from sqlalchemy import update

    from database import Session, engine
    from utils.logger import logger

    try:
        with Session(engine) as session:
            session.execute(
                update(AgentRun)
                .where(AgentRun.id == run_id)
                .values(
                    prompt_tokens=AgentRun.prompt_tokens + prompt_tokens,
                    completion_tokens=AgentRun.completion_tokens + completion_tokens,
                    total_tokens=AgentRun.total_tokens + prompt_tokens + completion_tokens,
                )
            )
            session.commit()
        return True
    except Exception as exc:  # 记账失败不影响执行主流程
        logger.warning("[TokenUsage] 记账失败 run=%s: %s", run_id, exc)
        return False
