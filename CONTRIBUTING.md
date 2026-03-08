# 贡献指南

感谢您对 XPouch AI 项目的关注！我们欢迎各种形式的贡献，包括但不限于：

- 提交 Bug 报告
- 提出新功能建议
- 改进文档
- 提交代码修复或新功能

## 开发环境设置

### 前置要求

- Node.js >= 24.14.0
- Python >= 3.13
- PostgreSQL 18+
- pnpm >= 10.28.1
- uv（后端依赖与命令管理）

### 环境区分

- 本地开发：通常直接运行 `frontend` + `backend`，前端默认 `5173`，后端默认 `3002`
- Docker Compose：仓库内的 `docker-compose.yml` 主要用于本地联调，前端对外 `8080`，数据库默认映射到宿主机 `5432`
- 生产环境：请使用单独的生产部署流程或覆盖配置，不要直接把当前 compose 文件当作生产默认模板

### 本地开发

1. **Fork 并克隆仓库**

```bash
git clone https://github.com/alex1987chn/xpouch-ai.git
cd xpouch-ai
```

2. **安装依赖**

```bash
# 根目录前端/工作区依赖
pnpm install

# 后端 Python 依赖
cd backend
uv sync
cd ..
```

3. **配置环境变量**

```bash
# 本地开发至少需要后端配置
cp backend/.env.example backend/.env
# 编辑 backend/.env 文件，配置数据库和 API Key

# 如果要跑 Docker Compose，再补充根目录配置
cp .env.example .env
```

4. **启动开发服务器**

```bash
# 同时启动前后端
pnpm run dev

# 或分别启动
pnpm run dev:frontend  # http://localhost:5173
pnpm run dev:backend   # http://localhost:3002
```

如果你使用 Docker Compose 本地联调：

```bash
docker-compose up -d --build
```

对应入口：

- 前端：`http://localhost:8080`
- 数据库：`localhost:5432`
- 后端由前端容器反向代理访问，不默认单独暴露宿主机端口

## 代码规范

### 前端规范

- **代码风格**：使用 ESLint 和 Prettier 配置
- **类型安全**：所有代码必须使用 TypeScript，禁用 `any` 类型
- **组件规范**：使用函数式组件 + Hooks
- **状态管理**：优先使用 Zustand，避免冗余状态
- **样式规范**：使用 Tailwind CSS，遵循原子化原则

### 后端规范

- **代码风格**：遵循 PEP 8
- **类型注解**：所有函数必须添加类型注解
- **错误处理**：使用自定义异常类（`AppError`）
- **数据库操作**：使用 SQLModel ORM
- **API 设计**：遵循 RESTful 原则

### Pre-commit Hooks

贡献者**必须安装** pre-commit hooks 以确保代码质量：

```bash
# 方式 1: 使用 uv（推荐）
uv tool install pre-commit
pre-commit install

# 方式 2: 使用 Justfile
just install-hooks

# 方式 3: pip 安装
pip install pre-commit
pre-commit install
```

**手动运行检查**：

```bash
# 检查所有文件
pre-commit run --all-files

# 或使用 Justfile
just pre-commit-check
```

**跳过检查（仅紧急情况）**：

```bash
git commit -m "your message" --no-verify
# 或
just commit-no-verify "your message"
```

### 提交信息规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 类型**：

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例**：

```bash
feat(chat): 添加消息搜索功能

支持按关键词搜索历史消息，支持高亮显示匹配内容。

Closes #123
```

## 提交 Pull Request

1. **创建分支**

```bash
git checkout -b feat/your-feature-name
```

2. **提交更改**

```bash
git add .
git commit -m "feat: add your feature description"
```

3. **保持与主分支同步**

```bash
git fetch origin
git rebase origin/main
```

4. **推送到你的 Fork**

```bash
git push origin feat/your-feature-name
```

5. **创建 Pull Request**

- 在 GitHub 上创建 PR
- 填写清晰的标题和描述
- 关联相关 Issue（如果有）
- 确保 CI 检查通过

## PR 审查标准

- [ ] 代码符合项目规范
- [ ] 所有测试通过
- [ ] 新功能有对应的测试用例
- [ ] 文档已更新
- [ ] 没有引入新的 lint 警告
- [ ] 提交历史清晰（建议 squash 为单一提交）

## 报告 Bug

提交 Bug 报告时，请提供以下信息：

1. **问题描述**：清晰描述问题
2. **复现步骤**：详细步骤说明
3. **期望行为**：正常应该发生什么
4. **实际行为**：实际发生了什么
5. **环境信息**：
   - 操作系统
   - 浏览器版本（前端问题）
   - Node.js/Python 版本
   - 相关依赖版本
6. **错误日志**：完整的错误信息和堆栈跟踪

## 功能建议

提出新功能建议时，请包含：

1. **功能描述**：清晰描述建议的功能
2. **使用场景**：说明这个功能的使用场景
3. **预期行为**：描述功能如何工作
4. **替代方案**：考虑过的其他解决方案
5. **附加信息**：截图、示例或其他说明

## 社区交流

- **GitHub Issues**: Bug 报告和功能建议
- **GitHub Discussions**: 一般性讨论和问题
- **Pull Requests**: 代码贡献

## 许可证

通过提交贡献，您同意：

1. 您的贡献将采用与项目相同的 [Apache License 2.0 + 附加条款](./LICENSE) 开源许可
2. 项目维护者有权在未来调整开源协议条款
3. 您的贡献可能被用于商业用途（包括云服务）

详细贡献者条款请参阅 LICENSE 文件中的 "Contributor Agreement" 部分。

## 致谢

感谢所有为 XPouch AI 做出贡献的开发者！
