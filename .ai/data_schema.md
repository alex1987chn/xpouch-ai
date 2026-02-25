# Data Schema

## Database Models (SQLModel)

### Core Models

```python
# User
class User:
    id: str              # UUID
    username: str
    role: "user" | "admin" | "view_admin" | "edit_admin"
    phone_number: str?
    email: str?

# Conversation / Thread
class Thread:
    id: str              # UUID
    user_id: str
    title: str?
    type: "default" | "custom" | "ai"
    created_at: datetime

# Message
class Message:
    id: str
    thread_id: str
    role: "user" | "assistant" | "system"
    content: str
    created_at: datetime

# Task Session (Complex Mode)
class TaskSession:
    session_id: str      # UUID
    thread_id: str
    user_query: str
    plan_summary: str?
    status: "pending" | "running" | "completed" | "failed"
    created_at: datetime

# SubTask
class SubTask:
    id: str              # UUID
    session_id: str
    expert_type: str     # "search" | "coder" | "writer" | ...
    task_description: str
    status: "pending" | "running" | "completed" | "failed"
    output_result: JSON?
    duration_ms: int?
    depends_on: List[str]?

# Artifact
class Artifact:
    id: str
    sub_task_id: str
    type: "markdown" | "code" | "text" | "html"
    title: str
    content: str
    language: str?       # for code artifacts
    sort_order: int

# SystemExpert (Configurable)
class SystemExpert:
    id: int
    expert_key: str      # unique identifier (e.g., "search", "coder")
    name: str            # display name
    description: str?    # for planner
    system_prompt: str   # the prompt template
    model: str           # "deepseek-chat" | "gpt-4o" | ...
    temperature: float   # 0.0 - 2.0
    is_dynamic: bool     # false = built-in, true = user-created
```

## Frontend Types

### Task Types

```typescript
// Task Status
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

// Task (Frontend)
export interface Task {
  id: string                    // UUID
  expert_type: string           // expert_key
  description: string
  status: TaskStatus
  sort_order: number
  startedAt?: string
  completedAt?: string
  durationMs?: number
  output?: string              // 500-char summary (from task.completed)
  error?: string
  artifacts: Artifact[]         // full content (from artifact.generated)
}

// Artifact
export interface Artifact {
  id: string
  type: 'markdown' | 'code' | 'text' | 'html'
  title: string
  content: string              // FULL content
  language?: string
  sortOrder: number
  createdAt: string
}

// Task Session
export interface TaskSession {
  sessionId: string
  summary: string              // plan summary
  estimatedSteps: number
  executionMode: 'sequential' | 'parallel'
  status: TaskStatus
}
```

### SSE Event Types

```typescript
// Server → Client Events
type ServerEvent =
  | { type: 'router.decision', data: { decision: 'simple' | 'complex' } }
  | { type: 'plan.created', data: PlanCreatedData }
  | { type: 'plan.started', data: PlanStartedData }
  | { type: 'plan.thinking', data: { delta: string } }
  | { type: 'task.started', data: TaskStartedData }
  | { type: 'task.completed', data: TaskCompletedData }
  | { type: 'task.failed', data: TaskFailedData }
  | { type: 'artifact.generated', data: ArtifactGeneratedData }  // Batch mode
  | { type: 'message.delta', data: { content: string } }
  | { type: 'message.done', data: MessageDoneData }
  | { type: 'human.interrupt', data: HumanInterruptData }
  | { type: 'error', data: { code: string, message: string } }

// Key Data Structures
interface TaskCompletedData {
  task_id: string
  expert_type: string
  description: string
  output: string           // 500-char max (summary)
  duration_ms: number
  artifact_count: number   // indicates if artifacts exist
  completed_at: string
}

interface ArtifactGeneratedData {
  task_id: string
  expert_type: string
  artifact: {
    id: string
    type: string
    title: string
    content: string        // FULL content
    language?: string
    sort_order: number
  }
}
```

## API Endpoints

```typescript
// Chat
POST /api/chat/send        // Start conversation
POST /api/chat/resume      // Resume after HITL approval
GET  /api/chat/history/:id // Load conversation history

// Admin (Expert Management)
GET    /api/admin/experts
PATCH  /api/admin/experts/:key
POST   /api/admin/experts
DELETE /api/admin/experts/:key
POST   /api/admin/experts/generate-description
```

## Important Field Mappings

| Frontend | Backend | Notes |
|----------|---------|-------|
| `task.id` | `sub_task.id` | UUID |
| `task.expert_type` | `sub_task.expert_type` | maps to `SystemExpert.expert_key` |
| `task.output` | `task_completed.output` | 500-char summary |
| `task.artifacts[].content` | `artifact.content` | Full content |
| `task.durationMs` | `sub_task.duration_ms` | |

## Constraints

- `task.output` is truncated to 500 chars (for UI display)
- Full content ALWAYS in `task.artifacts[]`
- `artifact.generated` event contains complete artifact data
- No streaming updates to artifact content after generation
