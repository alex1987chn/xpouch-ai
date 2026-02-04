-- ============================================================================
-- Unified Migration Script for v3.0
-- 统一的 v3.0 数据库迁移脚本
-- 
-- 特性：
-- - 幂等性：可重复执行，已存在的表/字段/索引会自动跳过
-- - 兼容性：PostgreSQL 13+
-- - 事务安全：使用 DO $$ 块确保原子性
--
-- 执行方式：
--   psql -h localhost -U postgres -d xpouch -f apply_all_migrations.sql
-- ============================================================================

\echo 'Starting v3.0 unified migration...'

-- ============================================================================
-- 1. Message 表：添加 extra_data 字段
-- ============================================================================
\echo 'Checking message.extra_data column...'

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'message' AND column_name = 'extra_data'
    ) THEN
        ALTER TABLE message ADD COLUMN extra_data JSONB DEFAULT NULL;
        \echo '  -> Added message.extra_data column'
    ELSE
        \echo '  -> Column already exists, skipping'
    END IF;
END $$;

-- ============================================================================
-- 2. CustomAgent 表：添加 is_default 字段
-- ============================================================================
\echo 'Checking customagent.is_default column...'

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customagent' AND column_name = 'is_default'
    ) THEN
        ALTER TABLE customagent ADD COLUMN is_default BOOLEAN DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_customagent_is_default ON customagent(is_default);
        \echo '  -> Added customagent.is_default column and index'
    ELSE
        \echo '  -> Column already exists, skipping'
    END IF;

    -- category
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customagent' AND column_name = 'category'
    ) THEN
        ALTER TABLE customagent ADD COLUMN category VARCHAR(50) DEFAULT '综合';
        
        \echo '  -> Added customagent.category column'
    END IF;

    -- is_public
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customagent' AND column_name = 'is_public'
    ) THEN
        ALTER TABLE customagent ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
        
        \echo '  -> Added customagent.is_public column'
    END IF;

    -- conversation_count
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customagent' AND column_name = 'conversation_count'
    ) THEN
        ALTER TABLE customagent ADD COLUMN conversation_count INTEGER DEFAULT 0;
        
        \echo '  -> Added customagent.conversation_count column'
    END IF;
END $$;

-- ============================================================================
-- 3. Thread 表字段扩展
-- ============================================================================
\echo 'Checking thread table columns...'

DO $$
BEGIN
    -- agent_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'agent_type'
    ) THEN
        ALTER TABLE thread ADD COLUMN agent_type VARCHAR(20) DEFAULT 'default';
        \echo '  -> Added thread.agent_type column'
    END IF;
    
    -- agent_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'agent_id'
    ) THEN
        ALTER TABLE thread ADD COLUMN agent_id VARCHAR(50) DEFAULT 'sys-default-chat';
        \echo '  -> Added thread.agent_id column'
    END IF;
    
    -- task_session_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'task_session_id'
    ) THEN
        ALTER TABLE thread ADD COLUMN task_session_id VARCHAR(36);
        \echo '  -> Added thread.task_session_id column'
    END IF;
    
    -- status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'status'
    ) THEN
        ALTER TABLE thread ADD COLUMN status VARCHAR(20) DEFAULT 'idle';
        \echo '  -> Added thread.status column'
    END IF;
    
    -- thread_mode
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'thread_mode'
    ) THEN
        ALTER TABLE thread ADD COLUMN thread_mode VARCHAR(20) DEFAULT 'simple';
        \echo '  -> Added thread.thread_mode column'
    END IF;
END $$;

-- Thread 表索引
CREATE INDEX IF NOT EXISTS idx_thread_agent_type ON thread(agent_type);
CREATE INDEX IF NOT EXISTS idx_thread_agent_id ON thread(agent_id);
CREATE INDEX IF NOT EXISTS idx_thread_task_session_id ON thread(task_session_id);
CREATE INDEX IF NOT EXISTS idx_thread_status ON thread(status);
CREATE INDEX IF NOT EXISTS idx_thread_thread_mode ON thread(thread_mode);
\echo '  -> Thread table indexes created (if not exist)'

-- ============================================================================
-- 4. TaskSession 表扩展
-- ============================================================================
\echo 'Checking tasksession table columns...'

DO $$
BEGIN
    -- plan_summary
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasksession' AND column_name = 'plan_summary'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN plan_summary TEXT;
        \echo '  -> Added tasksession.plan_summary column'
    END IF;
    
    -- estimated_steps
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasksession' AND column_name = 'estimated_steps'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN estimated_steps INTEGER DEFAULT 0;
        \echo '  -> Added tasksession.estimated_steps column'
    END IF;
    
    -- execution_mode
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasksession' AND column_name = 'execution_mode'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN execution_mode VARCHAR(20) DEFAULT 'sequential';
        \echo '  -> Added tasksession.execution_mode column'
    END IF;

    -- status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasksession' AND column_name = 'status'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
        \echo '  -> Added tasksession.status column'
    END IF;

    -- completed_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasksession' AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN completed_at TIMESTAMP;
        \echo '  -> Added tasksession.completed_at column'
    END IF;

    -- final_response
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasksession' AND column_name = 'final_response'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN final_response TEXT;
        \echo '  -> Added tasksession.final_response column'
    END IF;
END $$;

-- ============================================================================
-- 5. SubTask 表扩展
-- ============================================================================
\echo 'Checking subtask table columns...'

DO $$
BEGIN
    -- 处理可能的列名冲突（旧表可能有 description 列）
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'description'
    ) THEN
        ALTER TABLE subtask RENAME COLUMN description TO task_description_old;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'subtask' AND column_name = 'task_description'
        ) THEN
            ALTER TABLE subtask RENAME COLUMN task_description_old TO task_description;
        ELSE
            ALTER TABLE subtask DROP COLUMN task_description_old;
        END IF;
    END IF;
    
    -- task_description
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'task_description'
    ) THEN
        ALTER TABLE subtask ADD COLUMN task_description VARCHAR(500);
        \echo '  -> Added subtask.task_description column'
    END IF;
    
    -- output_result
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'output_result'
    ) THEN
        ALTER TABLE subtask ADD COLUMN output_result JSON;
        \echo '  -> Added subtask.output_result column'
    END IF;
    
    -- started_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'started_at'
    ) THEN
        ALTER TABLE subtask ADD COLUMN started_at TIMESTAMP;
        \echo '  -> Added subtask.started_at column'
    END IF;
    
    -- completed_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE subtask ADD COLUMN completed_at TIMESTAMP;
        \echo '  -> Added subtask.completed_at column'
    END IF;
    
    -- sort_order
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE subtask ADD COLUMN sort_order INTEGER DEFAULT 0;
        \echo '  -> Added subtask.sort_order column'
    END IF;
    
    -- execution_mode
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'execution_mode'
    ) THEN
        ALTER TABLE subtask ADD COLUMN execution_mode VARCHAR(20) DEFAULT 'sequential';
        \echo '  -> Added subtask.execution_mode column'
    END IF;
    
    -- depends_on
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'depends_on'
    ) THEN
        ALTER TABLE subtask ADD COLUMN depends_on JSON;
        \echo '  -> Added subtask.depends_on column'
    END IF;
    
    -- error_message
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'error_message'
    ) THEN
        ALTER TABLE subtask ADD COLUMN error_message TEXT;
        \echo '  -> Added subtask.error_message column'
    END IF;
    
    -- duration_ms
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'duration_ms'
    ) THEN
        ALTER TABLE subtask ADD COLUMN duration_ms INTEGER;
        \echo '  -> Added subtask.duration_ms column'
    END IF;
END $$;

-- SubTask 表索引
CREATE INDEX IF NOT EXISTS idx_subtask_sort_order ON subtask(sort_order);
CREATE INDEX IF NOT EXISTS idx_subtask_status ON subtask(status);
CREATE INDEX IF NOT EXISTS idx_subtask_task_description ON subtask(task_description);
\echo '  -> SubTask table indexes created (if not exist)'

-- ============================================================================
-- 6. Artifact 表（新建）
-- ============================================================================
\echo 'Checking artifact table...'

CREATE TABLE IF NOT EXISTS artifact (
    id VARCHAR(36) PRIMARY KEY,
    sub_task_id VARCHAR(36) NOT NULL,
    type VARCHAR(20) NOT NULL,
    title VARCHAR(255),
    content TEXT NOT NULL,
    language VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (sub_task_id) REFERENCES subtask(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifact_sub_task_id ON artifact(sub_task_id);
CREATE INDEX IF NOT EXISTS idx_artifact_type ON artifact(type);
\echo '  -> Artifact table and indexes created (if not exist)'

-- ============================================================================
-- 7. 数据迁移：将现有 SubTask 的 artifacts 迁移到 Artifact 表
-- ============================================================================
\echo 'Checking data migration...'

DO $$
BEGIN
    -- 检查是否需要迁移（存在 artifacts 列且有数据）
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'subtask' AND column_name = 'artifacts'
    ) THEN
        -- 执行迁移
        INSERT INTO artifact (id, sub_task_id, type, title, content, language, sort_order, created_at)
        SELECT 
            gen_random_uuid()::text,
            s.id,
            COALESCE(a->>'type', 'text'),
            a->>'title',
            COALESCE(a->>'content', ''),
            a->>'language',
            (a->>'sort_order')::int,
            COALESCE((a->>'timestamp')::timestamp, CURRENT_TIMESTAMP)
        FROM subtask s,
        LATERAL json_array_elements(s.artifacts) a
        WHERE s.artifacts IS NOT NULL 
        AND s.artifacts != 'null'::json
        AND NOT EXISTS (
            SELECT 1 FROM artifact WHERE sub_task_id = s.id
        );
        
        \echo '  -> Data migration completed (if applicable)'
    END IF;
END $$;

-- ============================================================================
-- 8. SystemExpert 表：添加 description 字段
-- ============================================================================
\echo 'Checking systemexpert table columns...'

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'systemexpert' AND column_name = 'description'
    ) THEN
        ALTER TABLE systemexpert ADD COLUMN description VARCHAR(500);
        \echo '  -> Added systemexpert.description column'
    ELSE
        \echo '  -> Column already exists, skipping'
    END IF;
END $$;

-- 为现有专家填充默认描述（如果为空）
UPDATE systemexpert 
SET description = CASE expert_id
    WHEN 'search' THEN 'Web search expert. Uses search engines to find information, facts, and data from the internet. Good for finding current events, specific data points, or general information.'
    WHEN 'coder' THEN 'Code expert. Writes, debugs, and explains code in various programming languages. Good for software development, code review, and technical implementation.'
    WHEN 'researcher' THEN 'Research expert. Conducts deep research on topics, synthesizes information from multiple sources, and provides comprehensive analysis. Good for academic or detailed research tasks.'
    WHEN 'analyzer' THEN 'Analysis expert. Analyzes data, text, or situations to extract insights and patterns. Good for data analysis, sentiment analysis, and logical reasoning tasks.'
    WHEN 'writer' THEN 'Writing expert. Creates and edits various types of content including articles, stories, emails, and documents. Good for creative writing, copywriting, and content creation.'
    WHEN 'planner' THEN 'Planning expert. Breaks down complex tasks into step-by-step plans and organizes workflows. Good for project planning, task scheduling, and process design.'
    WHEN 'image_analyzer' THEN 'Image analysis expert. Analyzes and describes images, extracts text via OCR, and interprets visual content. Good for image understanding, visual data extraction, and image-based research.'
    ELSE 'Specialized AI expert for specific tasks.'
END
WHERE description IS NULL OR description = '';

\echo '  -> SystemExpert descriptions updated'

-- ============================================================================
-- 10. SystemExpert 表：添加 is_dynamic 字段 (v3.0 Phase 1)
-- ============================================================================
\echo 'Checking systemexpert.is_dynamic column...'

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'systemexpert' AND column_name = 'is_dynamic'
    ) THEN
        ALTER TABLE systemexpert ADD COLUMN is_dynamic BOOLEAN DEFAULT TRUE;
        \echo '  -> Added systemexpert.is_dynamic column'
    ELSE
        \echo '  -> Column already exists, skipping'
    END IF;
END $$;

-- 标记现有系统专家为内置（不可删除）
UPDATE systemexpert 
SET is_dynamic = FALSE 
WHERE expert_key IN ('search', 'coder', 'researcher', 'analyzer', 'writer', 'planner', 'image_analyzer', 'commander');

\echo '  -> SystemExpert is_dynamic flags updated'

-- ============================================================================
-- 9. 迁移记录表（用于追踪）
-- ============================================================================
\echo 'Creating migration history table...'

CREATE TABLE IF NOT EXISTS migration_history (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT TRUE
);

-- 记录本次迁移
INSERT INTO migration_history (filename, description, success)
VALUES ('apply_all_migrations.sql', 'Unified v3.0 migration script', TRUE)
ON CONFLICT (filename) DO UPDATE SET
    applied_at = CURRENT_TIMESTAMP,
    success = TRUE;

\echo 'Migration history recorded'

-- ============================================================================
-- 验证
-- ============================================================================
\echo ''
\echo '========================================'
\echo 'Migration Summary'
\echo '========================================'

SELECT 
    table_name,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name IN ('thread', 'message', 'customagent', 'tasksession', 'subtask', 'artifact')
GROUP BY table_name
ORDER BY table_name;

\echo ''
\echo 'v3.0 Unified migration completed successfully!'
