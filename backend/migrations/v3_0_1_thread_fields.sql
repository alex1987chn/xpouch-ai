-- ============================================================================
-- Migration: v3.0.1 Thread Table Fields
-- 添加 Thread 表缺失的字段
-- ============================================================================

-- ============================================================================
-- 1. 扩展 Thread 表字段
-- ============================================================================

DO $$
BEGIN
    -- 添加 agent_type 列（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'thread' AND column_name = 'agent_type') THEN
        ALTER TABLE thread ADD COLUMN agent_type VARCHAR(20) DEFAULT 'default';
    END IF;
    
    -- 添加 agent_id 列（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'thread' AND column_name = 'agent_id') THEN
        ALTER TABLE thread ADD COLUMN agent_id VARCHAR(50) DEFAULT 'sys-default-chat';
    END IF;
    
    -- 添加 task_session_id 列（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'thread' AND column_name = 'task_session_id') THEN
        ALTER TABLE thread ADD COLUMN task_session_id VARCHAR(36);
    END IF;
    
    -- 添加 status 列（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'thread' AND column_name = 'status') THEN
        ALTER TABLE thread ADD COLUMN status VARCHAR(20) DEFAULT 'idle';
    END IF;
    
    -- 添加 thread_mode 列（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'thread' AND column_name = 'thread_mode') THEN
        ALTER TABLE thread ADD COLUMN thread_mode VARCHAR(20) DEFAULT 'simple';
    END IF;
END $$;

-- ============================================================================
-- 2. 创建索引
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_thread_agent_type ON thread(agent_type);
CREATE INDEX IF NOT EXISTS idx_thread_agent_id ON thread(agent_id);
CREATE INDEX IF NOT EXISTS idx_thread_task_session_id ON thread(task_session_id);
CREATE INDEX IF NOT EXISTS idx_thread_status ON thread(status);
CREATE INDEX IF NOT EXISTS idx_thread_thread_mode ON thread(thread_mode);

-- ============================================================================
-- 3. CustomAgent 表：添加 is_default 字段（如果不存在）
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customagent' AND column_name = 'is_default') THEN
        ALTER TABLE customagent ADD COLUMN is_default BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customagent_is_default ON customagent(is_default);

-- ============================================================================
-- 4. 验证迁移
-- ============================================================================

SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('thread', 'customagent')
ORDER BY table_name, ordinal_position;
