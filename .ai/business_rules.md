# Business Rules

## User Roles & Permissions

| Role | Permissions |
|------|-------------|
| `user` | Create conversations, use simple/complex mode, edit own artifacts |
| `admin` | All user permissions + manage system experts, promote users, manage MCP servers |
| `view_admin` | View expert configs (read-only) |
| `edit_admin` | View + modify expert configs |

## Conversation Modes

### Simple Mode
- **Trigger**: Router classifies query as "simple"
- **Flow**: Direct LLM response, streaming output
- **Use Case**: Chit-chat, simple questions, creative writing
- **Output**: Single message stream

### Complex Mode  
- **Trigger**: Router classifies query as "complex"
- **Flow**:
  1. Commander analyzes & creates execution plan
  2. User reviews plan (HITL - Human In The Loop)
  3. Dispatcher executes experts sequentially
  4. Aggregator synthesizes final response
- **Use Case**: Multi-step tasks, data analysis, research, coding projects

## Expert System

### Built-in Experts (is_dynamic=false)
- `search`: Web search & information retrieval
- `coder`: Code generation & analysis  
- `writer`: Content creation & editing
- `researcher`: Deep research & synthesis
- `analyzer`: Data analysis
- `planner`: Project planning
- `commander`: Task orchestration (meta-expert)

### Expert Configuration
- **system_prompt**: Configurable via Admin UI
- **model**: Per-expert model selection (deepseek-chat, gpt-4o, etc.)
- **temperature**: 0.0 (deterministic) to 2.0 (creative)

### Prompt Variables
- `{user_query}` - user's input (injected at runtime)
- `{dynamic_expert_list}` - available experts (for commander)
- `{current_time}` - injected by backend

## MCP (Model Context Protocol) System

### MCP Server Management
- **Visibility**: Library page accessible to all authenticated users
- **Permissions**: Only `admin` can add/edit/delete MCP servers
- **Regular users**: Can view and toggle ON/OFF (personal preference)

### MCP Connection States
| Status | Meaning | UI Indicator |
|--------|---------|--------------|
| `connected` | SSE connection successful | Green dot |
| `error` | Connection failed | Red dot with error message |
| `unknown` | Not tested yet | Gray dot |

### MCP Tool Priority Rules
1. **MCP tools take precedence**: LLM prefers MCP tools over built-in tools
2. **Tool selection**: Based on tool name and description matching
3. **Fallback**: Built-in `search_web` available when no MCP search tool
4. **Runtime loading**: Only `is_active=True` servers' tools are loaded

### MCP Tool Examples
```python
# MCP Tool (preferred)
{
    "name": "web_search",
    "description": "Search the web for current information...",
    # From external MCP Server
}

# Built-in Tool (fallback)
{
    "name": "search_web", 
    "description": "ONLY use when no specialized tools available...",
    # From backend/tools/search.py
}
```

### MCP Configuration Requirements
- **name**: Unique identifier, used in tool loading
- **sse_url**: Valid HTTP(S) URL with `/sse` endpoint
- **transport**: Currently only supports "sse"
- **is_active**: Controls whether tools are loaded into LLM context

## Artifact Handling

### Generation Rules
1. **Batch Delivery Only** (v3.1.0+): Complete content delivered via `artifact.generated`
2. **No Streaming**: Deprecated `artifact.chunk` events
3. **One Artifact Per Task**: Most tasks produce single artifact
4. **Storage**: Artifacts persisted to DB with full content

### Content Types
- `markdown`: Default for most experts
- `code`: Syntax-highlighted code blocks
- `html`: Renderable HTML content
- `text`: Plain text

## Task Execution Rules

### Status Flow
```
pending → running → completed
              ↓
           failed
```

### Dependencies
- Tasks specify `depends_on: string[]` (task IDs)
- Dispatcher waits for dependencies to complete
- Failed dependency may block or allow fallback

### HITL (Human In The Loop)
- Plan approval required before execution
- User can:
  - Approve as-is
  - Modify task descriptions
  - Reorder tasks
  - Cancel workflow

## State Management Rules

### TaskStore (SDUI)
- **Single Source of Truth**: Backend events are authoritative
- **No Local Computation**: Store reflects backend state directly
- **Reset**: `resetAll()` clears all slices on conversation change

### ChatStore
- **Optimistic Updates**: User messages appear immediately
- **Streaming**: `message.delta` appends content
- **Finalization**: `message.done` confirms completion

### Event Handling
```
Message Events (Chat) → chat.ts onChunk → ChatStore
Task Events             → chat.ts handleServerEvent → eventHandlers.ts → TaskStore
```

## Performance Constraints

- **SSE Timeout**: 30s keepalive for long-running tasks
- **Max Artifacts**: No hard limit, but UI optimized for 1-5
- **Concurrent Tasks**: Sequential execution (parallel planned)
- **MCP Connection Timeout**: 10s for initial connection test

## Security Rules

- All admin endpoints require `role=admin`
- Expert prompts validated (min 10 chars for system_prompt)
- SQL injection prevented via SQLModel parameterized queries
- XSS prevention via React's default escaping
- MCP Server URLs validated (must be valid HTTP/HTTPS URL)

## Recent Architectural Decisions (v3.1.0)

1. **MCP Integration**: External tool servers via SSE protocol
2. **Tool Priority**: MCP professional tools > Built-in generic tools
3. **Graceful Degradation**: MCP failures don't break main chat flow

## Recent Architectural Decisions (v3.1.0)

1. **Artifact Batch Delivery**: Eliminated streaming complexity
2. **Event Unification**: Single handler path for Task events
3. **Slice Isolation**: Clear boundaries between Task/UI/Planning slices
4. **useExpertHandler Deprecation**: Logic moved to eventHandlers.ts

## Debugging Guidelines

- Enable `VITE_DEBUG_MODE=true` for verbose logging
- Check EventHandler logs for event flow
- TaskStore logs show cache version changes
- Backend logs tagged with `[GenericWorker]`, `[Commander]`, etc.
- MCP connection logs in `[MCP]` prefixed messages
