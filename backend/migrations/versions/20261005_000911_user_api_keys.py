"""user_api_keys 表（BYOK 用户自带 API Key）

Revision ID: 20261005_000911
Revises: 20261004_000910
Create Date: 2026-10-05

BYOK v1（2026-10-05 方案）：每用户每 provider 一行，密文落库
（Fernet，主密钥 BYOK_MASTER_KEY 只在服务端环境变量），key_hint 为
掩码尾 4 位。解析链「用户 key > 实例 env key」收口在
providers_config.get_provider_api_key，见 utils/byok.py 模块注释。

- 无种子数据：用户 key 是用户自己录入的，不是内置事实
- 未配置 BYOK_MASTER_KEY 时表存在但无人写入/读取（功能整体关闭），
  不影响任何既有行为

守卫式字面量 SQL：先查 information_schema 判存在再建表，幂等重跑不炸。
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20261005_000911"
down_revision: str | None = "20261004_000910"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(
        text("SELECT 1 FROM information_schema.tables WHERE table_name = 'user_api_keys'")
    ).fetchone()
    if not exists:
        conn.execute(
            text(
                """
                CREATE TABLE user_api_keys (
                    id VARCHAR(64) NOT NULL PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    provider VARCHAR(64) NOT NULL,
                    encrypted_key TEXT NOT NULL,
                    key_hint VARCHAR(16) NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL,
                    CONSTRAINT uq_user_api_key UNIQUE (user_id, provider),
                    CONSTRAINT fk_user_api_keys_user_id_user_id
                        FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX idx_user_api_keys_user_id ON user_api_keys (user_id)"))
        conn.execute(text("CREATE INDEX idx_user_api_keys_provider ON user_api_keys (provider)"))
        print("[migration 000911] user_api_keys 已建（BYOK v1，密文+掩码+用户隔离唯一键）")
    else:
        print("[migration 000911] user_api_keys 已存在，跳过")


def downgrade() -> None:
    # 用户 key 数据不可再生（用户手里才有明文），回滚保守保留表
    pass
