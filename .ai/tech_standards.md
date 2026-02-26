# 技术规范与最佳实践

## 1. 状态管理规范

### 1.1 Zustand Slice 隔离（v3.1.0）

**架构**：
```
TaskStore (Root)
├── TaskSlice      - 核心任务数据
├── UISlice        - UI 状态
├── PlanningSlice  - 规划阶段状态
└── ArtifactSlice  - 产物管理
```

**严格隔离原则**：
- ✅ Slice 只修改自己的状态
- ❌ 禁止跨 Slice 直接修改
- ✅ 跨 Slice 操作通过 `resetAll()` 或 eventHandlers.ts

**示例**：
```typescript
// ✅ 正确：TaskSlice 只修改 task 相关状态
const createTaskSlice = (set, get) => ({
  setMode: (mode) => set((state) => { state.mode = mode })
})

// ❌ 错误：跨 Slice 修改 UISlice 状态（已移除）
setMode: (mode) => set((state) => {
  state.mode = mode
  state.runningTaskIds = []  // UISlice 状态！禁止！
})
```

### 1.2 Selectors 模式

**性能优化**：
```typescript
// ✅ 使用 Selectors 避免重渲染
export const useIsWaitingForApproval = () => 
  useTaskStore(state => state.isWaitingForApproval)

// ❌ 避免直接解构整个 Store
const { isWaitingForApproval } = useTaskStore()  // 导致不必要的重渲染
```

## 2. Services 层规范（v3.1.0）

### 2.1 Barrel Pattern

```typescript
// api.ts - 纯 Barrel File
export * from './auth'
export * from './agent'
export * from './user'
export * from './chat'
export { handleResponse, handleSSEConnectionError } from './common'
```

### 2.2 统一错误处理

**所有 fetch 请求必须使用 handleResponse**：
```typescript
// ✅ 正确
export async function getUserProfile(): Promise<UserProfile> {
  const response = await fetch(buildUrl('/user/me'), {
    headers: getHeaders()
  })
  return handleResponse<UserProfile>(response, '获取用户资料失败')
}

// ❌ 错误：手动检查 response.ok（已修复）
if (!response.ok) {
  throw new Error('Failed to fetch')
}
```

**SSE 连接使用 handleSSEConnectionError**：
```typescript
async onopen(response) {
  handleSSEConnectionError(response, 'chat.ts')
}
```

### 2.3 错误拦截能力

| 错误类型 | HTTP 状态 | 处理结果 |
|---------|-----------|----------|
| Token 失效 | 401 | `error.status = 401`，可被全局拦截 |
| 权限不足 | 403 | `error.status = 403`，可被全局拦截 |
| 服务端错误 | 500 | 携带后端 `detail` 字段 |

## 3. 事件处理规范

### 3.1 事件流向

```
SSE Events → chat.ts → eventHandlers.ts → Store → UI
```

### 3.2 事件处理器职责

- ✅ **eventHandlers.ts**：统一处理所有 Task 相关事件
- ❌ **禁止**：在组件中直接处理 Task 事件
- ✅ **允许**：Chat 事件可在组件中处理（如 message.delta）

## 4. 类型规范

### 4.1 字段命名

| 场景 | 规范 | 示例 |
|------|------|------|
| 前端本地变量 | camelCase | `conversationId` |
| 与后端对应的数据 | snake_case | `conversation_id` |
| 组件/类型 | PascalCase | `ChatMessage` |

### 4.2 前后端对齐

```typescript
// ChatRequest - 统一 snake_case
interface ChatRequest {
  message: string
  conversation_id?: string  // ✅ snake_case
  agent_id?: string         // ✅ snake_case
}
```

## 5. 会话恢复规范（v3.1.0）

### 5.1 统一恢复逻辑

```typescript
// useSessionRestore.ts 合并了两种场景：
// 1. 页面刷新（page load）
// 2. Tab 切换（visibilitychange）

const performRestore = useCallback(async () => {
  // 5s 防抖
  if (now - lastRestoreTimeRef.current < 5000) return false
  
  // SSE 活跃时跳过
  if (chatStore.isGenerating) return false
  
  // 统一恢复逻辑
  // ...
}, [])
```

## 6. 反模式清单

### ❌ 禁止的反模式

1. **跨 Slice 直接修改状态**
   ```typescript
   // ❌ 错误
   createTaskSlice: (set) => ({
     setMode: () => set(state => {
       state.runningTaskIds = []  // UISlice！
     })
   })
   ```

2. **手动检查 response.ok**
   ```typescript
   // ❌ 错误
   if (!response.ok) throw new Error('Failed')
   
   // ✅ 正确
   return handleResponse(response, 'Error message')
   ```

3. **Store 中存储派生状态**
   ```typescript
   // ❌ 错误
   const store = create(() => ({
     fullName: (state) => `${state.first} ${state.last}`
   }))
   ```

4. **重复定义函数**
   ```typescript
   // ❌ 错误：api.ts 和 auth.ts 同时定义 sendVerificationCode
   
   // ✅ 正确：api.ts 只重新导出
   export * from './auth'
   ```

## 7. 性能优化

### 7.1 渲染优化
- 使用 `React.memo` 优化 Artifact 子组件
- 使用 Selectors 模式避免 Store 重渲染
- 避免在渲染期创建新函数

### 7.2 网络优化
- SSE 连接保持（openWhenHidden: true）
- 防抖处理（会话恢复 5s 防抖）
- 统一错误处理减少重复代码
- MCP 工具缓存（TTL 5分钟）

## 8. React 19 最佳实践（v3.4.0+）

### 8.1 乐观更新 (useOptimisticUpdate)

**适用场景**：发送消息、编辑 artifact、删除会话

```typescript
// ✅ 使用乐观更新 hook
const { optimisticState, execute, isPending } = useOptimisticUpdate({
  actualState: messages,
  setActualState: setMessages
})

// 执行乐观更新
await execute(
  [...messages, optimisticMessage],  // 立即显示的乐观状态
  () => apiSendMessage(content)      // 实际 API 请求
)
// 失败时自动回滚到 originalState
```

**文件位置**：`frontend/src/hooks/useOptimisticUpdate.ts`

### 8.2 Suspense 查询 (useSuspenseQuery)

**适用场景**：会话详情、用户资料等数据获取

```typescript
// ✅ 配合 Suspense 使用
const { data, isLoading, error } = useSuspenseQuery(
  () => getConversation(id),
  { deps: [id] }
)
```

**注意**：React 19 正式发布后可替换为 `use()`

```typescript
// React 19 正式语法（未来迁移）
const conversation = use(getConversation(id))
```

### 8.3 与现有代码的对比

| 场景 | 老方式 | React 19 方式 |
|------|--------|---------------|
| 发送消息 | useEffect + 手动错误处理 | useOptimisticUpdate |
| 数据获取 | useEffect + useState | useSuspenseQuery / use() |
| 记忆化 | useMemo/useCallback | React Compiler（未来）|

## 9. MCP 技术规范

### 8.1 MultiServerMCPClient 使用规范

```python
# ✅ 正确：直接实例化（v0.2.1 必须使用此方式）
client = MultiServerMCPClient(mcp_config)
mcp_tools = await client.get_tools()

# ❌ 错误：不能使用 async with（会抛出异常）
async with MultiServerMCPClient(mcp_config) as client:
    mcp_tools = await client.get_tools()
```

### 8.2 数据库会话管理

```python
# ✅ 正确：在 FastAPI 依赖外使用 SQLModelSession
from sqlmodel import Session as SQLModelSession

async def load_mcp_tools():
    with SQLModelSession(engine) as db_session:
        servers = db_session.query(MCPServer).all()
        # ...

# ❌ 错误：get_session() 是生成器，不能用于 with
with get_session() as db:  # TypeError!
    pass
```

### 8.3 工具描述规范

```python
# MCP 工具（专业）
"description": "Search the web for current information using Google Search API"

# 内置工具（fallback）
"description": "ONLY use when no specialized search tools available. General web search..."
```

## 9. 调试指南

- 启用 `VITE_DEBUG_MODE=true` 查看详细日志
- 检查 EventHandler 日志确认事件流向
- TaskStore 日志显示 cache version 变化
- 后端日志标签：`[GenericWorker]`, `[Commander]`, `[Router]`, `[MCP]`
- MCP 连接状态查看：Library 页面指示器

---
Last Updated: 2026-02-24
