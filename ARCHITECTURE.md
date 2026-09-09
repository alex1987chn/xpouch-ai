# ARCHITECTURE — 架构导览

> 面向贡献者的入门地图。读完本文你应该知道：代码在哪个目录、一条消息的完整生命周期、
> 事件协议的约定，以及「加一个页面 / 加一个接口 / 加一个工具」分别要动哪些文件。
> UI 设计规范见 [DESIGN.md](./DESIGN.md)，主题见 [THEME_GUIDE.md](./THEME_GUIDE.md)。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python 3.13 · FastAPI · LangGraph 1.x · LangChain 1.x · SQLModel 2 · PostgreSQL 18 · Alembic |
| 前端 | React 19 · TypeScript · Vite · Tailwind 4 · Zustand · TanStack Query · @microsoft/fetch-event-source |
| 基础设施 | Docker Compose · gunicorn/uvicorn · pgvector（预留） |

## 目录导览

```
backend/
├── agents/            # LangGraph 图与节点（产品核心）
│   ├── graph_builder.py / graph.py   # 图的装配
│   ├── nodes/          # router / commander / dispatcher / generic / aggregator
│   ├── state.py        # 图状态定义
│   ├── event_stream.py # 事件出口（emit_event）
│   ├── tool_policy.py / tool_runtime.py  # 工具治理执行层
│   └── services/       # 节点协作服务
├── routers/           # HTTP 路由（chat / admin / library / tools / runs / stats / mcp / public / system）
│   ├── chat.py         # 会话与 SSE 流、产物接口
│   ├── admin.py        # 专家管理与用户晋升（view/edit/admin 分级守卫）
│   ├── library.py      # 技能模板 CRUD 与导入导出
│   ├── tools.py        # 工具列表与治理策略
│   ├── runs.py / stats.py / mcp.py / public.py（/s/{token} 分享页）/ system.py
├── auth/              # 认证包：OTP、密码登录、忘记密码、cookie、限流（按子模块拆分）
├── auth.py            # 认证：手机验证码 / 密码登录 / 忘记密码 / cookie / 限流
├── services/          # 业务服务（chat/ 子域、agent_service、tool_policy_service…）
├── crud/              # 数据访问层（SQLModel 查询封装）
├── models/            # 领域模型（Thread / AgentRun / ExecutionPlan / Artifact / User …）
├── schemas/           # Pydantic DTO
├── tools/             # 专家可用的工具（artifacts / search / browser）
├── migrations/        # Alembic（命名规范有测试守护）
├── event_types/       # 事件枚举（前后端契约，见下）
├── evals/             # 回归评测资产
└── tests/             # pytest（含契约与回归测试）

frontend/src/
├── pages/             # 路由页面（home / chat / artifacts / library / history / admin / run）
├── components/        # UI 组件（bauhaus 侧边栏、chat、settings、ui 原子组件）
├── services/          # API 客户端（fetch 封装，按域分文件）
├── store/             # Zustand 全局状态（user / chat / theme / appUI）
├── hooks/             # TanStack Query 与业务 hooks
├── router/            # 路由表、守卫（AdminRoute）、懒加载
├── i18n/              # 三语翻译（zh/en/ja，TranslationKey union 类型守护）
└── styles/tokens/     # 设计 token（data-theme 多主题，见 THEME_GUIDE.md）
```

## 核心语义：三层运行时

```
Thread        会话容器（一个对话 = 一个 thread）
└── AgentRun  一次真实执行（run 级 cancel / timeout / heartbeat / current node）
    └── ExecutionPlan  复杂任务的计划（可被用户在 HITL 中修改）
```

- 同一 thread 同时只有一个活跃 run
- run 是审计与恢复的原子单位：时间线、产物、token 用量都挂在 run 上

## 一条消息的完整生命周期

```
POST /api/chat
  → create/get Thread → create AgentRun
  → Router        简单/复杂分流（simple 直答，complex 进主链）
  → Commander     生成 ExecutionPlan → HITL interrupt 暂停
  → POST /api/chat/resume   用户确认/修改计划后恢复
  → Dispatcher → Generic（专家执行，可调 tools）→ Aggregator
  → Artifact + Message 落库 → SSE 流结束
```

- simple 模式不经过 Commander/HITL，直接路由到专家作答
- 客户端断开不会终止任务：producer 继续执行落库；显式取消走协作式 cancel
- 断线续传：SSE 事件带递增 `id:`，断开后 `GET /api/chat/{thread}/stream/resume?last_event_id=` 补放

## 事件协议 v2（Server-Driven UI）

- 节点内部经统一出口 `emit_event` 发射结构化事件，走 LangChain custom event 通道直达消费端
- **恰好一次投递**：事件不进图状态、不进 checkpoint（避免重放重复消费）
- 前后端共享事件枚举（`backend/event_types/` ↔ `frontend/src/types`），由契约测试守护——
  新增事件必须先加枚举（含 msgpack 序列化白名单）再使用
- 传输层以 `[DONE]` 标记正常结束，异常断流与完成可区分

## 认证与权限

- 登录方式：手机验证码（`/api/auth/send-code` + `verify-code`）与密码（`login-password`），
  凭证为 HttpOnly Cookie（access 60min / refresh 60d）
- 角色层级：`USER < VIEW_ADMIN < EDIT_ADMIN < ADMIN`，后端以 `require_role` 统一守卫
- 产品决策「可见但锁」：管理入口菜单全员可见，数据与操作按角色控制（详见 DESIGN.md §4.5）
- 超管产生：环境变量 `INITIAL_ADMIN_EMAIL/PHONE` 启动时自动提升，或由 ADMIN 调 `promote-user`

## 如何贡献代码

### 新增一个 HTTP 接口

1. 路由进 `routers/` 对应域文件（服务委托风格：路由薄，逻辑进 services/crud）
2. 请求/响应定义 Pydantic 模型进 `schemas/`
3. 需要鉴权：`Depends(get_current_user)`；管理接口用 `require_role(...)`
4. 补 pytest 用例；ruff + pytest 全绿

### 新增一个专家工具

1. 实现进 `backend/tools/`
2. 绑定进 generic worker 的 `BASE_TOOLS`（或作为 MCP Server 动态接入）
3. 受工具治理约束：`risk_tier` 与策略在 Library「Tool Governance」面板配置

### 新增一个前端页面

1. 页面进 `src/pages/<域>/`，路由进 `router/index.tsx`（懒加载 + Wrapper）
2. 容器与标题行用 `PageTitle`，容器模型 `max-w-5xl + px-6 md:px-12 py-8`（DESIGN.md §4）
3. 数据用 TanStack Query；loading 用 `ui/skeleton` 骨架；错误态/空态按 §4.5 与现状习语
4. 文案走 i18n 三语（zh/en/ja + `TranslationKey` union）
5. 颜色只用语义 token，禁止 `dark:` 前缀与写死灰色

### 提交前自查

```bash
cd backend && uv run ruff check . && uv run pytest tests/ -q
cd frontend && pnpm run lint && npx tsc --noEmit && pnpm run build
```

CI（`.github/workflows/ci.yml`）在 push/PR 时跑同一套检查。
