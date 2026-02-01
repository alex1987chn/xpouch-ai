# XPouch AI v3.0 复杂模式重构总结

## 重构目标
将复杂模式从"后置持久化"重构为"事件源持久化"，解决消息和 Artifact 持久化不可靠的问题。

## 核心架构变化

### 1. 数据库模型 (Phase 1)

#### 新增表
- **Artifact 表**: 独立存储产物，支持多产物
  - `id`, `sub_task_id`, `type`, `title`, `content`, `language`, `sort_order`

#### 扩展表
- **TaskSession**: 新增 `plan_summary`, `estimated_steps`, `execution_mode`
- **SubTask**: 新增 `sort_order`, `execution_mode`, `depends_on`, `error_message`, `duration_ms`

### 2. SSE 事件协议 (Phase 2)

#### 新事件类型
```typescript
type EventType = 
  | 'plan.created'       // Planner 生成计划
  | 'task.started'       // 专家开始执行
  | 'task.completed'     // 专家完成
  | 'task.failed'        // 专家失败
  | 'artifact.generated' // 产物生成
  | 'message.delta'      // 最终回复流式块
  | 'message.done'       // 最终回复完成
```

#### 事件格式
```json
{
  "id": "evt_uuid",
  "timestamp": "2024-01-01T00:00:00Z",
  "type": "plan.created",
  "data": { ... }
}
```

### 3. LangGraph 节点改造 (Phase 3)

#### Planner Node
- LLM 生成计划后立即持久化到数据库
- 创建 TaskSession + SubTasks
- 发送 `plan.created` 事件

#### Expert Dispatcher
- 专家执行前: 更新状态为 `running`，发送 `task.started`
- 专家完成后: 保存 Artifacts，发送 `task.completed` + `artifact.generated`
- 专家失败: 发送 `task.failed`

#### Aggregator
- 流式输出最终回复
- 发送 `message.delta` + `message.done`
- 更新 TaskSession 状态为 `completed`

### 4. 前端状态管理 (Phase 4)

#### taskStore
- 使用 `Map<string, Task>` 存储任务（O(1) 更新）
- 支持持久化到 localStorage
- 提供计算属性：`pendingTasks`, `runningTask`, `completedTasks`, `progress`

#### 事件处理器
- `EventHandler` 类统一处理 SSE 事件
- 去重机制（基于 event id）
- 类型守卫函数确保类型安全

#### 组件
- `ExpertTaskList`: 工业风格任务列表
- `OrchestratorPanelV2`: 集成任务列表和产物查看器

### 5. 持久化与恢复 (Phase 5)

#### 本地缓存
- Zustand 中间件自动持久化到 localStorage
- 页面刷新后自动恢复状态

#### 服务端同步
- 恢复时先从 localStorage 读取（瞬间响应）
- 再从服务端获取最新状态（校准）

## 文件变更清单

### 后端
```
backend/models.py                          # 数据库模型扩展
backend/crud/task_session.py               # 新增 CRUD 层
backend/types/events.py                    # 新增事件类型定义
backend/utils/event_generator.py           # 新增事件生成器
backend/agents/graph.py                    # LangGraph 节点改造
backend/routers/chat.py                    # SSE 流改造
backend/migrations/v3_0_complex_mode_refactor.sql  # 数据库迁移
```

### 前端
```
frontend/src/types/events.ts               # 新增事件类型定义
frontend/src/store/taskStore.ts            # 新增任务状态管理
frontend/src/store/middleware/persist.ts   # 新增持久化中间件
frontend/src/handlers/eventHandlers.ts     # 新增事件处理器
frontend/src/hooks/useSessionRestore.ts    # 新增会话恢复 Hook
frontend/src/services/chat.ts              # SSE 处理改造
frontend/src/components/chat/ExpertTaskList/index.tsx      # 新增任务列表组件
frontend/src/components/layout/OrchestratorPanelV2.tsx     # 新增编排器面板
```

## 部署步骤

### 1. 数据库迁移
```bash
cd backend
# 使用 psql 执行迁移脚本
psql -d your_database -f migrations/v3_0_complex_mode_refactor.sql
```

### 2. 后端部署
```bash
cd backend
# 安装依赖（如果有新增）
uv sync

# 重启服务
uv run main.py
```

### 3. 前端部署
```bash
cd frontend
# 安装依赖（如果有新增）
pnpm install

# 构建
pnpm build
```

## 测试验证

### 功能测试
1. **简单模式**: 发送普通消息，验证是否正常回复
2. **复杂模式**: 发送复杂任务（如"写一个 Python 爬虫"），验证：
   - 任务计划是否正确显示
   - 专家是否按顺序执行
   - 产物是否正确展示
   - 最终回复是否流式输出

### 持久化测试
1. 开始一个复杂任务
2. 刷新页面
3. 验证状态是否正确恢复

### 兼容性测试
1. 旧的历史记录是否能正常加载
2. 新旧事件格式是否能共存

## 回滚方案

如果需要回滚：

1. 代码回滚到上一个版本
2. 数据库回滚（需要提前备份）

```sql
-- 删除 Artifact 表
DROP TABLE IF EXISTS artifact;

-- 删除新增列（可选）
ALTER TABLE tasksession DROP COLUMN IF EXISTS plan_summary;
ALTER TABLE tasksession DROP COLUMN IF EXISTS estimated_steps;
ALTER TABLE tasksession DROP COLUMN IF EXISTS execution_mode;

ALTER TABLE subtask DROP COLUMN IF EXISTS sort_order;
ALTER TABLE subtask DROP COLUMN IF EXISTS execution_mode;
ALTER TABLE subtask DROP COLUMN IF EXISTS depends_on;
ALTER TABLE subtask DROP COLUMN IF EXISTS error_message;
ALTER TABLE subtask DROP COLUMN IF EXISTS duration_ms;
```

## 后续优化方向

1. **并行执行**: 当前为串行执行，可扩展为并行
2. **依赖图**: 支持任务间的依赖关系
3. **重试机制**: 失败任务支持自动/手动重试
4. **产物版本**: 支持产物历史版本
5. **性能优化**: 大数据量下的渲染优化

## 注意事项

1. **事件顺序**: 确保事件按正确顺序发送（plan.created → task.started → task.completed → message.delta）
2. **状态一致性**: 数据库状态和前端状态需要保持一致
3. **错误处理**: 任何节点失败都要发送 task.failed 事件
4. **资源清理**: 会话结束后清理 eventHandler 的已处理事件记录

## 联系

如有问题，请联系开发团队。
