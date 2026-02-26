# Active Context

## Current Status

### ✅ Completed (v3.3.0 - MCP Integration)
- [x] MCP Server 管理：完整的 CRUD API (backend/routers/mcp.py)
- [x] MCP Library 页面：Bauhaus 风格设计，支持增删改查
- [x] MCP 工具动态注入：LangGraph 运行时加载 MCP 工具
- [x] 连接测试：添加/编辑时自动测试 SSE 连接
- [x] 工具列表展示：展开卡片查看可用工具
- [x] 多语言支持：MCP 相关 i18n 键值 (zh/en/ja)

### ✅ Completed (v3.1.0 - Code Review Fix)
- [x] Store 层严格 Slice 隔离：移除跨 Slice 修改，遵循 SDUI 原则
- [x] Services 层 Barrel 模式：api.ts 从 217 行精简至 43 行
- [x] 前后端 ID 映射对齐：ai-assistant → ORCHESTRATOR
- [x] Session Hooks 合并：统一恢复逻辑，5s 防抖
- [x] 统一错误处理：handleSSEConnectionError 拦截所有 API 错误
- [x] 后端修复：graph.py logger、ChatRequest snake_case、时间注入提取
- [x] 专家类型同步：后端添加 designer/architect，前端添加 memorize_expert

### Previous (v3.1.0)
- [x] 架构重构：批处理 Artifact + 消除事件脑裂
- [x] 修复 Slice 污染：clearTasks 职责分离，新增 resetAll
- [x] 统一事件分发：chat.ts 分流 Chat/Task 事件
- [x] 废弃 useExpertHandler：Task 事件处理移至 eventHandlers.ts
- [x] 删除流式 Artifact 代码：只保留 addArtifact

## Current Branch
`main` - 领先 origin/main 36 commits

## Recent Commits
- `b7301c4` fix: use SQLModelSession directly for MCP tool loading
- `4dc7361` refactor(services): 统一 SSE 错误处理
- `85ab0ba` refactor: Code Review 修复 - Store 架构、Services 层、ID 映射、后端修复

## Next Steps

### Immediate (Ready to Test)
- [ ] MCP 完整流程测试：添加 Server → 启用 → 对话中使用工具
- [ ] 验证 MCP 工具优先级：专业工具优先于通用 search_web
- [ ] 验证 SSE 连接稳定性：长任务执行时的 keepalive

### Short Term
- [ ] Docker 部署验证
- [ ] 性能测试：多 MCP Server 同时加载的性能
- [ ] 错误边界处理：MCP Server 断开时的优雅降级

### Medium Term
- [ ] 支持 MCP Server 本地命令行启动 (stdio transport)
- [ ] MCP Server 模板市场
- [ ] 文档：更新 API 文档和 MCP 配置教程

## Known Issues

### Critical (Fixed)
- ✅ `get_session()` 生成器错误：已改用 `SQLModelSession(engine)`
- ✅ MultiServerMCPClient API：必须使用直接实例化，不能用 `async with`

### Watch List
- MCP Server 连接失败时的优雅降级
- 多 MCP 工具同名冲突处理
- TaskStore persist 版本：当前 v2，如 schema 变更需升级 v3

## Architecture Decisions

### MCP Tool Injection Pattern
```python
# 1. 从数据库加载启用的 MCP Server
active_servers = db.query(MCPServer).filter(MCPServer.is_active == True).all()

# 2. 构建 MCP 配置
mcp_config = {s.name: {"url": str(s.sse_url), "transport": "sse"} for s in active_servers}

# 3. 动态实例化 Client (注意：不能用 async with)
client = MultiServerMCPClient(mcp_config)
mcp_tools = await client.get_tools()

# 4. 注入 LangGraph Config
config = RunnableConfig(configurable={"mcp_tools": mcp_tools})
```

### MCP vs Built-in Tool Priority
```python
# BASE_TOOLS: 内置工具 (search_web, etc.)
# mcp_tools: 从 MCP Server 动态加载
runtime_tools = list(BASE_TOOLS) + list(mcp_tools)

# LLM 根据工具 description 自主选择
llm_with_tools = llm.bind_tools(runtime_tools)
```

### Store Layer - Strict Slice Isolation
```typescript
// ✅ 正确：Slice 只修改自己的状态
const createTaskSlice = (set, get) => ({
  setMode: (mode) => set((state) => { state.mode = mode })
})

// ❌ 错误：跨 Slice 修改（已修复）
setMode: (mode) => set((state) => {
  state.mode = mode
  state.runningTaskIds = []  // UISlice 状态！
})
```

### Services Layer - Barrel Pattern
```typescript
// api.ts - 纯 Barrel File，43 行
export * from './auth'
export * from './agent'
export * from './user'
export * from './chat'
export { handleResponse, handleSSEConnectionError } from './common'
```

## Quick Commands

```bash
# 启动开发环境
docker-compose up -d

# 查看后端日志
docker-compose logs -f backend

# 前端开发
pnpm dev

# 测试 MCP 场景
# 1. 添加 MCP Server: http://localhost:5173/library
# 2. 启用 Server (切换开关)
# 3. Simple Mode: 问 "搜索最新 AI 新闻"
# 4. 观察是否调用 MCP 工具而非内置 search_web
```

## File Locations (Frequently Used)

```
MCP 相关：
- backend/routers/mcp.py                    (MCP API)
- backend/agents/graph.py                   (工具注入)
- backend/agents/nodes/generic.py           (工具绑定)
- frontend/src/pages/library/               (Library 页面)
- frontend/src/pages/library/components/    (MCPCard, AddMCPDialog)

核心逻辑：
- frontend/src/handlers/eventHandlers.ts    (事件处理)
- frontend/src/store/slices/                (Store Slices)
- backend/agents/nodes/commander.py         (任务规划)
- backend/utils/prompt_utils.py             (时间注入)

配置：
- frontend/src/constants/systemAgents.ts    (专家配置)
- backend/constants.py                      (后端常量)
```

## MCP Configuration Example

```json
{
  "name": "fetch-server",
  "description": "Web内容获取工具",
  "sse_url": "http://localhost:3001/sse",
  "is_active": true
}
```

## Notes for Next Session

如果继续开发，优先检查：
1. MCP Server 是否正常连接 (Library 页面状态指示器)
2. 对话中是否正确调用了 MCP 工具 (后端日志)
3. 控制台是否有重复事件日志（脑裂检测）
4. TaskStore 状态是否正确（特别是切换会话时）

---
Last Updated: 2026-02-24
