# CHANGELOG

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Run Ledger 事件账本（2026-03-08）

**新增功能**：
- 新增 `RunEvent` append-only 事件账本模型，追踪 AgentRun 完整生命周期
- 新增 16 种 `RunEventType` 事件类型
- 新增 `GET /api/runs/{run_id}/timeline` API：运行实例事件时间线
- 新增 `GET /api/runs/thread/{thread_id}/timeline` API：线程事件时间线

**接入节点**：
- `run_created`：创建 AgentRun 时
- `run_started`：运行正式进入执行态时
- `router_decided`：Router 决策完成时
- `plan_created` / `plan_updated`：计划创建与用户修改后恢复
- `hitl_interrupted` / `hitl_resumed` / `hitl_rejected`：HITL 中断/恢复/拒绝
- `task_started` / `task_completed` / `task_failed`：任务执行生命周期
- `artifact_generated`：产物落库
- `run_completed` / `run_failed` / `run_cancelled` / `run_timed_out`：运行终态

**修复与加固**：
- 修正 `run_event` 迁移实现，改回标准 Alembic / PostgreSQL ENUM 方案
- 时间线 API 增加 `run` / `thread` 归属校验，避免越权读取其他用户的运行账本

**数据迁移**：
- `20260308_150000_add_run_event_ledger.py`

### Regression Assets 与单线程活跃 Run 约束（2026-03-08）

**Regression Assets**：
- 新增 `backend/evals/assets/regression_cases.json`
- 新增 `backend/evals/regression_runner.py`
- 新增 `backend/tests/test_regression_runner.py`
- 当前覆盖 Router、Commander 输出结构、run timeline 顺序

**单线程活跃 Run 约束**：
- 新增后端线程级活跃 run 冲突拦截
- `/api/chat` 与 `InvokeService` 已拒绝同线程新的活跃 run
- 前端对 409 冲突增加明确提示，不再只显示泛化错误

### Tool Governance 与 Selective Approval（2026-03-08）

**治理层**：
- 新增 `backend/agents/tool_policy.py`
- 新增统一 `risk_tier` 与 `policy action`
- `generic` 绑定工具前会过滤不应暴露给当前 expert 的工具
- `tool_runtime` 执行前会再次做策略校验，作为最后一道强制保护

**第一版策略**：
- `memorize_expert` 已被禁止主动调用 `search_web / read_webpage`
- 高风险 / 副作用 MCP 工具会被要求额外审批，并在第一版中直接阻止执行
- `/api/tools/available` 已返回 `risk_tier / approval_required / policy_note`

### 运行时重构封板（2026-03-08）

**运行时语义收口**：
- 明确并稳定 `Thread / AgentRun / ExecutionPlan` 三层模型
- `TaskSession` 退出现行主语义，复杂任务统一使用 `ExecutionPlan`
- `Thread.status` 降级为展示缓存，前端恢复优先依据 `latest_run.status`

**HITL / Resume / Cancel**：
- `POST /api/chat/resume` 已围绕 `run_id` 收口
- Commander 创建 `ExecutionPlan` 时已绑定当前 `run_id`
- 修复 HITL 确认后 `ExecutionPlan 未找到` 的 404 问题
- 修复恢复失败后 inflight 锁未释放导致的连续 409 问题
- 前端对 resume 的 4xx 错误不再无限自动重试
- `POST /api/runs/{run_id}/cancel` 已进入主链，停止生成不再只是本地 abort

**运行控制面（第一层）**：
- 新增 `AgentRun.deadline_at`
- 新增 `RUN_TIMED_OUT` 错误码
- 新增图循环预算保护 `RUN_MAX_GRAPH_LOOPS`
- 运行中持续刷新 `current_node / last_heartbeat_at`
- 后台清理任务会回收超时运行

**复杂模式稳定性**：
- 路由层为实时路线、距离、怎么去等场景增加确定性 complex 兜底
- 修复复杂模式 artifact 恢复展示
- 复杂模式面板恢复时优先选中有 artifact 的任务
- 修复删除线程 / 删除自定义智能体的关联清理问题
- 新增迁移修复 PostgreSQL enum label drift

**文档更新**：
- 重写 `.ai/langgraph_workflow.md`
- 更新 `.ai/active_context.md`、`.ai/data_schema.md`、`.ai/system_architecture.md`
- 更新 `code review` 目录下的运行时总结与产品化评估
- 重写 `README.md`，对齐当前开源定位与启动方式

### 主题系统语义化改造（2026-03-06）

**架构升级**：
- 新增 Glass/Kyoto 两主题，共支持 Light/Dark/Glass/Kyoto 四主题
- 引入细化层级变量：
  - 阴影三级：`shadow-button-sm` / `shadow-button` / `shadow-button-lg`
  - 位移三级：`transform-button-sm-hover` / `transform-button-hover` / `transform-button-lg-hover`
- 新增字体变量：`--font-sans`, `--font-mono`（主题自适应）

**组件改造**：
- 30+ 组件语义化改造：`ui/*`, `admin/*`, `settings/*`, `bauhaus/*`, `chat/*`
- 统一边框类：`border-2 border-border-default`
- 统一阴影类：`shadow-theme-card`, `shadow-theme-button-lg` 等
- 统一位移类：`[transform:var(--transform-button-hover)]`

**主题风格**：
| 主题 | 边框 | 阴影 | 位移 | 字体 |
|------|------|------|------|------|
| Bauhaus (Light/Dark) | 2px 粗硬边 | 硬阴影 4-8px | 大幅度 2-4px | Space Mono |
| Glass | 1px 细边 | 柔和扩散 4-20px | 微浮动 1-2px | DM Sans |
| Kyoto | 1px 细边 | 极淡 1-4px | 极微 0.5-1px | Noto Serif JP |

**新增文档**：
- `THEME_GUIDE.md`：完整的主题开发指南

### 代码审查修复（2026-03-06）

**P0 关键问题修复**：
- `utils/db.py`：将静默异常 `except Exception: pass` 改为 `logger.warning()`，记录异常信息
- `services/chat/session_service.py`：消除 N+1 查询，使用子查询一次性获取所有线程的最后消息

**P1 重要问题修复**：
- `main.py`：使用 `asyncio.to_thread` 包装同步专家初始化，避免阻塞事件循环
- `main.py`：删除 `/api/v1` 前缀，统一 API 路由风格
- `config.py`：数据库连接池参数可配置化（`DB_POOL_MIN_SIZE`, `DB_POOL_MAX_SIZE`, `DB_POOL_TIMEOUT` 等）
- 工具链简化：删除 Husky 和 lint-staged，统一使用 pre-commit

**P2 性能优化**：
- Ruff：添加 SIM 规则（代码简化建议）
- Ruff：简化 6 处嵌套 if/with 语句（SIM102/SIM117）
- 前端：清理 `prismjs` 冗余依赖，减少 ~100KB 包体积
- 前端：清理 3 处 `console.error`，统一使用 logger
- Pre-commit：修复 ESLint hook 配置，支持 PowerShell 环境

**文档完善**：
- `CONTRIBUTING.md`：添加 pre-commit hooks 安装说明

### HITL 状态持久化（2026-03-06）

**方案1实施：添加 `waiting_for_approval` 状态**

- 新增 `TaskStatus.WAITING_FOR_APPROVAL` 枚举值（`backend/models/enums.py`）
- 数据库迁移：`20260306_120000_add_waiting_for_approval_status.py`
- 后端逻辑：
  - `stream_service.py`：HITL 中断时更新 `TaskSession.status = 'waiting_for_approval'`
  - `recovery_service.py`：用户批准后更新 `status = 'running'`
- 前端恢复：
  - `useSessionRestore.ts`：刷新页面后恢复 HITL 弹窗状态和 `pendingPlan`

**状态流转**：
```
pending → waiting_for_approval → running → completed
                                ↘ cancelled
```

**问题解决**：刷新页面后 HITL 弹窗状态丢失 → 现在正确恢复

### 前端架构优化（2026-03-06）

**会话加载逻辑重构**：
- 统一使用 `useSessionRestore` 处理所有会话恢复场景
- 删除冗余的 `loadConversation` 函数（useConversation.ts 和 useChat.ts）
- 清理 UnifiedChatPage.tsx 中的相关引用和逻辑
- 修复 `isNew` 状态传递，新建会话时正确跳过历史加载
- 添加 `refetchOnMount: 'always'` 确保会话列表及时刷新
- 切换会话时清空 persisted 消息，避免旧数据闪烁

**时间显示和时区修复**：
- 用户消息上方从显示 ID 改为显示时间 `MM-DD HH:mm`
- 修复后端 UTC 时间解析：前端按 UTC 解析（`dateString + 'Z'`）
- 跨年自动显示年份格式：`YYYY-MM-DD HH:mm`
- 影响范围：侧边栏、会话记录页、对话消息

**消息排序双重防御**：
- 前端防御：`useSessionRestore` 中按 `timestamp` 升序排序
- 后端防御：`session_service.py` 中按 `timestamp` 排序

### 基础设施升级（2026-03-05）

**PostgreSQL 15 → 18 升级**：
- 升级 PostgreSQL 15 至 18.2，使用 `pgvector/pgvector:pg18-bookworm` 镜像
- 更新 docker-compose.yml 数据卷挂载路径（PG 18+ 新格式：`/var/lib/postgresql`）
- 更新文档：README.md 和 CONTRIBUTING.md 反映 PG18 要求
- deploy.sh 部署脚本自动检测并处理 PG15→18 升级（备份→清理→恢复）

### 专家管理增强（2026-03-05）

**动态工具列表与使用指南**：
- 新增 `/api/tools/available` 端点，动态返回可用工具列表（基础工具 + MCP 工具）
- 前端工具使用指南：新建/编辑专家时显示可用工具列表及使用示例
- 支持国际化：中英日三语翻译（`loadingTools`, `noToolsAvailable`, `toolTipsDescription` 等）
- MCP 工具实时同步：管理员添加 MCP 服务器后，工具列表自动更新

**工具调用日志增强**：
- `generic.py`：记录专家类型、任务 ID、工具名称和参数
- `tool_runtime.py`：记录工具调用请求和成功状态
- 结构化日志 `[ToolUsage]` 便于后续分析和成本统计

**相关文件**：
- 后端：`api/tools.py`, `agents/nodes/generic.py`, `agents/tool_runtime.py`
- 前端：`ExpertFormDialog.tsx`, `ExpertEditor.tsx`, `services/admin.ts`
- 翻译：`i18n/translations/admin.ts`

### 交互体验优化（2026-03-05）

**管理列表"创建-反馈"模式**：
- **专家管理（ExpertAdminPage）**：创建专家后自动选中并滚动到底部（新项目在列表底部）
  - 排序修复：从 UUID 排序改为 `created_at` 排序，确保新项目出现在底部
  - 自动滚动：`useRef` + `scrollIntoView` 实现平滑滚动
- **MCP 服务器列表（MCPList）**：创建服务器后自动展开并滚动到底部
  - 新增 `onSuccess` 回调传递新服务器 ID
  - `useEffect` 监听数据变化，自动展开并滚动

**最佳实践**：管理后台列表的统一交互模式——创建 → 选中/展开 → 滚动到可视区域

### 配置管理重构（2026-03-05）

**Pydantic Settings 配置管理（最佳实践）**：
- 引入 `pydantic-settings` 替代分散的 `os.getenv` 调用
- 集中式配置管理：`backend/config.py` 统一所有配置项
- 类型安全：自动类型转换和验证（int/float/str/SecretStr）
- 敏感保护：`SecretStr` 自动脱敏，日志不泄露 API Key
- 环境感知：`is_production` / `is_development` 属性
- 便捷方法：`get_llm_key()` / `get_jwt_secret()` / `init_langsmith()` / `validate()`
- 完全兼容：现有 `.env` 文件无需修改，新增配置项有合理默认值
- Ruff 代码规范：`main.py` 添加至 `per-file-ignores`（E402 导入位置规则）

**影响范围**：
- 修改：`backend/config.py`（完全重写）、`main.py`、`agents/graph_builder.py`
- 修改：`schemas/common.py`、`services/chat/stream_service.py`、`pyproject.toml`
- 文档：`backend/.env.example` 添加新配置项说明

### 架构重构（2026-03-04～03-05）

**Models 完全拆分**：
- ORM 模型迁移至 `backend/models/domain/`（user, conversation, task, expert 按领域组织）
- Pydantic DTO 独立为 `backend/schemas/`（请求/响应模型分离）
- 枚举集中至 `backend/models/enums.py`，统一 `_enum_values` 工厂
- 消除 `models/__init__.py` 臃肿问题，职责边界清晰

**SQLAlchemy 2.0 兼容性修复**：
- 移除 `__future__.annotations`（与 SQLAlchemy 2.0 不兼容）
- 修复 `func.now()` 调用（添加括号）
- 升级 SQLModel 0.0.31 → **0.0.37**，SQLAlchemy 2.0.45 → **2.0.48**
- 升级 FastAPI 0.128 → **0.135.1**，Starlette 0.52.1（安全修复）

**代码规范（Ruff 清理）**：
- 修复 ~810 处 lint 警告（UP006/007、F401、I001、W291/293 等）
- 统一现代 Python 类型注解风格（`List[X]` → `list[X]`，`Optional[X]` → `X | None`）

### 专家管理优化（2026-03-04）

**缓存一致性修复（P0）**：
- `refresh_cache()` 现在统一清除三级缓存：全局缓存、Commander 本地缓存、GenericWorker 本地缓存
- 解决管理员更新专家配置后，LangGraph 执行仍读取旧缓存的问题

**乐观锁并发控制（P1）**：
- 新增 `SystemExpert.config_version` 字段（迁移 006）
- 更新专家时校验 `expected_version`，不匹配返回 409 Conflict
- 前端提示用户"配置已被修改，请刷新后重试"
- 使用 SQLAlchemy Core `update()` 实现数据库层原子递增

### 稳定性与运维（2026-03-03～03-05）

**HITL 与恢复**:
- HITL 恢复流程幂等性加固，避免重复提交导致的状态错乱
- Recovery 并发保护与 session 状态一致性

**后台任务**:
- 新增 SessionCleanup 定时任务：自动清理过期/僵死会话（可配置间隔与保留天数）
- 应用启动时注册清理循环，随 Lifespan 启停

**数据库迁移**:
- `004_add_common_query_indexes`：常用查询索引
- `005_unify_index_naming_and_systemexpert_uuid`：索引命名统一、SystemExpert.id 改为 UUID
- `20260304_180000_standardize_enum_and_length_constraints`：枚举与长度约束标准化

**开发体验与门禁**:
- Husky + lint-staged：提交前自动跑前端 lint
- Node 版本要求提升至 ≥24.14（与 package.json engines 一致）
- 修复 ESLint pre-commit hook：`pass_filenames: true` 改为只检查修改的文件，避免全项目既有错误阻塞提交

**影响面与升级注意**:
- 新迁移需在部署时执行 `alembic upgrade head`
- 若从旧版升级，请按 004 → 005 → 20260304 顺序应用

---

## [2026-03-01] - v3.2.4 - 会话历史性能优化与批量删除

### 🚀 性能优化

**分页加载（P0-5 修复）**:
- 后端 `GET /threads` 接口支持分页（`page` + `limit` 参数）
- 前端使用 `useInfiniteQuery` 实现无限滚动加载
- 首屏只加载 20 条记录，滚动到底部自动加载更多
- 加载性能：~3s (500条) → ~200ms (20条)

**API 分离**:
```
GET /api/threads              # 列表（轻量级，无消息内容）
GET /api/threads/{id}         # 详情（元数据）
GET /api/threads/{id}/messages # 消息（完整内容）
```
- `ThreadListResponse` 新增 `message_count` 和 `last_message_preview`
- 避免 base64 图片等内容导致内存溢出

### 🗑️ 批量删除

**新增批量删除功能**:
- 历史页面右上角添加 "Select" 按钮进入批量模式
- 支持单条勾选、全选/取消全选
- 批量删除确认对话框
- 后端新增 `POST /threads/batch-delete` 接口

### 🌍 国际化

**新增翻译键（中/英/日）**:
- `select`, `selectAll`, `deselectAll`, `selectedCount`
- `batchDelete`, `batchDeleteConfirm`
- `moreAvailable`, `loadMore`, `noMoreRecords`

### 🐛 Bug 修复

**页面刷新跳转问题（P0-6 修复）**:
- 新增 `isAuthChecked` 状态标记认证检查是否完成
- `useRequireAuth` 和 `AdminRoute` 等待检查完成后再跳转
- 修复：历史页面、资源库、专家管理页面刷新后跳回首页的问题

### 📁 变更文件
- `backend/routers/chat.py` - 分页和批量删除端点
- `backend/models/__init__.py` - PaginatedThreadListResponse
- `backend/services/chat/session_service.py` - 分页查询逻辑
- `frontend/src/pages/history/HistoryPage.tsx` - 批量删除 UI
- `frontend/src/hooks/queries/useChatHistoryQuery.ts` - 无限滚动
- `frontend/src/services/chat.ts` - API 函数更新
- `frontend/src/store/userStore.ts` - isAuthChecked 状态
- `frontend/src/router/hooks/useRequireAuth.ts` - 等待认证检查
- `frontend/src/components/AdminRoute.tsx` - 等待认证检查
- `frontend/src/i18n/translations/common.ts` - 批量删除翻译

### 🗄️ 数据库迁移（Alembic）

**引入 Alembic 替代手动 SQL 脚本**：
- 全自动数据库架构管理
- 新部署：`alembic upgrade head` 自动创建所有表
- 更新部署：自动应用增量迁移
- 支持回滚：`alembic downgrade`

**迁移文件**：
- `backend/alembic.ini` - Alembic 配置
- `backend/migrations/env.py` - 环境配置（读取 DATABASE_URL）
- `backend/migrations/versions/001_initial_schema_v3_2_4.py` - 初始迁移（完整表结构）

**开发工作流**：
```bash
# 修改 SQLModel 后生成迁移
cd backend
alembic revision --autogenerate -m "Add new table"

# 生产部署自动执行
./deploy.sh  # 内置 alembic upgrade head
```

### 📁 其他变更
- `backend/Dockerfile` - 启动时自动执行迁移
- `deploy.sh` - 添加 Alembic 状态检查和自动迁移

---

## [2026-03-01] - v3.2.3 - 代码重构与设计系统优化

### 🏗️ 事件处理器模块化重构

**拆分 eventHandlers.ts (736行 → 模块化)**:
```
handlers/
├── types.ts              # 共享类型定义
├── utils.ts              # getLastAssistantMessage 工具
├── taskEvents.ts         # plan.* + task.* 事件 (197行)
├── artifactEvents.ts     # artifact.generated (49行)
├── chatEvents.ts         # message.* 事件 (134行)
├── systemEvents.ts       # router.* + HITL + error (110行)
├── index.ts              # 统一导出 + EventHandler 类
└── __tests__/            # 42个单元测试
```

**改进**:
- 按业务域拆分，单一职责
- 引入 HandlerContext 模式，便于测试
- 所有处理器函数可独立测试
- 保持原有 API 兼容性（`handleServerEvent`, `getEventHandler`）

### 🛣️ 路由层模块化重构

**拆分 router.tsx (398行 → 模块化)**:
```
router/
├── index.tsx             # 纯路由配置 (110行，-72%)
├── providers.tsx         # QueryClient + 全局错误处理
├── components/
│   └── LoadingFallback.tsx
├── hooks/
│   ├── useRequireAuth.ts # 认证守卫
│   ├── useCreateAgent.ts # 创建智能体逻辑
│   ├── useEditAgent.ts   # 编辑智能体逻辑
│   └── index.ts
├── wrappers/
│   ├── HistoryPageWrapper.tsx
│   ├── LibraryPageWrapper.tsx
│   ├── CreateAgentPageWrapper.tsx
│   ├── EditAgentPageWrapper.tsx
│   └── UnifiedChatPageWrapper.tsx
└── __tests__/
    └── hooks.test.ts
```

**改进**:
- 业务逻辑下沉到 Hooks，可复用可测试
- Wrapper 组件专注渲染和布局
- 路由配置纯净，只负责路由定义
- 统一的加载状态和错误处理

### ✅ 测试覆盖

- **eventHandlers**: 42 个单元测试，覆盖所有事件类型
- **router hooks**: 4 个单元测试，验证 Hook 导出

### 🔧 后端代码重构

**消除重复代码**:
- 删除 5 处重复的 `load_dotenv()` 调用，统一在 `main.py` 加载环境变量
- 统一 JWT 验证逻辑，从 `dependencies` 导入 `get_current_user`
- 删除 `jwt_handler.py` 中 4 个未使用的函数/类
- 删除 `config.py` 中 2 个废弃配置项

**抽象公共服务**:
- 新增 `mcp_tools_service.py`，统一 MCP 工具获取逻辑（含 TTL 缓存）

### ⚛️ 前端代码重构

**提取通用工具函数**:
- 新增 `sseUtils.ts`：提取 SSE 心跳检测通用逻辑
- 新增 `authUtils.ts`：提取登录弹窗触发函数
- 替换 12 个文件中的 `console.log` 为统一的 `logger`

**配置优化**:
- 删除 `package.json` 中重复的 `workspaces` 字段
- 修复 `clean` 脚本跨平台兼容性（使用 `rimraf`）

### 🎨 智能体创建页面重构

**布局优化（方案 B）**:
- 左侧表单改为两列紧凑布局（名称 + 分类）
- 右侧新增实时预览面板：智能体卡片、系统提示词预览、示例对话

**新增通用组件**:
- `BauhausSelect`：通用的 Bauhaus 风格下拉选择组件
- 统一分类选择与模型选择的交互风格

**国际化**:
- 新增 9 个翻译键：preview, unnamedAgent, noDescription, noSystemPrompt 等

### 📐 侧边栏交互重构

**边缘把手设计**:
- 展开状态：用户卡片右侧竖直把手（20px 窄条）
- 收拢状态：头像下方横置把手（点击展开）

**方圆结合风格**:
- 收拢状态：圆形按钮（像机械仪表盘旋钮）
- 展开状态：方形按钮（像控制面板开关）
- 统一 hover 效果：位移 + 黄色阴影 + 边框变色

**代码优化**:
- 提取 `constants.ts`：统一尺寸常量（230px 宽度、44px/60px 按钮高度）
- 共享 `collapsedButtonStyles`：收拢按钮样式统一
- 移除硬编码颜色：头像 fallback、套餐图标改用语义化变量
- 新增 `expandSidebar`/`collapseSidebar` 国际化翻译

## [2026-03-01] - v3.2.5 - UI 细节优化与代码清理

### 🎨 UI 优化

**滚动条统一**:
- 全站滚动条改为 bauhaus-scrollbar 风格（默认隐藏，hover 显示细条）
- 消息面板、首页、Artifact 面板、对话框等 15+ 处统一

**间距优化**:
- ArtifactDashboard 间距：32px → 16px，增加可视区域
- 聊天面板边距：24px → 16px，更紧凑
- 移除 ArtifactDashboard header 装饰方块

**i18n 修复**:
- 添加缺失的 `preview` 翻译键（中/英/日）
- 添加缺失的 `thinkingProcess`、`thinkingCompleted` 翻译键

### 🔧 代码清理

**移除废弃代码**:
- 删除 `bauhaus-card.tsx`（未使用）
- 删除 `bauhaus-button.tsx`（未使用）
- 删除未使用的 CSS 工具类：.glow-*、.text-glow、.bg-grid

**内联样式清理**:
- NewChatButton、NavigationMenu 等组件移除内联 style
- 统一使用 Tailwind 工具类（w-[230px]、h-[60px] 等）
- 新增阴影工具类：shadow-hard-accent-sm/md/lg

### 🐛 Bug 修复

- 修复翻译键缺失导致的英文 key 显示问题
- 修复 CreateAgentPage 硬编码黑色阴影

## [2026-03-01] - v3.2.4 - 设计系统完善

### 🎨 设计系统

**阴影规范**:
- 新增 shadow-hard-accent 系列工具类
- 统一 hover 阴影颜色为黄色强调色
- 移除所有硬编码 rgba(0,0,0,1) 阴影

**主题一致性**:
- Card 组件恢复黄色阴影 hover 效果
- 统一按钮 hover 边框为 content-primary

### 🗂️ 项目结构

- 删除空目录 `frontend/src/data`
- 统一常量导入路径

## [2026-02-28] - v3.2.3 - 语义化主题系统重构

### 🎨 主题系统重构

**语义化设计令牌 (Design Tokens)**:
- 新增三层架构：Primitive → Semantic → Tailwind Mapping
- 定义了 40+ 语义化变量：surface-*, content-*, border-*, accent-*
- 支持透明度修饰符（如 `bg-surface-card/50`）

**简化主题策略**:
- 移除 Cyberpunk 和单独的 Bauhaus 主题
- 归并为 Light/Dark 两个主题（均为 Bauhaus 风格）
- Light: 暖灰纸张背景 + 黄色强调 + 黑色粗边框
- Dark: 深灰黑底 + 黄色边框/阴影 + 白色文字

**大规模组件更新**:
- 更新 30+ 文件，将旧颜色类替换为语义化变量
- 移除所有 `bauhaus-*` 前缀的类名
- 移除所有 `dark:` 前缀，通过 `data-theme` 属性控制

**兼容层保留**:
- 保留旧变量映射（`--bg-page`, `--border-color` 等）供迁移期使用
- 添加旧主题值迁移（`bauhaus` → `light`）

### ✅ 可复用性

**新增主题无需修改组件**:
```css
/* 只需在 themes/ 目录下新建主题文件 */
[data-theme="my-theme"] {
  --surface-page: 10 10 10;
  --surface-card: 20 20 20;
  --content-primary: 255 255 255;
  /* ... */
}
```

### 🔧 修复

- 修复主题切换时的闪烁问题
- 修复 placeholder 对比度不足
- 修复消息气泡颜色不统一
- 修复反选文字可见性

## [2026-02-28] - v3.2.2 - 代码质量重构与架构优化

### 🏗️ 架构重构

**后端 Service 层抽取**:
- 重构 `main.py`：业务逻辑迁移到 `services/invoke_service.py`
- `main.py` 从 ~500 行减少到 ~310 行
- 引入 FastAPI 依赖注入模式：`service: InvokeService = Depends(get_invoke_service)`
- 提升可测试性：Service 层可独立单元测试

**前端组件拆分**:
- `BauhausSidebar.tsx` (750行) 拆分为 7 个子组件
- `translations.ts` (1043行) 拆分为 6 个模块

### 🔧 代码质量 (P0/P1 修复)

**P0 严重问题修复 (9项)**:
- 修复 `useAsyncError` 不存在导出
- 修复 MCP transport 参数传递 bug
- 添加 ESLint 配置（React Hooks 规则）
- 修复 React 19 `forwardRef` 兼容性
- 修复 Zustand Slice 类型定义
- 修复 N+1 查询问题（TaskSession 预加载）
- 修复 SSRF 防护增强（MCP URL 验证）
- 提取 `formatTaskOutput` 公共函数

**P1 重要优化 (14项)**:
- Selector 统一：创建 `useAuthSelectors.ts`，删除重复定义
- Query 缓存配置：创建 `src/config/query.ts` 统一配置
- Suspense + ErrorBoundary 包装懒加载路由
- STREAM_TIMEOUT 从 30s 提升到 120s
- JSON Mode 智能降级（支持 DeepSeek 等模型）
- LangGraph deepcopy → list() 优化
- MCP 缓存键添加服务器配置哈希
- Vite 代码分割：11 个 manualChunks
- Prettier 配置添加 Tailwind CSS 插件
- TypeScript 配置统一（合并 tsconfig.app.json）

### 🐛 Bug 修复

**认证体验**:
- 修复未登录用户点击侧边栏资源库/历史记录不弹登录框的问题
- Sidebar `handleMenuClick` 添加登录检查
- Router 新增 `useRequireAuth` hook 保护 `/library` 和 `/history`

### 📦 工具链

**代码质量工具**:
- ESLint：React Hooks 规则（rules-of-hooks: error, exhaustive-deps: warn）
- Prettier：添加 `prettier-plugin-tailwindcss` 插件
- 格式化脚本：`format`, `format:check`

### 🔧 Dependencies

- **新增**: `tenacity>=9.0.0` (后端重试机制)
- **新增**: `cachetools>=5.3.0` (后端 TTL 缓存)
- **新增**: `prettier`, `prettier-plugin-tailwindcss` (前端)

## [2026-02-27] - v3.2.1 - MCP 增强与媒体渲染优化

### 🎉 新增功能

**MCP Streamable HTTP 支持**:
- 新增 `transport` 字段支持 `streamable_http` 协议（MCP 新标准，2025年3月发布）
- 向后兼容 SSE 协议（legacy，已弃用）
- 数据库迁移：`mcp_servers` 表新增 `transport` 列（默认 'sse'）

**MCP 工具超时与错误处理**:
- 添加 60 秒工具调用超时，防止外部 MCP 服务挂起
- 超时/错误时返回友好提示给 LLM，而非崩溃整个工作流
- 支持通义万相等长耗时服务（如视频生成）的优雅降级

**媒体内容自动渲染**:
- 自动识别并渲染 MCP 生成的图片/视频链接
- 支持 Markdown 链接 `[text](image.png)` 和行内代码 `` `image.png` `` 格式
- 支持 OSS 对象存储链接（阿里云、AWS S3 等）
- 添加链接过期检测和警告提示

### 🐛 Bug 修复

- 修复 MessageItem 和 DocArtifact 中的图片渲染逻辑
- 修复 ToolMessage content 兼容性问题（DeepSeek/MiniMax）

---

## [2026-02-27] - v3.2.0 - MCP 生态正式版 + 工业级认证

### 🎉 重大更新

**MCP 生态正式可用**:
- MCP 工具调用完整流程验证通过（高德地图等外部工具）
- 修复 ToolMessage content 格式问题，支持多模型兼容
- 生产环境稳定运行，可接入任意 MCP Server

**工业级自动认证机制**:
- 前端拦截器实现静默 Token 刷新
- 用户 60 天免登录体验
- 刷新失败时才弹出登录框，无缝衔接

### 🔐 安全与稳定性 (P0)

**JWT Token 安全重构 + 自动刷新**:
- 从 localStorage 迁移至 HttpOnly Cookie
- 移除 JWT 默认密钥，强制使用环境变量
- Access Token 过期时间从 30 天缩短至 60 分钟
- **新增自动 Token 刷新机制**：前端拦截器静默刷新，用户无感知
  - 拦截 401 错误 → 调用 `/auth/refresh-token` → 重试原请求
  - 刷新失败时才弹出登录框，实现 60 天免登录体验
- 新增 `AuthInitializer` 组件处理页面刷新后的会话恢复

**MCP 工具调用修复**:
- 修复 ToolMessage content 格式问题（DeepSeek/MiniMax 只接受字符串）
- 添加模型特定的 `content_mode` 配置（string/auto）
- 支持多模态模型（OpenAI/Anthropic/Gemini/Kimi）保留原生 list[str|dict] 格式

**MCP 连接安全**:
- 修复 MCP SSE 连接泄漏问题
- 添加 URL 验证（SSRF 防护）
- 使用 `HttpUrl` 类型严格验证 MCP Server URL
- 添加连接超时控制（10秒）

### ⚡ 性能优化 (P1)

**数据库性能**:
- 修复 N+1 查询问题（TaskSession/SubTask/Artifact 预加载）
- 使用 `selectinload` 优化关联数据查询

**LangGraph 优化**:
- 统一所有 Node 函数签名，添加 `config: RunnableConfig = None` 参数
- 修复 Node 间状态传递问题
- 添加专家缓存并发锁保护

**工具调用优化**:
- 添加异步工具版本 `asearch_web()`、`aread_webpage()`
- LLM 调用添加 `tenacity` 重试机制（3次指数退避）
- MCP 工具添加 TTL 缓存（5分钟）

**SSE 连接稳定性**:
- 修复重连计数器不重置问题
- 连接成功后正确重置 `retryCount` 和 `lastActivityTime`
- 优化心跳检测机制

### 🐛 Bug 修复

**Artifact 数据持久化**:
- 修复页面刷新后 Artifact 丢失问题
- 修复会话切换时 Artifact 显示混乱问题
- 修复 `tasksCache` 从 localStorage 恢复时的重建问题
- 优化 `useSessionRestore` 和 `loadConversation` 协调逻辑

**类型安全**:
- 清理 `router.tsx` 中的 `any` 类型
- 修复 `conversation: any`、`agent: any` 等类型定义
- 新增 `ApiError` 接口用于错误处理

### 📦 新增功能

**React 19 最佳实践 Hooks**:
- `useOptimisticUpdate` - 乐观更新模式
- `useSuspenseQuery` - Suspense 查询模式
- `usePromise` - React 19 `use()` 兼容层

**API 改进**:
- 智能体列表添加分页支持
- 统一错误处理增强

### 🔧 Dependencies

- **langgraph-sdk**: 升级至 0.3.5（从 0.3.3 升级）
  - 在 `pyproject.toml` 中显式声明依赖 `langgraph-sdk==0.3.5`
  - 更新 `requirements.txt` 锁定版本至 0.3.5
  - 更新 `uv.lock` 依赖锁定文件

---

## [2026-02-02] - v3.0.0 - 架构重构与开源发布

### 🎉 重大版本更新

**v3.0.0 是项目的首个正式稳定版本，标志着架构重构完成和开源发布。**

本版本经历了全面的架构重构，采用现代化的前后端分离 Monorepo 架构，实现了智能路由系统、LangGraph 多专家工作流、以及 IndustrialChatLayout 双栏布局。

### 🏗️ 架构重构

**Monorepo 架构**:
- 前端位于 `/frontend`（Vite + React 19 + TypeScript）
- 后端位于 `/backend`（FastAPI + Python 3.13 + SQLModel）
- 统一使用 pnpm workspace 管理多包依赖
- 使用 uv 作为 Python 包管理器

**前端架构**:
- React 19.2.4 + React Router 7.12.0 路由系统
- Zustand 5.0.10 全局状态管理
- shadcn/ui + Radix UI 无头组件库
- Tailwind CSS 3.4.17 原子化样式
- Framer Motion 12.29.0 动画与交互
- 响应式设计，支持移动端/平板/桌面端
- 完整的国际化支持（EN/ZH/JA）

**后端架构**:
- FastAPI 0.128.0 异步 Web 框架
- SQLModel 0.0.31 ORM 框架，统一 SQLAlchemy 和 Pydantic
- PostgreSQL 15+ 数据库（移除 SQLite 支持）
- LangGraph 1.0.6 AI 工作流编排
- JWT 认证 + 密码哈希（PyJWT + Passlib）

### ✨ 核心功能

**智能路由系统（Router）**:
- 单入口智能体 `sys-default-chat`（默认助手）
- 后端 Router 节点智能判断 simple/complex
- **Simple 模式**：直接调用 LLM 进行对话响应
- **Complex 模式**：LangGraph 多专家协作工作流
- 通过 `thread_mode` 字段区分模式（非独立智能体）
- 前端无需手动切换，体验更流畅

**LangGraph 工作流**:
- Router 节点：意图识别，只做分类决策
- Planner 节点：任务拆解，生成执行计划
- Expert Dispatcher：循环分发任务到对应专家节点
- 七位专业专家：search/coder/researcher/analyzer/writer/planner/image_analyzer
- Aggregator 节点：整合所有专家结果，生成最终响应
- SSE 实时推送任务进度和专家状态

**IndustrialChatLayout 双栏布局**:
- 左侧 ChatStreamPanel：消息列表 + 输入框（55% 宽度）
- 右侧 OrchestratorPanelV2：编排器面板
  - Simple 模式：AI 预览区域
  - Complex 模式：BusRail（专家状态）+ Artifact（产物展示）
- 桌面端双栏并排，移动端单栏切换
- 全屏模式：Artifact 占满右侧区域

**MCP 生态支持**:
- 原生支持 Model Context Protocol (MCP)
- MCP Server 管理：完整的 CRUD API
- Library 页面：Bauhaus 风格设计
- SSE 连接测试：添加/编辑时自动测试
- 工具动态注入：LangGraph 运行时加载 MCP 工具
- 工具优先级：MCP 专业工具 > 内置通用工具

**自定义智能体系统**:
- 用户可创建个性化 AI 助手
- 支持自定义系统提示词
- 支持选择不同模型
- 支持分类管理
- 默认助手不在列表展示，通过首页输入框直接交互

**Artifact 产物系统**:
- 代码片段：语法高亮、复制功能
- HTML 预览：iframe 实时渲染
- Markdown 文档：安全渲染、支持 GFM
- 搜索结果：结构化展示
- 多产物支持：一个专家可生成多个产物

**Human-in-the-Loop (HITL)**:
- Commander 生成任务计划后暂停等待用户确认
- 支持修改任务、调整顺序、删除步骤
- 完全掌控执行流程

**长期记忆**:
- 基于 pgvector 的向量检索
- 自动提取和存储用户偏好、习惯
- 实现个性化 AI 体验

### 📊 数据库模型

**核心模型**:
- User：用户账户，支持多种登录方式
- Thread：会话记录，关联用户和消息
- Message：消息记录，支持 extra_data 存储额外信息
- CustomAgent：用户自定义智能体

**复杂模式模型**:
- TaskSession：任务会话，记录一次完整的多专家协作过程
- SubTask：子任务，专家执行的具体任务
- Artifact：产物，支持多类型产物存储

**管理系统模型**:
- SystemExpert：系统专家配置（Prompt、模型、温度参数）
- MCPServer：MCP Server 配置管理

### 🔧 技术改进

**代码质量提升**:
- TypeScript 严格类型检查
- Pydantic 模型验证
- 单一职责原则，模块化设计
- 自定义异常类：AppError/NotFoundError/ValidationError/AuthorizationError
- 统一的错误处理装饰器：withErrorHandler

**性能优化**:
- Zustand 状态管理，组件逻辑与视图分离
- React.memo 和 useMemo 优化渲染性能
- 懒加载路由，代码分割
- 专家配置内存缓存
- Zustand Slice 严格隔离
- Services 层 Barrel 模式

**安全性增强**:
- CORS 白名单配置
- 安全头部中间件
- JWT Token 认证
- 密码 bcrypt 哈希
- API 权限检查
- HttpOnly Cookie（v3.1.0）

### 🎨 UI/UX 改进

**视觉设计**:
- Bauhaus 风格设计语言
- 粒子网格动态背景
- 流畅的动画过渡
- 深色/浅色主题支持

**用户体验**:
- 实时打字效果和流式响应
- 专家状态实时更新
- 任务进度可视化
- 移动端手势交互
- 滑动返回功能

### 📦 依赖更新

**前端依赖**:
- Vite 5.4.17 → 7.3.1
- React 19.2.4
- TypeScript 5.6 → 5.7.2
- Framer Motion 11.15.0 → 12.29.0
- Lucide React 0.462.0 → 0.563.0
- React Markdown 10.1.0
- Sentry 错误监控集成

**后端依赖**:
- Python 3.13+
- FastAPI 0.128.0+
- LangGraph 1.0.6+
- SQLModel 0.0.31+
- psycopg 3.x
- langchain-mcp-adapters 0.2.1

**开发工具**:
- pnpm 10.28.1
- uv 包管理器
- Docker + Docker Compose

### 🐛 问题修复

**已修复的关键问题**:
- 修复专家完成事件显示空括号问题
- 修复复杂模式下任务计划展示逻辑
- 修复自定义智能体消息不显示问题
- 修复 Artifact 状态在切换会话时残留问题
- 修复专家状态栏在明亮主题下的文本对比度问题
- 修复移动端滑动返回冲突问题
- 修复侧边栏菜单状态同步问题

### 📝 文档更新

**文档改进**:
- 完整的 README.md 文档，包含架构说明、部署指南、使用教程
- CHANGELOG.md 详细的版本更新记录
- 国际化翻译文件（EN/ZH/JA）
- Docker 部署配置和 Nginx 配置
- 环境变量配置说明
- CODE_REVIEW_REPORT.md 代码审查报告

### 🔒 生产环境准备

**部署优化**:
- Docker Compose 一键部署
- PostgreSQL 数据库容器化
- 前端静态资源 Nginx 托管
- 后端容器健康检查
- ~~数据库迁移脚本（幂等性设计）~~ → 已迁移至 Alembic（v3.2.4）
- CORS 和安全头部配置

### 📊 代码统计

- 前端文件：135+ 个文件
- 后端文件：44+ 个文件
- 代码行数：约 20000+ 行

---

## 归档

更早期的版本变更记录请查看 [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)
