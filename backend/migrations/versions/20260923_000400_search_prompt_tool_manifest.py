"""search 教材：工具条款从排他定向改为工具清单让位（MCP 认知通道）

教材原条款「当需要实时信息时，必须使用 `search_web`」把搜索专家定向死在
网页搜索上——bind_tools 绑了高德 maps_* 等全部 MCP 工具（治理层默认
放开），但模型被教材和框架指令双重定向，从不主动使用（协议层通、
认知层断）。配套改动：执行框架头部动态注入【可用工具清单】（真名），
教材同步改为「以清单为准 + 地点/本地生活优先 maps_*」。

顺带修正：教材引用的工具名 `search_web` 从来不是实际绑定的真名
（异步版为 `asearch_web`），本次一并对齐。

只覆盖 is_dynamic=false 的内置行（用户自建专家不碰）；教材单一真相源
= expert_config.EXPERT_DEFAULTS，本迁移只负责把修复下发到已部署库。
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260923_000400"
down_revision: str | None = "20260923_000300"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PROMPT_SYNC_TARGETS = {"search"}


def upgrade() -> None:
    from datetime import datetime

    from expert_config import EXPERT_DEFAULTS

    conn = op.get_bind()
    now = datetime.now().isoformat()

    for entry in EXPERT_DEFAULTS:
        if entry["expert_type"] not in _PROMPT_SYNC_TARGETS:
            continue
        conn.execute(
            text(
                "UPDATE systemexpert SET system_prompt = :p, updated_at = :u, "
                "config_version = config_version + 1 "
                "WHERE expert_type = :t AND is_dynamic = false"
            ),
            {"p": entry["system_prompt"], "u": now, "t": entry["expert_type"]},
        )


def downgrade() -> None:
    # 教材下发不回滚（回滚会把内置专家教材退回排他定向的旧版）
    pass
