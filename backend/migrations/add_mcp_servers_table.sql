-- ============================================================================
-- MCP 服务器配置表迁移脚本
-- 
-- 用途：创建 mcp_servers 表，用于存储外部 MCP SSE 服务器配置
-- 执行时机：在部署 MCP 功能前运行此脚本
-- ============================================================================

-- 创建 MCP 服务器表
CREATE TABLE IF NOT EXISTS mcp_servers (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    sse_url VARCHAR(500) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    icon VARCHAR(255),
    connection_status VARCHAR(20) DEFAULT 'unknown',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers(name);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_created_at ON mcp_servers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_is_active ON mcp_servers(is_active);

-- 添加注释
COMMENT ON TABLE mcp_servers IS 'MCP 服务器配置表，存储外部 SSE 服务器连接信息';
COMMENT ON COLUMN mcp_servers.id IS '唯一标识符 (UUID)';
COMMENT ON COLUMN mcp_servers.name IS '显示名称';
COMMENT ON COLUMN mcp_servers.description IS '功能描述';
COMMENT ON COLUMN mcp_servers.sse_url IS 'SSE 连接地址';
COMMENT ON COLUMN mcp_servers.is_active IS '是否启用';
COMMENT ON COLUMN mcp_servers.icon IS '图标 URL 或名称';
COMMENT ON COLUMN mcp_servers.connection_status IS '连接状态：unknown/connected/error';
COMMENT ON COLUMN mcp_servers.created_at IS '创建时间';
COMMENT ON COLUMN mcp_servers.updated_at IS '最后更新时间';

-- ============================================================================
-- 验证
-- ============================================================================

-- 检查表是否创建成功
SELECT 
    'mcp_servers table created successfully' as status,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_name = 'mcp_servers';
