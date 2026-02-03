# 贡献指南

感谢您对 XPouch AI 项目的关注！我们欢迎各种形式的贡献，包括但不限于：

- 提交 Bug 报告
- 提出新功能建议
- 改进文档
- 提交代码修复或新功能

## 开发环境设置

### 前置要求

- Node.js >= 18.0.0
- Python >= 3.13
- PostgreSQL 15+
- pnpm >= 8.0.0

### 本地开发

1. **Fork 并克隆仓库**

```bash
git clone https://github.com/alex1987chn/xpouch-ai.git
cd xpouch-ai
```

2. **安装依赖**

```bash
pnpm install
```

3. **配置环境变量**

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env 文件，配置数据库和 API Key
```

4. **启动开发服务器**

```bash
# 同时启动前后端
pnpm run dev

# 或分别启动
pnpm run dev:frontend  # http://localhost:5173
pnpm run dev:backend   # http://localhost:3002
```

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

通过提交贡献，您同意您的代码将使用与项目相同的 [MIT License](./LICENSE) 开源许可。

## 致谢

感谢所有为 XPouch AI 做出贡献的开发者！
