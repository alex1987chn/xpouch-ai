"""加宽 user.verification_code 列（16 → 255），修复 OTP 发码 500

背景：
- 20260304_180000 标准化迁移把 verification_code 收窄为 VARCHAR(16)，
  当时库里存 6 位明文验证码，16 足够
- v3.4.3 起验证码改为入库 SHA-256 哈希（utils/secret_hash.hash_secret，
  64 位十六进制），写入超过 16 位 → PostgreSQL StringDataRightTruncation
  → send-code / verify-code 等一切写验证码列的事务 500

修复策略：
- 条件加宽：仅当列存在显式长度且 < 255 时才 ALTER 到 VARCHAR(255)；
  无限长 varchar 的环境（部分自部署库）no-op，天然幂等
- downgrade 不回缩（回缩只会重新引入截断风险，无收益）

注意：整段 SQL 为硬编码字面量（无外部输入），直接内联在 op.execute 中
以通过安全扫描（禁止 f-string/格式化/变量拼 SQL）。

Revision ID: 20260909_000100
Revises: 20260907_000400
Create Date: 2026-09-09
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260909_000100"
down_revision: str | None = "20260907_000400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user'
          AND column_name = 'verification_code'
          AND character_maximum_length IS NOT NULL
          AND character_maximum_length < 255
    ) THEN
        ALTER TABLE "user" ALTER COLUMN verification_code TYPE VARCHAR(255);
    END IF;
END $$;"""
    )


def downgrade() -> None:
    # 不回缩：保持加宽后的列宽，避免再次引入截断风险
    pass
