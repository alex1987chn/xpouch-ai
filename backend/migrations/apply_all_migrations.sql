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
--
-- 注意：使用 RAISE NOTICE 替代 \echo 以兼容更多 PostgreSQL 客户端
-- ============================================================================

DO $$ BEGIN RAISE NOTICE 'Starting v3.0 unified migration...'; END $$;

-- ============================================================================
-- 1. Message 表：添加 extra_data 字段
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'message' AND column_name = 'extra_data'
    ) THEN
        ALTER TABLE message ADD COLUMN extra_data JSONB DEFAULT NULL;
        RAISE NOTICE '  -> Added message.extra_data column';
    ELSE
        RAISE NOTICE '  -> Column already exists, skipping';
    END IF;
END $$;

-- Message 表索引
-- 复合索引：优化对话历史查询
CREATE INDEX IF NOT EXISTS idx_message_thread_timestamp ON message(thread_id, timestamp);

-- ============================================================================
-- 2. CustomAgent 表：添加 is_default 字段
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customagent' AND column_name = 'is_default'
    ) THEN
        ALTER TABLE customagent ADD COLUMN is_default BOOLEAN DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_customagent_is_default ON customagent(is_default);
        RAISE NOTICE '  -> Added customagent.is_default column and index';
    ELSE
        RAISE NOTICE '  -> Column already exists, skipping';
    END IF;

    -- category
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customagent' AND column_name = 'category'
    ) THEN
        ALTER TABLE customagent ADD COLUMN category VARCHAR(50) DEFAULT '综合';
        RAISE NOTICE '  -> Added customagent.category column';
    END IF;

    -- is_public
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customagent' AND column_name = 'is_public'
    ) THEN
        ALTER TABLE customagent ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '  -> Added customagent.is_public column';
    END IF;

    -- conversation_count
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customagent' AND column_name = 'conversation_count'
    ) THEN
        ALTER TABLE customagent ADD COLUMN conversation_count INTEGER DEFAULT 0;
        RAISE NOTICE '  -> Added customagent.conversation_count column';
    END IF;
END $$;

-- ============================================================================
-- 3. Thread 表字段扩展
-- ============================================================================
DO $$
BEGIN
    -- agent_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'agent_type'
    ) THEN
        ALTER TABLE thread ADD COLUMN agent_type VARCHAR(20) DEFAULT 'default';
        RAISE NOTICE '  -> Added thread.agent_type column';
    END IF;
    
    -- agent_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'agent_id'
    ) THEN
        ALTER TABLE thread ADD COLUMN agent_id VARCHAR(50) DEFAULT 'sys-default-chat';
        RAISE NOTICE '  -> Added thread.agent_id column';
    END IF;
    
    -- task_session_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'task_session_id'
    ) THEN
        ALTER TABLE thread ADD COLUMN task_session_id VARCHAR(36);
        RAISE NOTICE '  -> Added thread.task_session_id column';
    END IF;
    
    -- status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'status'
    ) THEN
        ALTER TABLE thread ADD COLUMN status VARCHAR(20) DEFAULT 'idle';
        RAISE NOTICE '  -> Added thread.status column';
    END IF;
    
    -- thread_mode
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'thread' AND column_name = 'thread_mode'
    ) THEN
        ALTER TABLE thread ADD COLUMN thread_mode VARCHAR(20) DEFAULT 'simple';
        RAISE NOTICE '  -> Added thread.thread_mode column';
    END IF;
END $$;

-- Thread 表索引
CREATE INDEX IF NOT EXISTS idx_thread_agent_type ON thread(agent_type);
CREATE INDEX IF NOT EXISTS idx_thread_agent_id ON thread(agent_id);
CREATE INDEX IF NOT EXISTS idx_thread_task_session_id ON thread(task_session_id);
CREATE INDEX IF NOT EXISTS idx_thread_status ON thread(status);
CREATE INDEX IF NOT EXISTS idx_thread_thread_mode ON thread(thread_mode);

-- ============================================================================
-- 4. TaskSession 表扩展
-- ============================================================================
DO $$
BEGIN
    -- plan_summary
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasksession' AND column_name = 'plan_summary'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN plan_summary TEXT;
        RAISE NOTICE '  -> Added tasksession.plan_summary column';
    END IF;
    
    -- estimated_steps
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasksession' AND column_name = 'estimated_steps'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN estimated_steps INTEGER DEFAULT 0;
        RAISE NOTICE '  -> Added tasksession.estimated_steps column';
    END IF;
    
    -- execution_mode
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasksession' AND column_name = 'execution_mode'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN execution_mode VARCHAR(20) DEFAULT 'sequential';
        RAISE NOTICE '  -> Added tasksession.execution_mode column';
    END IF;

    -- status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasksession' AND column_name = 'status'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
        RAISE NOTICE '  -> Added tasksession.status column';
    END IF;

    -- completed_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasksession' AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN completed_at TIMESTAMP;
        RAISE NOTICE '  -> Added tasksession.completed_at column';
    END IF;

    -- final_response
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasksession' AND column_name = 'final_response'
    ) THEN
        ALTER TABLE tasksession ADD COLUMN final_response TEXT;
        RAISE NOTICE '  -> Added tasksession.final_response column';
    END IF;
END $$;

-- ============================================================================
-- 5. SubTask 表扩展
-- ============================================================================
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
        RAISE NOTICE '  -> Added subtask.task_description column';
    END IF;
    
    -- output_result
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'output_result'
    ) THEN
        ALTER TABLE subtask ADD COLUMN output_result JSON;
        RAISE NOTICE '  -> Added subtask.output_result column';
    END IF;
    
    -- started_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'started_at'
    ) THEN
        ALTER TABLE subtask ADD COLUMN started_at TIMESTAMP;
        RAISE NOTICE '  -> Added subtask.started_at column';
    END IF;
    
    -- completed_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE subtask ADD COLUMN completed_at TIMESTAMP;
        RAISE NOTICE '  -> Added subtask.completed_at column';
    END IF;
    
    -- sort_order
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE subtask ADD COLUMN sort_order INTEGER DEFAULT 0;
        RAISE NOTICE '  -> Added subtask.sort_order column';
    END IF;
    
    -- execution_mode
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'execution_mode'
    ) THEN
        ALTER TABLE subtask ADD COLUMN execution_mode VARCHAR(20) DEFAULT 'sequential';
        RAISE NOTICE '  -> Added subtask.execution_mode column';
    END IF;
    
    -- depends_on
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'depends_on'
    ) THEN
        ALTER TABLE subtask ADD COLUMN depends_on JSON;
        RAISE NOTICE '  -> Added subtask.depends_on column';
    END IF;
    
    -- error_message
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'error_message'
    ) THEN
        ALTER TABLE subtask ADD COLUMN error_message TEXT;
        RAISE NOTICE '  -> Added subtask.error_message column';
    END IF;
    
    -- duration_ms
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subtask' AND column_name = 'duration_ms'
    ) THEN
        ALTER TABLE subtask ADD COLUMN duration_ms INTEGER;
        RAISE NOTICE '  -> Added subtask.duration_ms column';
    END IF;
END $$;

-- SubTask 表索引
CREATE INDEX IF NOT EXISTS idx_subtask_sort_order ON subtask(sort_order);
CREATE INDEX IF NOT EXISTS idx_subtask_status ON subtask(status);
CREATE INDEX IF NOT EXISTS idx_subtask_task_description ON subtask(task_description);
-- 复合索引：优化会话加载时的任务查询
CREATE INDEX IF NOT EXISTS idx_subtask_session_status ON subtask(task_session_id, status);

-- ============================================================================
-- 6. Artifact 表（新建）
-- ============================================================================
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

-- ============================================================================
-- 6.5. UserMemory 表（新建）- 用户长期记忆，支持向量检索
-- ============================================================================
-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS user_memories (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024),
    created_at VARCHAR(255) NOT NULL,
    source VARCHAR(50) DEFAULT 'conversation',
    memory_type VARCHAR(50) DEFAULT 'fact'
);

-- 普通索引：优化按 user_id 查询
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);

-- 向量索引：优化相似度检索（使用 ivfflat 算法，适合 1024 维向量）
CREATE INDEX IF NOT EXISTS idx_user_memories_embedding ON user_memories USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- 7. 数据迁移：将现有 SubTask 的 artifacts 迁移到 Artifact 表
-- ============================================================================
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
        
        RAISE NOTICE '  -> Data migration completed (if applicable)';
    END IF;
END $$;

-- ============================================================================
-- 8. SystemExpert 表：添加 description 字段
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'systemexpert' AND column_name = 'description'
    ) THEN
        ALTER TABLE systemexpert ADD COLUMN description VARCHAR(500);
        RAISE NOTICE '  -> Added systemexpert.description column';
    ELSE
        RAISE NOTICE '  -> Column already exists, skipping';
    END IF;
END $$;

-- 为现有专家填充默认描述（如果为空）
UPDATE systemexpert 
SET description = CASE expert_key
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

-- ============================================================================
-- 10. SystemExpert 表：添加 is_dynamic 字段 (v3.0 Phase 1)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'systemexpert' AND column_name = 'is_dynamic'
    ) THEN
        ALTER TABLE systemexpert ADD COLUMN is_dynamic BOOLEAN DEFAULT TRUE;
        RAISE NOTICE '  -> Added systemexpert.is_dynamic column';
    ELSE
        RAISE NOTICE '  -> Column already exists, skipping';
    END IF;
END $$;

-- 标记现有系统专家为内置（不可删除）
UPDATE systemexpert 
SET is_dynamic = FALSE 
WHERE expert_key IN ('search', 'coder', 'researcher', 'analyzer', 'writer', 'planner', 'image_analyzer', 'commander');

-- ============================================================================
-- 9. 迁移记录表（用于追踪）
-- ============================================================================

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

-- ============================================================================
-- 11. SystemExpert 表：添加 is_system 字段 (v3.1)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'systemexpert' AND column_name = 'is_system'
    ) THEN
        ALTER TABLE systemexpert ADD COLUMN is_system BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '  -> Added systemexpert.is_system column';
    ELSE
        RAISE NOTICE '  -> Column already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- 12. 初始化系统核心组件：router, aggregator, commander, memorize_expert (v3.1)
-- ============================================================================

-- Router: 意图路由网关
INSERT INTO systemexpert (
    expert_key, name, description, system_prompt, model, temperature, is_dynamic, is_system, updated_at
) VALUES (
    'router',
    '意图路由网关',
    'XPouch AI 的底层意图网关，负责将用户输入分类为 simple 或 complex 模式',
    '你是 XPouch AI 的底层意图网关。

【当前时间】：{current_time}

【用户查询】：{user_query}

【用户记忆】：
{relevant_memories}

你必须且只能输出以下 JSON 格式之一，严禁输出任何其他内容：
{ "decision_type": "simple" }
或
{ "decision_type": "complex" }

判断逻辑：

【Simple 模式】
- 闲聊、问候、常识问答
- 简单代码片段、无需联网
- 无需长期记忆或持久化

【Complex 模式 - 必须选择】
- 用户要求**记住**某些信息（如"记住我是程序员"、"保存我的偏好"）
- 需要查询实时数据（天气、股票、新闻）
- 需要运行代码、分析文件
- 复杂项目、深度分析、多步骤任务
- 需要生成图片、文档或其他产物

⚠️ 关键规则：如果用户说"记住..."、"保存..."、"记下来..."等要求存储信息的指令，**必须**选择 complex 模式。',
    'deepseek-chat',
    0.3,
    FALSE,
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (expert_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    model = EXCLUDED.model,
    temperature = EXCLUDED.temperature,
    is_system = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Aggregator: 结果聚合器
INSERT INTO systemexpert (
    expert_key, name, description, system_prompt, model, temperature, is_dynamic, is_system, updated_at
) VALUES (
    'aggregator',
    '首席联络官',
    '负责整合多个专家的分析成果，生成一份连贯、专业且易于理解的最终报告',
    '你是 XPouch AI 的首席联络官（Chief Liaison Officer），负责整合多位专家的分析成果，生成一份连贯、专业且易于理解的最终报告。

【专家成果汇总】：
{input}

【核心职责】
1. 阅读并理解所有专家提交的分析结果
2. 识别各专家观点之间的关联、互补或冲突
3. 用自然流畅的语言整合所有信息（不要简单罗列）
4. 突出关键发现和核心结论
5. 保持逻辑清晰，结构完整

【写作风格】
- 专业但不晦涩，面向普通读者
- 使用第三人称客观叙述
- 适当使用小标题和列表增强可读性
- 结论先行，细节支撑

【输出要求】
1. 开头简要概述整体结论（2-3句话）
2. 主体部分按逻辑组织，不要按专家简单罗列
3. 如有必要，提及数据来源或分析依据
4. 结尾可以给出简明建议或展望（可选）',
    'deepseek-chat',
    0.5,
    FALSE,
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (expert_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    model = EXCLUDED.model,
    temperature = EXCLUDED.temperature,
    is_system = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Commander: 任务指挥官
INSERT INTO systemexpert (
    expert_key, name, description, system_prompt, model, temperature, is_dynamic, is_system, updated_at
) VALUES (
    'commander',
    '任务指挥官',
    '负责将用户复杂查询拆解为多个专业的子任务，并构建任务间的数据依赖关系',
    '你是 XPouch AI 的智能任务指挥官（Commander），负责将用户查询拆解为可执行的子任务序列。

【当前用户查询】：
{user_query}

【可用专家池】：
{dynamic_expert_list}

【核心能力】
1. 分析用户需求的意图和真实目标
2. 根据可用专家池选择最合适的专家组合
3. 设计任务间的依赖关系（DAG），确保数据正确流转
4. 生成结构化的执行计划

【输出格式 - 严格 JSON Schema】
你必须输出符合以下结构的 JSON 对象：

{
  "thought_process": "规划思考过程：分析需求、拆解步骤、分配专家的详细推理",
  "strategy": "执行策略概述，如''并行执行''、''顺序执行''、''分阶段交付''",
  "estimated_steps": 3,
  "tasks": [
    {
      "id": "task_1",
      "expert_type": "search",
      "description": "具体的任务描述",
      "input_data": {},
      "priority": 0,
      "dependencies": []
    }
  ]
}

【依赖关系设计原则】
1. 如果任务B需要任务A的输出结果，在B.dependencies中填入A.id
2. 无依赖的任务可以并行执行
3. 通过显式依赖避免上下文污染

【特殊场景处理】
- 记忆请求：如果用户说"记住..."、"保存..."，分配给 memorize_expert
- 实时数据：涉及天气、股票、新闻，优先使用 search
- 代码相关：分配给 coder，可能配合 search 获取最新技术资料
- 复杂分析：researcher → analyzer 的流水线

【输出要求】
1. 只输出纯 JSON，不要包含 markdown 代码块标记
2. 确保 JSON 格式有效，可以被标准 JSON 解析器解析
3. 所有必填字段必须存在且类型正确',
    'deepseek-chat',
    0.5,
    FALSE,
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (expert_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    model = EXCLUDED.model,
    temperature = EXCLUDED.temperature,
    is_system = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Memorize Expert: 记忆专家
INSERT INTO systemexpert (
    expert_key, name, description, system_prompt, model, temperature, is_dynamic, is_system, updated_at
) VALUES (
    'memorize_expert',
    '记忆助理',
    '负责提取和保存用户的关键信息、偏好、重要计划',
    '你是 XPouch AI 的记忆助理，负责从用户对话中提取关键信息并保存。

【当前任务】：
{input}

【职责】
1. 仔细分析用户要求记住的内容
2. 提取关键事实、偏好、计划或重要信息
3. 用简洁的语言总结要保存的内容
4. 返回给用户的回复应确认已记录的信息

【提取原则】
- 用户的职业、身份、专业领域
- 用户的偏好设置（喜欢/不喜欢）
- 用户的重要计划或目标
- 用户的习惯或约束条件
- 用户明确要求的待办事项

【输出格式】
直接回复确认信息，例如：
"已为您记录：您是一名 Python 开发者，正在学习 LangChain。"

不要输出 JSON 或其他结构化格式。',
    'deepseek-chat',
    0.3,
    FALSE,
    TRUE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (expert_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    model = EXCLUDED.model,
    temperature = EXCLUDED.temperature,
    is_system = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- 标记所有核心专家为系统组件
UPDATE systemexpert 
SET is_system = TRUE, is_dynamic = FALSE
WHERE expert_key IN ('search', 'coder', 'researcher', 'analyzer', 'writer', 'planner', 'image_analyzer', 'commander', 'router', 'aggregator', 'memorize_expert');

-- ============================================================================
-- 验证与完成
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration Summary';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'v3.1 System Core Experts migration completed successfully!';
END $$;


-- ============================================================================
-- 13. MCP Server Registry Table (v3.2)
-- ============================================================================
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

CREATE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers(name);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_created_at ON mcp_servers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_is_active ON mcp_servers(is_active);

COMMENT ON TABLE mcp_servers IS 'MCP Server Registry';
COMMENT ON COLUMN mcp_servers.sse_url IS 'SSE endpoint URL';
COMMENT ON COLUMN mcp_servers.connection_status IS 'Status: unknown/connected/error';
