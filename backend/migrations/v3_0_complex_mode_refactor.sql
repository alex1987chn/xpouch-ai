-- ============================================================================
-- Migration: v3.0 Complex Mode Refactor
-- 复杂模式重构 - 添加 Artifact 独立表，扩展 TaskSession 和 SubTask
-- ============================================================================

-- ============================================================================
-- 1. 创建 Artifact 表（产物独立表）
-- ============================================================================

CREATE TABLE IF NOT EXISTS artifact (
    id VARCHAR(36) PRIMARY KEY,
    sub_task_id VARCHAR(36) NOT NULL,
    type VARCHAR(20) NOT NULL,  -- code | html | markdown | json | text
    title VARCHAR(255),
    content TEXT NOT NULL,
    language VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (sub_task_id) REFERENCES subtask(id) ON DELETE CASCADE
);

-- 为 Artifact 表创建索引
CREATE INDEX IF NOT EXISTS idx_artifact_sub_task_id ON artifact(sub_task_id);
CREATE INDEX IF NOT EXISTS idx_artifact_type ON artifact(type);

-- ============================================================================
-- 2. 扩展 TaskSession 表
-- ============================================================================

-- 添加新列（如果不存在）
DO $$
BEGIN
    -- 添加 plan_summary 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tasksession' AND column_name = 'plan_summary') THEN
        ALTER TABLE tasksession ADD COLUMN plan_summary TEXT;
    END IF;
    
    -- 添加 estimated_steps 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tasksession' AND column_name = 'estimated_steps') THEN
        ALTER TABLE tasksession ADD COLUMN estimated_steps INTEGER DEFAULT 0;
    END IF;
    
    -- 添加 execution_mode 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tasksession' AND column_name = 'execution_mode') THEN
        ALTER TABLE tasksession ADD COLUMN execution_mode VARCHAR(20) DEFAULT 'sequential';
    END IF;
END $$;

-- ============================================================================
-- 3. 扩展 SubTask 表
-- ============================================================================

-- 处理列名冲突：旧表可能有 'description' 列
DO $$
BEGIN
    -- 重命名 description 为 task_description（如果存在）
    IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'subtask' AND column_name = 'description') THEN
        -- 先重命名避免冲突
        ALTER TABLE subtask RENAME COLUMN description TO task_description_old;
        
        -- 如果 task_description 不存在，则使用 task_description_old
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'subtask' AND column_name = 'task_description') THEN
            ALTER TABLE subtask RENAME COLUMN task_description_old TO task_description;
        ELSE
            -- task_description 已存在，删除临时列
            ALTER TABLE subtask DROP COLUMN task_description_old;
        END IF;
    END IF;
    
    -- 添加 task_description 列（如果还不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'subtask' AND column_name = 'task_description') THEN
        ALTER TABLE subtask ADD COLUMN task_description VARCHAR(500);
    END IF;
END $$;

    -- 添加 output_result 列（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'subtask' AND column_name = 'output_result') THEN
        ALTER TABLE subtask ADD COLUMN output_result JSON;
    END IF;

    -- 添加 started_at 列（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'subtask' AND column_name = 'started_at') THEN
        ALTER TABLE subtask ADD COLUMN started_at TIMESTAMP;
    END IF;

    -- 添加 completed_at 列（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'subtask' AND column_name = 'completed_at') THEN
        ALTER TABLE subtask ADD COLUMN completed_at TIMESTAMP;
    END IF;

    -- 添加 sort_order 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'subtask' AND column_name = 'sort_order') THEN
        ALTER TABLE subtask ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;

    -- 添加 execution_mode 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'subtask' AND column_name = 'execution_mode') THEN
        ALTER TABLE subtask ADD COLUMN execution_mode VARCHAR(20) DEFAULT 'sequential';
    END IF;

    -- 添加 depends_on 列（JSON 格式存储依赖任务ID列表）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'subtask' AND column_name = 'depends_on') THEN
        ALTER TABLE subtask ADD COLUMN depends_on JSON;
    END IF;

    -- 添加 error_message 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'subtask' AND column_name = 'error_message') THEN
        ALTER TABLE subtask ADD COLUMN error_message TEXT;
    END IF;

    -- 添加 duration_ms 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'subtask' AND column_name = 'duration_ms') THEN
        ALTER TABLE subtask ADD COLUMN duration_ms INTEGER;
    END IF;
END $$;

-- 为 SubTask 表创建索引
CREATE INDEX IF NOT EXISTS idx_subtask_sort_order ON subtask(sort_order);
CREATE INDEX IF NOT EXISTS idx_subtask_status ON subtask(status);
CREATE INDEX IF NOT EXISTS idx_subtask_task_description ON subtask(task_description);

-- ============================================================================
-- 4. 数据迁移：将现有 SubTask 的 artifacts 迁移到 Artifact 表
-- ============================================================================

-- 注意：这是一个可选的数据迁移步骤
-- 如果现有数据中有 SubTask.artifacts 字段，需要将其迁移到新的 Artifact 表

-- 创建临时函数来执行迁移
CREATE OR REPLACE FUNCTION migrate_artifacts_to_table()
RETURNS void AS $$
DECLARE
    subtask_record RECORD;
    artifact_item JSON;
    new_artifact_id VARCHAR(36);
    item_index INTEGER := 0;
BEGIN
    -- 遍历所有有 artifacts 的 SubTask
    FOR subtask_record IN 
        SELECT id, artifacts 
        FROM subtask 
        WHERE artifacts IS NOT NULL 
        AND artifacts != 'null'::json
    LOOP
        -- 遍历 artifacts 数组
        FOR artifact_item IN 
            SELECT * FROM json_array_elements(subtask_record.artifacts)
        LOOP
            -- 生成新的 Artifact ID
            new_artifact_id := gen_random_uuid()::text;
            
            -- 插入到 Artifact 表
            INSERT INTO artifact (
                id, sub_task_id, type, title, content, language, sort_order, created_at
            ) VALUES (
                new_artifact_id,
                subtask_record.id,
                COALESCE((artifact_item->>'type')::varchar, 'text'),
                (artifact_item->>'title')::varchar,
                COALESCE((artifact_item->>'content')::text, ''),
                (artifact_item->>'language')::varchar,
                item_index,
                COALESCE(
                    (artifact_item->>'timestamp')::timestamp,
                    CURRENT_TIMESTAMP
                )
            );
            
            item_index := item_index + 1;
        END LOOP;
        
        item_index := 0;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 执行迁移（如果需要的话，取消下面的注释）
-- SELECT migrate_artifacts_to_table();

-- 删除临时函数
-- DROP FUNCTION IF EXISTS migrate_artifacts_to_table();

-- ============================================================================
-- 5. 验证迁移
-- ============================================================================

-- 检查表结构
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('tasksession', 'subtask', 'artifact')
ORDER BY table_name, ordinal_position;

-- 检查索引
SELECT 
    indexname,
    tablename
FROM pg_indexes
WHERE tablename IN ('tasksession', 'subtask', 'artifact')
ORDER BY tablename, indexname;
