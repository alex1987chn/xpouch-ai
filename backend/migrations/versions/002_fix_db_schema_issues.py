"""Fix DB schema issues - embedding type, datetime type, updated_at trigger, cascade delete

Revision ID: 002
Revises: 001
Create Date: 2026-03-03 09:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    修复数据库 schema 问题：
    1. user_memories.embedding: String -> Vector(1024)
    2. user_memories.created_at: String -> DateTime
    3. 为所有 updated_at 字段添加自动更新触发器
    4. customagent 外键添加 ON DELETE CASCADE
    """
    
    # ==========================================================================
    # 1. 修复 user_memories 表字段类型
    # ==========================================================================
    
    # 确保 pgvector 扩展已启用
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    
    # 添加临时列存储向量数据（以文本形式）
    op.add_column('user_memories', sa.Column('embedding_new', sa.String(), nullable=True))
    op.add_column('user_memories', sa.Column('created_at_new', sa.DateTime(), nullable=True))
    
    # 迁移数据：将现有数据转换到新列
    # 先检查 created_at 的当前类型
    conn = op.get_bind()
    result = conn.execute(text("""
        SELECT data_type FROM information_schema.columns 
        WHERE table_name = 'user_memories' AND column_name = 'created_at'
    """))
    created_at_type = result.scalar()
    
    if created_at_type == 'timestamp without time zone':
        # 已经是 timestamp 类型，直接复制
        op.execute("""
            UPDATE user_memories 
            SET embedding_new = embedding,
                created_at_new = created_at
        """)
    else:
        # 是 string 类型，需要转换
        op.execute("""
            UPDATE user_memories 
            SET embedding_new = embedding,
                created_at_new = 
                    CASE 
                        WHEN created_at::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN created_at::timestamp
                        WHEN created_at::text ~ '^\\d{10}(\\.\\d+)?$' THEN to_timestamp(created_at::bigint)::timestamp
                        ELSE NOW()
                    END
        """)
    
    # 删除旧列
    op.drop_column('user_memories', 'embedding')
    op.drop_column('user_memories', 'created_at')
    
    # 重命名新列
    op.alter_column('user_memories', 'embedding_new', new_column_name='embedding')
    op.alter_column('user_memories', 'created_at_new', new_column_name='created_at')
    
    # 修改 embedding 列为 Vector 类型（使用 USING 转换）
    # 注意：如果 embedding 列有数据，需要确保数据格式正确
    op.execute("""
        ALTER TABLE user_memories 
        ALTER COLUMN embedding TYPE vector(1024) 
        USING CASE 
            WHEN embedding IS NULL THEN NULL
            WHEN embedding ~ '^\\[' THEN embedding::vector(1024)
            ELSE NULL
        END
    """)
    
    # 确保 created_at 不为 NULL
    op.execute("UPDATE user_memories SET created_at = NOW() WHERE created_at IS NULL")
    op.alter_column('user_memories', 'created_at', nullable=False)
    
    # ==========================================================================
    # 2. 为所有表添加 updated_at 自动更新触发器
    # ==========================================================================
    
    # 创建触发器函数
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    
    # 需要添加触发器的表
    tables_with_updated_at = [
        'user',
        'thread', 
        'customagent',
        'subtask',
        'tasksession',
        'systemexpert',
        'mcp_servers'
    ]
    
    for table in tables_with_updated_at:
        trigger_name = f"trg_{table}_updated_at"
        # 先删除已存在的触发器（避免重复）
        op.execute(f"DROP TRIGGER IF EXISTS {trigger_name} ON \"{table}\"")
        # 创建新触发器
        op.execute(f"""
            CREATE TRIGGER {trigger_name}
            BEFORE UPDATE ON \"{table}\"
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        """)
    
    # ==========================================================================
    # 3. 修复 customagent 外键约束（添加级联删除）
    # ==========================================================================
    
    # 先删除旧的外键约束
    op.drop_constraint('customagent_user_id_fkey', 'customagent', type_='foreignkey')
    
    # 添加新的外键约束，带级联删除
    op.create_foreign_key(
        'customagent_user_id_fkey',
        'customagent',
        'user',
        ['user_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # ==========================================================================
    # 4. 修复其他缺失的时间戳字段
    # ==========================================================================
    
    # systemexpert 表可能缺少 created_at 字段
    # 检查并添加（如果不存在）
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('systemexpert')]
    
    if 'created_at' not in columns:
        op.add_column('systemexpert', sa.Column('created_at', sa.DateTime(), nullable=True))
        op.execute("UPDATE systemexpert SET created_at = updated_at WHERE created_at IS NULL")
        op.execute("UPDATE systemexpert SET created_at = NOW() WHERE created_at IS NULL")
        op.alter_column('systemexpert', 'created_at', nullable=False)


def downgrade() -> None:
    """回滚迁移（谨慎使用）"""
    
    # 删除触发器
    tables_with_updated_at = [
        'user', 'thread', 'customagent', 'subtask', 
        'tasksession', 'systemexpert', 'mcp_servers'
    ]
    for table in tables_with_updated_at:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON \"{table}\"")
    
    # 删除触发器函数
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column()")
    
    # 恢复 customagent 外键（去掉级联删除）
    op.drop_constraint('customagent_user_id_fkey', 'customagent', type_='foreignkey')
    op.create_foreign_key(
        'customagent_user_id_fkey',
        'customagent',
        'user',
        ['user_id'],
        ['id']
    )
    
    # 恢复 user_memories 字段类型（简单回滚为 String）
    op.alter_column('user_memories', 'embedding', type_=sa.String(), postgresql_using='embedding::text')
    op.alter_column('user_memories', 'created_at', type_=sa.String(), postgresql_using='created_at::text')
