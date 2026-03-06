# AI 开发指南

本文档用于指导 AI 助手在 XPouch AI 项目中的开发工作。

## 项目结构

```
xpouch-ai/
├── backend/          # FastAPI + Python 3.13
│   ├── agents/       # LangGraph 工作流
│   ├── api/          # REST API
│   ├── models/       # SQLModel 模型
│   └── services/     # 业务逻辑
├── frontend/         # React + TypeScript + Vite
│   ├── src/components/
│   ├── src/hooks/
│   ├── src/store/    # Zustand
│   └── src/pages/
└── docker-compose.yml
```

## 开发规范

### Python (后端)

- 使用 **Ruff** 进行代码检查和格式化
- 类型注解必需
- 异步函数使用 `async/await`
- 数据库操作使用 SQLModel

### TypeScript (前端)

- 使用 **ESLint** 进行代码检查
- 类型定义放在 `types/` 目录
- 组件使用函数式 + Hooks
- 状态管理使用 Zustand

## 关键模块

### 会话加载机制

统一使用 `useSessionRestore` Hook：
- 初始加载时从 API 获取会话数据
- 标签页切换时自动恢复
- 新建会话时跳过恢复（`isNew: true`）

### 时间处理

- 后端返回 UTC 时间（无时区标记）
- 前端按 UTC 解析：`new Date(dateString + 'Z')`
- 显示格式：`MM-DD HH:mm`（跨年显示年份）

## 提交前检查

```bash
# 后端
cd backend && uv run ruff check .

# 前端
cd frontend && pnpm run lint
```

## 常见陷阱

1. **时区问题**：后端 `datetime.now()` 是本地时间，前端需要正确解析
2. **Zustand persist**：会缓存状态，切换会话时需要清空
3. **useSessionRestore 和 loadConversation**：功能重复，统一使用前者
