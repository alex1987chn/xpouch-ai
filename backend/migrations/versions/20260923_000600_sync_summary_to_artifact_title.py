"""存量清洗：专家消息 summary 与 artifact.title 同源对齐

summary 此前取产出首行原文（未清洗）——消息卡产物横条把它当标题显示，
模型过渡句/长句会整段糊上去（用户实报"显得很乱"）。生成逻辑已收敛为
与 artifact.title 同一提取规则（utils.title_extract.artifact_title_from_output），
本迁移把存量消息的 summary 同步为其产物的 title（按 artifact_ids
第一个关联；无产物或 title 为通用兜底的行保持原样不动——同值无需写）。

数据回填不回滚。
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260923_000600"
down_revision: str | None = "20260923_000500"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    import json

    conn = op.get_bind()
    # ⚠️ extra_data 列类型跨环境漂移（生产=text）：统一经
    # `NULLIF(extra_data::text,'')::json` 取值，两种列类型通吃（同 000500）
    rows = conn.execute(
        text(
            "SELECT m.id, m.extra_data FROM message m "
            "WHERE NULLIF(m.extra_data::text, '')::json ->> 'message_kind' = 'expert_result' "
            "AND NULLIF(m.extra_data::text, '')::json ->> 'summary' IS NOT NULL"
        )
    ).fetchall()
    synced = 0
    for msg_id, extra in rows:
        data = json.loads(extra) if isinstance(extra, str) else dict(extra or {})
        artifact_ids = data.get("artifact_ids") or []
        if not artifact_ids:
            continue
        art = conn.execute(
            text("SELECT title FROM artifact WHERE id = :a"),
            {"a": artifact_ids[0]},
        ).fetchone()
        if art is None or not art[0] or art[0] == data.get("summary"):
            continue
        data["summary"] = art[0]
        # 回写用字符串参数（text/json 列通吃，见 000500 注）
        conn.execute(
            text("UPDATE message SET extra_data = :j WHERE id = :id"),
            {"j": json.dumps(data, ensure_ascii=False), "id": msg_id},
        )
        synced += 1
    print(f"[migration 000600] synced {synced} expert-message summaries to artifact titles")


def downgrade() -> None:
    # 数据回填不回滚
    pass
