"""run 的**存活与预算判定**：一个 run 是死是活、钱还够不够，只由这里说了算（决定 2）。

两个正交判据放同一处，是为了让「谁负责杀 run」这件事一眼可查：
- 租约（`is_lease_alive`）= **存活**：还有进程在管它吗
- deadline（`is_deadline_exceeded`）= **预算**：这次执行允许跑多久
不该合并：一个活着但超预算的 run 该被预算杀，一个刚崩掉的 run 该被租约回收。

## 为什么需要租约

旧口径用四处启发式拼出「run 还活着吗」：`last_heartbeat_at` 的写入 + 清理循环里
「`updated_at` 30 分钟没动就猜它死了」+ 活跃 run 互斥 + 进程内 in-flight 去重。
四条各自成立，合起来却答不出一个基本问题：**这条 `status=running` 的记录，是
真的在跑，还是进程已经没了？** 猜错的代价双向都疼——猜活了，僵尸 run 一直挡住
会话（409）且没人回收；猜死了，正在跑的长任务被误杀。

租约回答的就是这个问题：谁（`owner`）持有多久（`lease_expires_at`）。

## 租约语义（三句话）

1. **持有**：驱动一个 run 的进程把 `owner` 写自己、`lease_expires_at` 写 now+TTL。
2. **续租**：进程活着就定期续（supervisor 每 `RUN_LEASE_RENEW_INTERVAL_SECONDS` 一次，
   与本进程任何一次 DB 写入顺带续）。**续租与「有没有事件」无关**——一次 LLM 调用
   可能几分钟没有任何 token，那期间进程仍然活着，租约必须照样续。
3. **过期即死**：`lease_expires_at < now`（或为 NULL）→ 这个 run 没有存活证据，
   由回收逻辑标记超时。回收不区分「哪个进程」——谁都行，包括刚启动的新进程。

## 为什么 `owner` 是进程级而不是「请求级」

同一进程可能同时驱动多个 run（多会话并发），而「同一 run 不被两个进程同时驱动」
只需要进程粒度就够——进程内已经有了互斥与去重（in-flight dict），那部分语义
**有意保留**，不并入租约（见 docs/TARGET-ARCHITECTURE.md 决定 2）。
"""

from __future__ import annotations

import os
import socket
import uuid
from datetime import datetime, timedelta

from utils.time import utc_now

# 租约时长：必须**远大于**续租间隔（下面那个），否则正常运行的 run 会被自己的慢周期
# 误判成死的。180s 配合 20s 续租 = 9 倍余量 —— 事件循环被同步任务卡住几十秒、
# supervisor 某轮被拖慢，都不会导致活着的 run 被误回收。
#
# 取值权衡（写清楚，免得后人随手调）：
#   - 调**短**：崩溃后的恢复更快（僵尸 run 更早让位、更早标记超时），但「活着但卡住」
#     的进程会被误判死 → 同一条 run 被标超时而实际仍在跑（状态分裂），代价更大。
#   - 调**长**：更安全，但僵尸占用会话（409）与「假运行中」状态的时间更久。
# 旧口径是「`updated_at` 30 分钟没动就猜它死了」——纯猜测，且 30 分钟内僵尸一直挡住
# 会话。现在 3 分钟且有明确的存活证据（谁持有、到什么时候），两侧都更好。
RUN_LEASE_TTL_SECONDS = 180
# supervisor 的续租/回收周期
RUN_LEASE_RENEW_INTERVAL_SECONDS = 20


def _build_owner_id() -> str:
    """本进程的身份：主机名 + pid + 短随机数。

    随机后缀是为了「同一台机器上重启后的新旧进程」可区分——只用 pid 的话，
    重启后 pid 可能复用，新进程会把旧进程留下的租约误认成自己的。
    """
    host = socket.gethostname()[:40]
    return f"{host}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


# 进程身份（模块加载时确定一次，全程不变）
RUN_OWNER_ID = _build_owner_id()


def lease_deadline(now: datetime | None = None) -> datetime:
    """本次续租后的到期时刻。"""
    return (now or utc_now()) + timedelta(seconds=RUN_LEASE_TTL_SECONDS)


def is_lease_alive(lease_expires_at: datetime | None, now: datetime | None = None) -> bool:
    """租约是否仍然有效。

    **NULL = 不活**（无存活证据）。这条判定在三个地方共用（互斥、回收、supervisor），
    必须是同一个函数——分散写就会出现「互斥认为它活着、回收认为它死了」这种
    自相矛盾的状态，那正是旧口径的病根。
    """
    if lease_expires_at is None:
        return False
    return lease_expires_at > (now or utc_now())


def accepts_renewal(owner: str | None) -> bool:
    """本进程是否可以续租/认领这个 run。

    无主（None，迁移前遗留或刚建）或本进程持有 → 可以；他人持有 → 不碰
    （那是「同一 run 被两个进程驱动」的情形，接口层面已被 acquire 挡住，
    这里再兜一层，避免顺带的写入把别人的租约改掉）。
    """
    return owner is None or owner == RUN_OWNER_ID


def is_deadline_exceeded(deadline_at: datetime | None, now: datetime | None = None) -> bool:
    """执行预算是否已用尽。

    `deadline_at` 为 None = 预算被挂起（HITL 等待期，见
    `services/chat/run_lifecycle.pause_deadline`）→ 永不过期：用户思考的时间不该
    消耗执行预算，等待中的 run 也因此不会被回收逻辑误杀。

    这是「预算判据」的唯一定义：流内的 deadline 守卫（每帧检查）与后台回收都用它。
    """
    if deadline_at is None:
        return False
    return deadline_at <= (now or utc_now())
