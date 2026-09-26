# XPouch AI — AGENTS.md

AI 多智能体工作台（开源自托管）。后端：Python 3.13 / FastAPI / LangGraph / SQLModel + PostgreSQL(pgvector)，Alembic 迁移；前端：React 19 + TypeScript + Vite + Tailwind，pnpm workspace。架构详见 `ARCHITECTURE.md` 与 `docs/TARGET-ARCHITECTURE.md`。

命令统一经 `uv run`（后端）与 `pnpm`（前端）执行，macOS / Linux / Windows 通用；不直接引用 `.venv` 内的解释器路径。

## 动手前必读（真相源）
- 需求与进度：`docs/BACKLOG.md`（完成验收后删条目；完成史由 git/CHANGELOG 承载）
- 已定决策与"明确不做"：`docs/DECISIONS.md`（否决记录勿复燃）
- 架构方向：`docs/TARGET-ARCHITECTURE.md` 第 5/8 节
- UI 规范：`docs/DESIGN-SPEC.md`

## 启动与常用命令
- 数据库：仓库根 `docker compose up -d db`（pgvector/pg18，5432）。**本地开发数据在 named volume `xpouch-ai_xpouch-pgdata`**（经本地 `docker-compose.override.yml` 切换，gitignored）——Docker Desktop 对 WSL 目录的 bind mount 跨 9p 共享，Windows 非干净关机会整树丢数据（2026-09-26 事故实锤）。生产（deploy.sh，原生 Linux）仍走仓库根 `postgres_data/` bind mount。导入既有数据 = 临时容器拷入 volume 后 `chown -R 999:999`；每日备份脚本 `~/.local/bin/xpouch-db-backup.sh`（pg_dump 到 /mnt/d，cron 21:00）
- 后端：`cd backend && uv run python run.py`（3002；**改 backend 下 .py 文件进程会自重启**——`reload=False` 但实测文件变更触发重执行，机制未定位但稳定复现；重启窗口内 API 拒连，跑 e2e/调试前先等健康检查稳定）
- 前端：`cd frontend && pnpm build && pnpm preview`（4173）；开发 `pnpm dev`（仓库根 `pnpm dev` 可前后端并起，不含数据库）
- 测试：`cd backend && uv run python -m pytest tests/ -q`；`cd frontend && pnpm test`（仓库根 `pnpm test` 两者全跑）

## 验收链（改完必跑，全绿才算完成）
- 后端：`cd backend && uv run ruff check . && uv run ruff format --check . && uv run python -m pytest tests/ -q`
- 前端：`cd frontend && pnpm run typecheck && pnpm run lint && pnpm test && pnpm build`
- 动到执行路径（流式/HITL/迁移）加跑 e2e（真实 LLM）：`cd backend && uv run python scripts/e2e_hitl_check.py`
- 改枚举/事件协议/response_model 后重新生成契约：`cd backend && uv run python -m scripts.gen_enums_ts`（枚举）/ `gen_event_types_ts`（事件协议）/ `gen_openapi_types`（REST）

## 生成物与提交
- `frontend/src/types/*.generated.ts` 由后端脚本产出，勿手改（有新鲜度闸门）
- 提交走 Conventional Commits、中文主题，先例见 git log

## 硬约束（代码里看不出来的，均有事故案底）
- 时间一律 `utils/time.utc_now()`（aware UTC）；禁用 NaiveDatetime 注解，timestamptz 列勿改回 naive——naive/aware 混用会抛错或漂移时区
- 勿引回 framer-motion（已刻意移除）；动效用 CSS
- langgraph checkpoint 四表（checkpoints / checkpoint_blobs / checkpoint_writes / checkpoint_migrations）由库自建自管，勿写进 alembic 迁移
- 迁移双口径验证：① 空库链——临时库上 `DATABASE_URL=<临时库> uv run alembic upgrade head` 整链跑通；② 开发库——停掉连库进程后升级。之后 `uv run alembic check` 必须零漂移。DDL 用守卫式字面量 SQL：先查 information_schema 判存在/类型再 ALTER，幂等重跑不炸
- 迁移即种子：补种内置专家的迁移必须对全部内置做 INSERT IF NOT EXISTS——只补一两个会让表非空、main.py 的空表自举跳过，其余专家永远缺失（见 DECISIONS.md）
- 单列聚合必须 `sqlalchemy.select + row[0]`——sqlmodel 的 select 会把单列结果解包成标量（见 CONTRIBUTING）
- canonical 词汇（description/strategy/created_at/expert_type/depends_on/thread 等）以 `docs/DECISIONS.md` 词汇收敛条目为唯一真相源；expert_type 等标识符被历史数据引用，改名需连带数据迁移，勿顺手重命名

## 边界
- API 密钥只在 `.env`（gitignored）；`providers.yaml` 可入库但禁敏感信息
