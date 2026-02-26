# System Architecture

## Overview

XPouch AI follows **Server-Driven UI (SDUI)** architecture:
- Backend is the single source of truth
- Frontend is a "projector" — receive events, store state, render UI
- No business logic computation in frontend

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2 | UI Framework |
| TypeScript | 5.7 | Type System |
| Vite | 7.3 | Build Tool |
| React Router | 7 | Routing |
| Zustand | 5.0 | State Management |
| Immer | 11.1 | Immutability |
| Tailwind CSS | 3.4 | Styling |
| @microsoft/fetch-event-source | 2.0 | SSE Streaming |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.13+ | Language |
| FastAPI | 0.128 | Web Framework |
| LangGraph | 1.0 | AI Workflow |
| SQLModel | 0.0.31 | ORM |
| PostgreSQL | 15+ | Database |
| pgvector | 0.3 | Vector Search |
| langchain-mcp-adapters | 0.2.1 | MCP Client |

### MCP (Model Context Protocol)
- **Transport**: SSE (Server-Sent Events)
- **Client**: MultiServerMCPClient (langchain-mcp-adapters)
- **Pattern**: Dynamic tool injection at runtime

## Project Structure

```
xpouch-ai/
├── frontend/
│   ├── src/
│   │   ├── components/          # UI Components
│   │   ├── store/               # Zustand Stores
│   │   │   ├── slices/          # Slice Pattern
│   │   │   │   ├── createTaskSlice.ts
│   │   │   │   ├── createUISlice.ts
│   │   │   │   ├── createPlanningSlice.ts
│   │   │   │   └── createArtifactSlice.ts
│   │   │   └── taskStore.ts     # Main Store
│   │   ├── handlers/            # Event Handlers
│   │   │   └── eventHandlers.ts # SSE Processing
│   │   ├── services/            # API Services (Barrel Pattern)
│   │   │   ├── api.ts           # Barrel exports (43 lines)
│   │   │   ├── auth.ts          # Auth API
│   │   │   ├── agent.ts         # Agent API
│   │   │   ├── mcp.ts           # MCP API ⭐ NEW
│   │   │   ├── chat.ts          # Chat API (SSE)
│   │   │   ├── common.ts        # handleResponse, handleSSEConnectionError
│   │   │   └── ...
│   │   ├── hooks/               # React Hooks
│   │   └── pages/               # Page Components
│   │       ├── library/         # MCP Library Page ⭐ NEW
│   │       │   ├── LibraryPage.tsx
│   │       │   ├── components/
│   │       │   │   ├── MCPCard.tsx
│   │       │   │   ├── AddMCPDialog.tsx
│   │       │   │   └── BauhausSearchInput.tsx
│   │       │   └── hooks/
│   │       │       └── useMCPServerTools.ts
│   │       └── ...
│   └── public/
├── backend/
│   ├── agents/                  # LangGraph Agents
│   │   ├── graph.py             # Main Graph (MCP工具注入)
│   │   ├── nodes/               # Workflow Nodes
│   │   │   ├── router.py        # Intent Classification
│   │   │   ├── commander.py     # Task Planning
│   │   │   ├── generic.py       # Expert Execution (工具绑定)
│   │   │   └── aggregator.py    # Result Aggregation
│   │   └── services/            # Agent Services
│   ├── routers/                 # FastAPI Routes
│   │   └── mcp.py               # MCP Server API ⭐ NEW
│   ├── models/                  # SQLModel Models
│   │   └── mcp_server.py        # MCP Server Model ⭐ NEW
│   ├── tools/                   # Function Calling Tools
│   └── utils/                   # Utilities
└── docker-compose.yml
```

## MCP Architecture

### MCP Tool Injection Flow
```
User Query
    ↓
Router (classifies intent)
    ↓
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph Runtime                         │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────┐  │
│  │   Router    │───→│  Load MCP Tools │───→│   Generic   │  │
│  │   Node      │    │  from Database  │    │    Node     │  │
│  └─────────────┘    └─────────────────┘    └─────────────┘  │
│                           ↓                                  │
│              ┌──────────────────────┐                        │
│              │ MultiServerMCPClient │                        │
│              │  (SSE Transport)     │                        │
│              └──────────┬───────────┘                        │
│                         ↓                                    │
│              ┌──────────────────────┐                        │
│              │   MCP Server(s)      │                        │
│              │  (External Services) │                        │
│              └──────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
    ↓
Dynamic Tool Node (BASE_TOOLS + MCP_TOOLS)
    ↓
Aggregator → Response
```

### MCP Database Schema
```sql
CREATE TABLE mcp_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sse_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    connection_status VARCHAR(50) DEFAULT 'unknown',
    last_connected_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Key Architectural Decisions

### 1. Server-Driven UI (SDUI)
- Backend pushes state changes via SSE events
- Frontend stores directly map to backend state
- No client-side state computation for complex flows

### 2. MCP Dynamic Tool Loading
```python
# 加载活跃 MCP Server 的工具
async def _get_mcp_tools():
    with SQLModelSession(engine) as db_session:
        active_servers = db_session.query(MCPServer).filter(
            MCPServer.is_active == True
        ).all()
        
        mcp_config = {
            s.name: {"url": str(s.sse_url), "transport": "sse"}
            for s in active_servers
        }
        
        # ⚠️ 注意：不能用 async with
        client = MultiServerMCPClient(mcp_config)
        return await client.get_tools()
```

### 3. Strict Slice Isolation (v3.1.0)
```
TaskStore
├── TaskSlice      (task data, session, tasksCache)
├── UISlice        (UI state: mode, selectedTaskId, runningTaskIds)
├── PlanningSlice  (thinking content)
└── ArtifactSlice  (artifacts)
```

**Rules**:
- Each slice only modifies its own state
- Cross-slice operations through `resetAll()` or eventHandlers.ts
- No direct cross-slice state modification

### 4. Barrel Pattern for Services (v3.1.0)
```typescript
// api.ts - 43 lines, pure re-exports
export * from './auth'
export * from './agent'
export * from './user'
export * from './chat'
export * from './mcp'  // ⭐ NEW
export { handleResponse, handleSSEConnectionError } from './common'
```

### 5. Unified Error Handling (v3.1.0)
```typescript
// All API calls use handleResponse
const response = await fetch(url, options)
return handleResponse<T>(response, 'Error message')

// SSE connections use handleSSEConnectionError
onopen(response) {
  handleSSEConnectionError(response, 'context')
}
```

### 6. Event-Driven Architecture
```
User Input
    ↓
Router (classifies intent)
    ↓
┌─────────────┴─────────────┐
↓                           ↓
Simple Mode              Complex Mode
(Streaming)              (Task Workflow)
    ↓                         ↓
ChatStore              Commander → Plan
    ↓                         ↓
UI (Message)           Dispatcher → Experts
                           ↓
                       TaskStore
                           ↓
                       UI (Dashboard)
```

### 7. ID Mapping Alignment (v3.1.0)
| Legacy ID | Normalized ID | Usage |
|-----------|---------------|-------|
| ai-assistant | sys-task-orchestrator | Complex Mode |
| default-assistant | sys-default-chat | Simple Mode |

Both frontend and backend use the same mapping.

## State Flow

### Chat Flow
1. `useChatCore.sendMessage()`
2. `chat.ts` establishes SSE
3. `message.delta` events → `ChatStore`
4. `message.done` → finalize

### Task Flow
1. `commander_node` creates plan
2. `plan.created` → `TaskStore.initializePlan()`
3. `dispatcher` executes tasks
4. `task.started/completed` → `TaskStore`
5. `artifact.generated` → `TaskStore.addArtifact()`

### MCP Flow
1. User toggles MCP Server ON in Library
2. Chat request triggers `_get_mcp_tools()`
3. `MultiServerMCPClient` connects to SSE endpoints
4. Tools injected into `RunnableConfig`
5. `generic_worker_node` binds tools to LLM
6. LLM selects appropriate tool based on query

### Session Recovery (v3.1.0)
```
Page Refresh              Tab Switch
    ↓                         ↓
API Recovery           localStorage Cache
    ↓                         ↓
TaskStore.restore()    TaskStore.restore()
```

Unified in `useSessionRestore.ts` with 5s debounce.

## Constraints

- **Never** use localStorage for Task state (use API recovery)
- **Always** use batch updates for artifacts (no streaming)
- **Only** `eventHandlers.ts` should write to TaskStore
- **All** expert prompts must be configurable via database
- **All** API errors must go through `handleResponse` or `handleSSEConnectionError`
- **MCP**: Use direct instantiation for MultiServerMCPClient (no `async with`)
- **MCP**: Handle connection failures gracefully (don't break main flow)

## Recent Changes (v3.1.0)

1. **MCP Integration**: Dynamic tool loading from external MCP Servers
2. **Library Page**: Bauhaus-style MCP management UI
3. **Tool Priority**: MCP tools take precedence over built-in tools

## Recent Changes (v3.1.0)

1. **Strict Slice Isolation**: Removed cross-slice modifications
2. **Barrel Pattern**: api.ts reduced from 217 to 43 lines
3. **ID Mapping Alignment**: ai-assistant → ORCHESTRATOR
4. **Unified Error Handling**: handleSSEConnectionError for SSE
5. **Session Hooks Merge**: useSessionRecovery deleted, merged into useSessionRestore

---
Last Updated: 2026-02-24
