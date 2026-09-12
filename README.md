<div align="center">

# XPouch AI

**An open-source, controllable multi-expert Agent Runtime for real task execution.**

English | [简体中文](./README.zh-CN.md)

[![License](https://img.shields.io/badge/License-Apache%202.0%20with%20Additional%20Terms-blue.svg)](./LICENSE)
[![CI](https://github.com/alex1987chn/xpouch-ai/actions/workflows/ci.yml/badge.svg)](./actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.13%2B-blue?logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.x-green?logo=langchain)](https://langchain-ai.github.io/langgraph/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://docker.com)

<img src="./.github/images/hero-home.png" alt="XPouch AI — soft theme" width="900">
<img src="./.github/images/hero-dark.png" alt="XPouch AI — dark theme" width="900">

[Try it Live](https://xpouch.ai) · [Issues](https://github.com/alex1987chn/xpouch-ai/issues) · [Discussions](https://github.com/alex1987chn/xpouch-ai/discussions)

</div>

---

## What is XPouch AI?

XPouch AI is an open-source multi-expert Agent Runtime built for real task execution. It puts planning, approval, execution, recovery, and artifact persistence on a single, fully traceable main chain — instead of offering just another chat UI.

The current stable baseline includes:

- simple / complex dual mode
- HITL approval and recovery in complex mode
- **HITL revision loop**: reject with feedback → the planner produces v(n+1) while the task stays paused; decide in a loop or terminate
- **User management & audit log** (admin): masked user list, role editing, password reset; every admin-side mutation is recorded
- **Document attachments**: PDF / Word / Excel / MD parsed into the conversation context
- **Artifact viewer modal**: view/code toggle, editing, MD/PDF export, public sharing
- Three-layer runtime semantics: `Thread / AgentRun / ExecutionPlan`
- Artifact persistence, restored rendering, and multi-task serial execution
- Cross-turn artifact continuity (follow-ups like "turn the chart above into a sequence diagram" can reference prior artifacts)
- **Artifact center**: browse every artifact across sessions with search & type filters, one-click public share links, and one-click jump to the source conversation
- **Dual login** (SMS code + password) with a standalone Account & Security dialog, incl. forgot-password reset
- **Interruptible-resumable streaming**: auto-resume after disconnects; tasks keep running when you close the page
- Reasoning stream (deep-thinking increments streamed alongside the answer)
- Instance-level model configuration (admin switches the global default model & thinking toggle, no restart)
- Token usage visualization (today / total)
- Skill templates (Library panel + built-in templates + one-click sessions)
- Template import/export (JSON with override / clone / skip strategies)
- Tool governance (configurable policies, admin-only)
- **Visible-but-locked permission model**: admin entries are visible to everyone, data and actions are role-gated
- **Accessibility baseline**: dialog focus management (trap & restore), WCAG AA contrast, accessible names on all icon buttons
- SSE-driven Server-Driven UI (unified event protocol, exactly-once delivery)
- MCP dynamic tool integration
- **Dual themes (Soft / Dark)**: warm-paper light and warm-charcoal dark semantic palettes, with a circular-reveal transition animation; trilingual UI (EN / 中文 / 日本語)

## Core Capabilities

### LangGraph multi-expert main chain

- `Router -> Direct Reply`
- `Router -> Commander -> HITL -> Dispatcher -> Generic -> Tools -> Aggregator`
- automatic simple / complex routing

### HITL approval and recovery

- Commander pauses after generating a plan; an amber approval card and an edge glow lead you straight to the decision
- **Three-action decision**: Approve & run / Revise & resubmit (reject with feedback — the planner produces v(n+1) while the task stays paused) / Terminate
- Users can edit, delete, and reorder tasks before approving
- `POST /api/chat/resume` resumes execution around a `run_id`; revisions run as a background task and the frontend polls for the new version
- Rejection feedback is permanently kept in the conversation as a user message

### Run-based runtime

- `Thread` is the conversation container
- `AgentRun` is one real execution
- `ExecutionPlan` is a complex-task plan
- run-level cancel / timeout / heartbeat / current node

### Artifact system

- Code, Markdown, HTML, and text artifacts
- Artifacts are persisted to the database
- Historical complex sessions can be restored with their artifacts
- **Cross-turn continuity**: every new message carries a summary of recent artifacts into planning context, so the Commander can emit "modify artifact X" tasks; experts read full content on demand via the `get_artifact` tool without bloating graph state

### Reasoning stream

- `reasoning_content` from models like DeepSeek is streamed as incremental events
- The thinking stream scrolls ahead of the answer, then auto-collapses; it is persisted per message and survives refresh
- Thinking is toggled per user in settings (see below); reasoning tokens are billed as output

### Model configuration (admin)

- Admins pick the global default simple-mode model and the thinking toggle in **System Management** — applied instance-wide, no restart
- The model menu itself comes from `providers.yaml` + provider API keys (`GET /api/models` as the single source of truth), so the admin can cap what is available
- Complex mode (planner + experts) models are configured per expert in Expert Management
- Users simply use the product — model/thinking governance is admin-side (see the two-role model below)

### Multimodal image input

- Attach images to a chat message; vision models (DeepSeek V4.1 Flash, Kimi K2.6) see them natively via OpenAI-style multimodal content
- Non-vision models reject image input explicitly instead of failing silently

### Template sharing

- Admins publish a public read-only export link for any skill template (token is unguessable, revocable at any time)
- Other instances paste the fetched JSON into Library → Import — the organic growth loop

### MCP dynamic tools

- Supports `sse` / `streamable_http`
- Generic Worker binds `BASE_TOOLS + MCP_TOOLS` at runtime
- MCP servers are managed from the admin UI

### Skill templates

- Template model + `GET/POST/PUT/DELETE /api/library/templates` management API
- Built-in templates: travel briefing, research report, writing outline
- Library page "Skill Templates" panel: browse, manage, and start a new session from a starter prompt

### Tool governance

- Unified governance layer: `risk_tier`, `allow/deny/require_approval`, validated at both binding and execution time
- Configurable policies: `ToolPolicy` persistence, `GET/PUT /api/tools/policies`, runtime merge of database overrides
- System Management "Tool Governance" panel: admins view/edit policies

### User management & audit log (admin)

- **User management**: instance-wide user list (masked phone with on-demand reveal, UUID, registered/last-login time, role), plus create user, edit profile & role, reset password (custom or system-random — random shown only once), and delete user with cascading cleanup
- **Audit log**: every admin-side mutation (users / experts / quota) is recorded with actor, action, target, and detail; searchable

### Document attachments (multimodal context)

- Attach PDF / Word / Excel / Markdown / text documents to a chat message (10 MB per file, up to 3)
- The backend parses them into plain text injected into the current conversation context, so experts answer directly from the documents

### Server-Driven UI

- The backend is the source of truth
- The frontend is driven by SSE events into its stores
- Event protocol v2: nodes emit structured events through a unified outlet (`emit_event`) over the LangChain custom-event channel — exactly-once delivery, never entering graph state or checkpoints; the frontend/backend event enums are guarded by contract tests
- A transport-level `[DONE]` marker distinguishes normal completion from abnormal stream breaks
- Ready to evolve into an auditable, replayable Agent product

### Run timeline

- A dedicated page showing the full event timeline of a run
- Reachable from the chat page and history cards
- Covers the whole lifecycle: run created, router decision, HITL interrupts/resumes, task execution, artifact generation, terminal states
- API: `GET /api/runs/{run_id}`, `GET /api/runs/{run_id}/timeline`, `GET /api/runs/thread/{thread_id}/timeline`

### Admin stats dashboard

- **Open to all users**: regular users see their own run data; admins see the whole instance
- Run overview: total runs, success rate, pending reviews, average duration
- 7-day trend charts aggregated by date
- Paginated run list with search (fuzzy match on run ID / username), status, mode, duration, and user
- Database-level aggregation via `func.count` / `func.sum` / `func.avg` + `group_by`
- API: `GET /api/admin/stats/runs` (overview and trends in one response)

## Architecture

```text
Thread
  -> conversation container

AgentRun
  -> one real execution

ExecutionPlan
  -> plan for a complex task
```

```text
POST /api/chat
  -> create/get Thread
  -> create AgentRun
  -> Router
  -> Commander
  -> HITL interrupt
  -> POST /api/chat/resume
  -> Dispatcher / Generic / Tools
  -> Aggregator
  -> Artifact + Message
```

A contributor-oriented map of directories, the event protocol, and "how to add X" guides lives in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Quick Start

> Full self-hosting guide (admin bootstrap, reverse proxy & HTTPS, backups, FAQ): **[docs/self-hosting.md](docs/self-hosting.md)** (Chinese; English translation welcome via PR).

### Requirements

- Node.js `>= 24.14.0`
- pnpm `11.25.0` (or a compatible pnpm 11)
- Python `>= 3.13`
- PostgreSQL `18+`
- `uv` (backend dependency & command management)

### Option 1: Docker Compose (recommended for local evaluation)

```bash
git clone https://github.com/alex1987chn/xpouch-ai.git
cd xpouch-ai

# ① Root .env: feeds database credentials into docker-compose interpolation
#    (without it the db service cannot start)
cp .env.example .env
# Edit .env — change POSTGRES_PASSWORD etc.

# ② Backend .env: application configuration (LLM keys, etc.)
cp backend/.env.example backend/.env
# Edit backend/.env — at least one LLM API key is required

docker-compose up -d --build
```

Once started:

- Frontend: `http://localhost:8080`
- **Register with your phone — on a fresh install the first account automatically becomes the admin** (no env var needed; existing instances can still bootstrap via `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PHONE`)
- Open **System Management** (admin-only) to verify database, migrations and model providers
- Database: `localhost:5432`

Notes:

- The backend container runs `alembic upgrade head` on startup
- Docker Compose points the container's `DATABASE_URL` at the `db` service
- The checked-in `docker-compose.yml` targets local development/debugging and exposes the database port to the host
- For production use `deploy.sh`: it merges `docker-compose.prod.yml` (log rotation) and binds the database port to loopback only (`127.0.0.1:5432`)
- The root `.env` feeds variable interpolation into `docker-compose.yml`; `backend/.env` is the actual backend configuration source

### Option 2: Local development

```bash
# Frontend
cd frontend
pnpm install
pnpm dev

# Backend (another terminal)
cd backend
uv sync
uv run python run.py        # Windows-friendly launcher (event loop / hot reload handled), default port 3002
```

Local development endpoints:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3002`
- Swagger: `http://localhost:3002/docs`

Notes:

- Running the backend directly uses `backend/.env`
- With Docker Compose, the root `.env` and `backend/.env` both participate but serve different roles
- The backend container listens on port `3000`; the local dev command above uses `3002`

## Environment Variables

Minimum required:

```env
DATABASE_URL=postgresql+psycopg://user:password@host:5432/dbname
JWT_SECRET_KEY=your-secret

# At least one LLM provider
DEEPSEEK_API_KEY=...   # recommended, default model deepseek-flash
# or OPENAI_API_KEY=...
# or MOONSHOT_API_KEY=...
```

Common optional variables:

- `TAVILY_API_KEY`
- `SILICON_API_KEY`
- `LANGCHAIN_API_KEY`
- `CORS_ORIGINS`
- `RUN_DEADLINE_SECONDS`
- `RUN_MAX_GRAPH_LOOPS`

See `backend/.env.example` for a full example.

## Development & Verification

```bash
# backend
cd backend
uv run ruff check .
uv run pytest tests/ -q

# frontend
cd frontend
pnpm run lint
npx tsc --noEmit
pnpm run build
```

If the repository's pre-commit hooks are installed, checks run automatically at commit time.

## Operations

### Database backups

The repository ships a `pg_dump`-based backup script (keeps the latest N copies):

```bash
./scripts/backup_db.sh                  # keeps 7 by default
BACKUP_KEEP=30 ./scripts/backup_db.sh   # custom retention
```

Servers should run it daily via crontab — one-command idempotent install:

```bash
./scripts/install_backup_cron.sh         # installs a daily 03:00 backup job (safe to re-run)
```

Backups land in `backups/` (gitignored).

### Environment declaration (fail-closed)

`ENVIRONMENT` must be set explicitly (`development` / `testing` / `production`). When missing, **production** semantics apply: debug endpoints off, the `X-User-ID` auth bypass off, production-grade JWT validation on. Production deployments must set it explicitly in `backend/.env`.

### Health checks

- Backend: `GET /api/health` (wired into the Dockerfile HEALTHCHECK and the compose healthcheck)
- Frontend: in-container wget probe (compose healthcheck)

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — architecture map (start here if you want to contribute)
- [CHANGELOG.md](./CHANGELOG.md)
- [DESIGN.md](./DESIGN.md) — UI & interaction conventions
- [CONTRIBUTING.md](./CONTRIBUTING.md)（中文）
- [SECURITY.md](./SECURITY.md)
- [THEME_GUIDE.md](./THEME_GUIDE.md) — theme system（中文）
- [backend/.env.example](./backend/.env.example)

> Some guides (CONTRIBUTING, THEME_GUIDE) are currently Chinese-only; more English docs are on the way.

## Roadmap

### Done

- run-based runtime semantics refactor
- complex-mode HITL / resume / artifact main loop closed
- run-level cancel / timeout / heartbeat / current node
- durable run / run ledger (phase 1)
- lightweight replay / eval / regression assets
- single-active-run constraint per thread (v1)
- tool governance / selective approval (phase 2, first wave)
- skill / template abstraction (v1)
- MCP dynamic tool integration
- Server-Driven UI event architecture
- run timeline UI
- admin stats dashboard
- session recovery and task continuation (in-flight tasks survive tab switches)
- template import/export (JSON with conflict detection and multiple strategies)
- DeepSeek V4 Flash migration (legacy model ID aliases kept for stored data)
- reasoning stream (incremental thinking events)
- event protocol v2 unification (exactly-once delivery, single channel, contract tests)
- cross-turn artifact continuity (artifact summaries into planning + get_artifact tool)
- password login & forgot-password reset (standalone Account & Security dialog)
- artifact center + per-artifact share links (server-rendered share pages)
- resumable streaming + background task continuation
- token usage accounting & visualization
- visible-but-locked permission model + UI design conventions (DESIGN.md)
- dialog focus management & accessibility baseline (a11y), backend route structure unified (auth/ package + single routers/ family)
- Soft/Dark dual-theme redesign (circular-reveal transitions) with a full component refresh
- User management & audit log (masked list, role editing, password reset, admin mutation trail)
- Document attachments (PDF/Word/Excel/MD parsed into conversation context)
- Async LLM calls & memory retrieval restored (concurrent requests no longer block each other)

### Next up

- Interactive selective approval UI
- Knowledge base (artifact/document persistence & retrieval)

## Contributing

Issues, ideas, and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md)（Chinese）for the dev environment, code conventions, and commit flow.

## License

Licensed under the **Apache License 2.0** with additional terms — see [LICENSE](./LICENSE).

---

**If this project helps you, please consider giving it a Star. ⭐**
