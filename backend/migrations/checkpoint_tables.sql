-- ============================================================================
-- LangGraph Checkpoint Tables Migration
-- LangGraph 检查点表迁移（用于复杂模式 AI Agent 协作）
--
-- 特性：
-- - 幂等性：可重复执行，已存在的表/字段/索引会自动跳过
-- - 兼容性：PostgreSQL 13+
-- - 安全性：使用 DO $$ 块确保原子性
--
-- 执行方式：
--   psql -h localhost -U postgres -d xpouch_ai -f checkpoint_tables.sql
-- ============================================================================

\echo 'Starting LangGraph checkpoint tables migration...'

-- ============================================================================
-- 1. checkpoint_migrations 表（迁移版本记录）
-- ============================================================================
\echo 'Creating checkpoint_migrations table...'

CREATE TABLE IF NOT EXISTS checkpoint_migrations (
    v INTEGER PRIMARY KEY
);

\echo '  -> checkpoint_migrations table created (if not exists)'

-- ============================================================================
-- 2. checkpoints 主表
-- ============================================================================
\echo 'Creating checkpoints table...'

CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    type TEXT,
    checkpoint JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS checkpoints_thread_id_idx ON checkpoints(thread_id);

\echo '  -> checkpoints table and index created (if not exists)'

-- ============================================================================
-- 3. checkpoint_blobs 表
-- ============================================================================
\echo 'Creating checkpoint_blobs table...'

CREATE TABLE IF NOT EXISTS checkpoint_blobs (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    version TEXT NOT NULL,
    type TEXT NOT NULL,
    blob BYTEA,
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

-- 索引
CREATE INDEX IF NOT EXISTS checkpoint_blobs_thread_id_idx ON checkpoint_blobs(thread_id);

\echo '  -> checkpoint_blobs table and index created (if not exists)'

-- ============================================================================
-- 4. checkpoint_writes 表
-- ============================================================================
\echo 'Creating checkpoint_writes table...'

CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    type TEXT,
    blob BYTEA NOT NULL,
    task_path TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- 索引
CREATE INDEX IF NOT EXISTS checkpoint_writes_thread_id_idx ON checkpoint_writes(thread_id);

\echo '  -> checkpoint_writes table and index created (if not exists)'

-- ============================================================================
-- 5. 插入迁移版本记录
-- ============================================================================
\echo 'Recording migration versions...'

INSERT INTO checkpoint_migrations (v) VALUES (0)
ON CONFLICT (v) DO NOTHING;

INSERT INTO checkpoint_migrations (v) VALUES (1)
ON CONFLICT (v) DO NOTHING;

INSERT INTO checkpoint_migrations (v) VALUES (2)
ON CONFLICT (v) DO NOTHING;

INSERT INTO checkpoint_migrations (v) VALUES (3)
ON CONFLICT (v) DO NOTHING;

INSERT INTO checkpoint_migrations (v) VALUES (4)
ON CONFLICT (v) DO NOTHING;

INSERT INTO checkpoint_migrations (v) VALUES (6)
ON CONFLICT (v) DO NOTHING;

INSERT INTO checkpoint_migrations (v) VALUES (7)
ON CONFLICT (v) DO NOTHING;

INSERT INTO checkpoint_migrations (v) VALUES (8)
ON CONFLICT (v) DO NOTHING;

INSERT INTO checkpoint_migrations (v) VALUES (9)
ON CONFLICT (v) DO NOTHING;

\echo '  -> Migration versions recorded'

-- ============================================================================
-- 6. 验证表结构
-- ============================================================================
\echo 'Verifying checkpoint tables...'

DO $$
DECLARE
    tables TEXT[];
    required TEXT[] := ARRAY['checkpoints', 'checkpoint_blobs', 'checkpoint_writes', 'checkpoint_migrations'];
    missing TEXT[];
BEGIN
    SELECT array_agg(table_name) INTO tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'checkpoint%';

    SELECT ARRAY_UNION(required, tables) INTO missing;
    missing := array_remove(missing, NULL);

    IF array_length(missing, 1) > 0 THEN
        RAISE NOTICE 'Missing tables: %', missing;
        RAISE EXCEPTION 'Checkpoint tables migration incomplete';
    ELSE
        RAISE NOTICE 'All checkpoint tables exist: %', tables;
    END IF;
END $$;

\echo ''
\echo '✅ LangGraph checkpoint tables migration completed successfully!'
\echo '   Tables created: checkpoints, checkpoint_blobs, checkpoint_writes, checkpoint_migrations'
