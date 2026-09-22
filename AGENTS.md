# XPouch AI — AGENTS.md

AI 多智能体工作台（LangGraph 后端 + React 前端，开源自托管）。架构详见 `ARCHITECTURE.md` 与 `docs/TARGET-ARCHITECTURE.md`。

## 动手前必读（真相源）
- 需求与进度：`docs/BACKLOG.md`（完成验收后删条目；完成史由 git/CHANGELOG 承载）
- 已定决策与"明确不做"：`docs/DECISIONS.md`（否决记录勿复燃）
- 架构方向：`docs/TARGET-ARCHITECTURE.md` 第 5/8 节
- UI 规范：`docs/DESIGN-SPEC.md`

## 常用命令
- 后端：`cd backend && uv run python run.py`（3002；**改代码必须重启进程**）
- 前端：`pnpm build` 后 `pnpm preview`（4173）；开发 `pnpm dev`
- 测试：后端 `backend/.venv/Scripts/python.exe -m pytest tests/ -q`；前端 `pnpm test`
- HITL 全链路 e2e（真实 LLM）：`backend/scripts/e2e_hitl_check.py`
- 改枚举/事件协议/response_model 后：`just gen-enums` / `gen-event-types` / `gen-openapi-types`

## 生成物（勿手改）
`frontend/src/types/enums.generated.ts`、`events.generated.ts`、`api.generated.ts`——由后端生成，有新鲜度闸门。

## 硬禁令（代码里看不出来的）
- 时间一律 `utils/time.utc_now()`（aware UTC）；**NaiveDatetime 注解禁用**，timestamptz 列勿改回 naive
- 勿引回 framer-motion（已刻意移除）；动效用 CSS
- langgraph checkpoint 运行时四表不在 alembic 管辖，勿动
- 迁移必须双口径验证：空库链 + 开发库（先停后端），`alembic check` 零漂移；DDL 用守卫式字面量 SQL
- 单列聚合必须 `sqlalchemy.select + row[0]`（sqlmodel select 返回标量，见 CONTRIBUTING）
- 词汇 canonical（2026-09 收敛定稿）：description / strategy / created_at / expert_type / depends_on / thread；`dependencies` 旧名已显式拒绝

## 边界
- API 密钥只在 `.env`（gitignored）；`providers.yaml` 可入库但禁敏感信息
- 生产操作（deploy.sh / 服务器）等用户明确指示
