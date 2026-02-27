-- ============================================================================
-- Migration: Add transport column to mcp_servers table
-- 为 MCP 服务器表添加传输协议字段
--
-- Version: v3.2.0
-- Date: 2026-02-27
--
-- 执行方式:
--   psql -h localhost -U xpouch_admin -d xpouch_ai -f add_mcp_transport_column.sql
--
-- 或者在 Docker 中执行:
--   docker exec -i xpouch-db psql -U xpouch_admin -d xpouch_ai -f /docker-entrypoint-initdb.d/add_mcp_transport_column.sql
-- ============================================================================

DO $$ BEGIN RAISE NOTICE 'Adding transport column to mcp_servers...'; END $$;

-- 添加 transport 字段（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mcp_servers' AND column_name = 'transport'
    ) THEN
        ALTER TABLE mcp_servers ADD COLUMN transport VARCHAR(20) NOT NULL DEFAULT 'sse';
        RAISE NOTICE '  -> Added mcp_servers.transport column with default value "sse"';
    ELSE
        RAISE NOTICE '  -> Column already exists, skipping';
    END IF;
END $$;

-- 更新现有记录的 transport 字段（如果为 NULL）
UPDATE mcp_servers 
SET transport = 'sse' 
WHERE transport IS NULL;

-- 添加注释
COMMENT ON COLUMN mcp_servers.transport IS 'Transport protocol: sse (Server-Sent Events) or streamable_http';

-- 记录迁移历史
INSERT INTO migration_history (filename, description, success)
VALUES ('add_mcp_transport_column.sql', 'Add transport column to mcp_servers for streamable_http support', TRUE)
ON CONFLICT (filename) DO UPDATE SET
    applied_at = CURRENT_TIMESTAMP,
    success = TRUE;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Transport column added successfully!';
    RAISE NOTICE 'Supported protocols: sse, streamable_http';
END $$;
