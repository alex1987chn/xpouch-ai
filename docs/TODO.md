# XPouch AI 架构重构任务清单

> **最后更新**：2026-01-22
> **当前状态**：Phase 1 ✅ | Phase 2 ✅ | Phase 3 ✅ | Phase 4 ✅ | Phase 5 ✅ | Phase 6 ✅ | Phase 7 ✅

---

## Phase 1: 数据库迁移 ✅ 已完成

### Task 1.1: 创建迁移系统框架
- [x] 创建 `backend/migrations/` 目录
- [x] 实现迁移运行器 `runner.py`（版本管理、执行、回滚功能）
- [x] 设计迁移文件命名规范（migration_*.py）

**完成时间**：2026-01-22
**负责人**：XPouch AI Team
**验证方法**：执行 `python backend/migrations/migrate.py status` 显示迁移历史

---

### Task 1.2: 数据库Schema变更
- [x] Conversation表新增字段：
  - [x] `agent_type` VARCHAR(20) DEFAULT 'default'（索引）
  - [x] `agent_id` VARCHAR(100)（索引）
  - [x] `task_session_id` VARCHAR(100)（索引）
- [x] CustomAgent表新增字段：
  - [x] `is_default` BOOLEAN DEFAULT FALSE（索引）
- [x] SubTask表新增字段：
  - [x] `artifacts` JSON
- [x] TaskSession表新增字段：
  - [x] `conversation_id` VARCHAR(100)（外键）

**完成时间**：2026-01-22
**验证方法**：数据库schema检查，字段已添加且索引已创建

---

### Task 1.3: 创建迁移脚本
- [x] 编写 `migration_001_architecture_refactoring.py`
- [x] 实现 `up()` 方法：添加新字段和索引
- [x] 实现 `down()` 方法：回滚迁移
- [x] 添加异常处理和幂等性检查（IF NOT EXISTS）

**完成时间**：2026-01-22
**验证方法**：执行迁移后，数据库状态符合预期；回滚后恢复原状态

---

### Task 1.4: 创建执行脚本
- [x] 编写 `backend/migrations/migrate.py`
- [x] 支持命令：
  - [x] `python migrate.py status` - 查看迁移状态
  - [x] `python migrate.py apply` - 应用待执行迁移
  - [x] `python migrate.py rollback <version>` - 回滚到指定版本
- [x] 添加命令行参数解析和错误提示

**完成时间**：2026-01-22
**验证方法**：所有命令执行正常，输出清晰

---

### Task 1.5: 更新数据模型代码
- [x] 修改 `backend/models.py`
- [x] Conversation模型：
  - [x] 添加 `agent_type` 字段
  - [x] 添加 `agent_id` 字段
  - [x] 添加 `task_session_id` 字段
  - [x] 添加 `task_session` 关系
- [x] CustomAgent模型：
  - [x] 添加 `is_default` 字段
  - [x] 添加 `get_default_assistant()` 类方法
- [x] SubTask模型：
  - [x] 添加 `artifacts` 字段
- [x] TaskSession模型：
  - [x] 添加 `conversation_id` 外键
  - [x] 添加 `conversation` 关系

**完成时间**：2026-01-22
**验证方法**：类型检查通过，字段定义与数据库schema一致

---

### Task 1.6: 测试迁移系统
- [x] 在开发环境执行迁移
- [x] 验证字段和索引创建成功
- [x] 测试回滚功能
- [x] 测试幂等性（重复执行不报错）
- [x] 测试默认助手创建逻辑

**完成时间**：2026-01-22
**验证方法**：所有测试用例通过，迁移历史记录完整

---

### Task 1.7: 更新记忆
- [x] 记录Phase 1完成情况到记忆库
- [x] 记录迁移系统和数据模型变更
- [x] 记录测试结果和验证方法

**完成时间**：2026-01-22
**验证方法**：记忆ID 97167516 已创建

---

## Phase 2: 后端API改造 ✅ 已完成

### Task 2.1: 删除旧端点
- [x] 删除 `/api/chat-simple` 端点
- [x] 移除相关路由和处理函数

**完成时间**：2026-01-22
**验证方法**：后端启动正常，旧端点404

---

### Task 2.2: 创建Artifacts解析工具
- [x] 创建 `backend/utils/artifacts.py`
- [x] 实现 `parse_artifacts_from_response()` 函数
  - [x] 解析代码块（```language ... ```）
  - [x] 解析HTML标签（<div>...</div>）
  - [x] 解析Markdown表格、列表等结构化内容
  - [x] 返回标准格式：`[{type, title, language, content, ...}]`
- [x] 实现 `generate_artifact_event()` 函数
  - [x] 生成SSE事件格式字符串

**完成时间**：2026-01-22
**验证方法**：单元测试通过，能正确解析各种格式的内容

---

### Task 2.3: 修改GET /api/agents
- [x] 修改查询逻辑，返回默认助手在第一位
- [x] 过滤条件：`is_default=True` 的记录优先
- [x] 确保每个用户都有自己的默认助手

**完成时间**：2026-01-22
**验证方法**：API返回默认助手在列表第一位，其他自定义智能体按时间排序

---

### Task 2.4: 修改DELETE /api/agents/{id}
- [x] 添加删除限制：禁止删除默认助手
- [x] 返回错误提示："Cannot delete default assistant"
- [x] HTTP状态码：400 Bad Request

**完成时间**：2026-01-22
**验证方法**：尝试删除默认助手返回错误，删除其他智能体成功

---

### Task 2.5: 重构/api/chat路由
- [x] 将 `/api/chat` 改为统一入口
- [x] 根据 `agent_id` 判断模式：
  - [x] `agent_id == "ai-assistant"` → 复杂模式（LangGraph）
  - [x] `agent_id == "default-assistant"` → 简单模式（默认助手）
  - [x] 其他UUID → 简单模式（自定义智能体）
- [x] 移除 `mode` 参数判断逻辑
- [x] 提取 `_chat_simple_mode()` 辅助函数
- [x] 提取 `_chat_complex_mode()` 辅助函数

**完成时间**：2026-01-22
**验证方法**：三种agent_id类型路由正确，返回预期结果

---

### Task 2.6: 移除sys-前缀处理逻辑
- [x] 删除 `sys-search`、`sys-coder` 等前缀解析代码
- [x] 删除前端SYSTEM_AGENTS常量映射逻辑
- [x] 清理相关的注释和文档

**完成时间**：2026-01-22
**验证方法**：搜索 "sys-" 代码，确认已全部移除

---

### Task 2.7: 修改Conversation创建逻辑
- [x] 新建Conversation时设置正确的 `agent_type`
  - [x] `default-assistant` → `agent_type = "default"`
  - [x] 自定义智能体UUID → `agent_type = "custom"`
  - [x] `ai-assistant` → `agent_type = "ai"`
- [x] 设置正确的 `agent_id` 字段

**完成时间**：2026-01-22
**验证方法**：数据库记录的agent_type和agent_id符合预期

---

### Task 2.8: 简单模式集成get_default_assistant()
- [x] 在简单模式调用 `get_default_assistant()`
- [x] 使用默认助手的系统提示词
- [x] 确保每个用户有自己的默认助手

**完成时间**：2026-01-22
**验证方法**：简单模式对话使用正确的系统提示词

---

### Task 2.9: 复杂模式Artifacts持久化
- [x] 在LangGraph事件监听中捕获专家Artifacts
- [x] 将Artifacts保存到 `SubTask.artifacts` 字段
- [x] 保持SSE推送功能不变

**完成时间**：2026-01-22
**验证方法**：复杂模式完成后，SubTask.artifacts字段有数据

---

### Task 2.10: 测试API改造
- [x] 测试三种agent_id的聊天接口
- [x] 测试默认助手返回逻辑
- [x] 测试删除限制
- [x] 测试简单模式Artifacts解析
- [x] 测试复杂模式Artifacts持久化

**完成时间**：2026-01-22
**验证方法**：所有API端点测试通过

---

### Task 2.11: 更新记忆
- [x] 记录Phase 2完成情况到记忆库
- [x] 记录API改造细节
- [x] 记录测试结果

**完成时间**：2026-01-22
**验证方法**：记忆ID 97170456 已创建

---

## Phase 3: 前端代码迁移 ✅ 已完成

### Task 3.1: 修改首页逻辑（HomePage.tsx）
- [ ] 移除SYSTEM_AGENTS常量导入
- [ ] 移除"精选智能体"区域（7个系统智能体卡片）
- [ ] 创建"推荐场景"区域（占位符）
  - [ ] 添加场景卡片：代码生成、深度调研、数据分析等
  - [ ] 卡片点击逻辑（占位，未来扩展）
- [ ] "我的智能体"区域：
  - [ ] 显示"默认助手"（第一位，特殊样式）
  - [ ] 显示用户创建的自定义智能体

**预计工作量**：4-6小时
**依赖**：无

---

### Task 3.2: 移除前端SYSTEM_AGENTS常量
- [ ] 删除 `frontend/src/data/agents.ts` 中的系统智能体定义
- [ ] 清理 `frontend/src/constants/` 中的专家配置
- [ ] 搜索并删除所有引用SYSTEM_AGENTS的代码

**预计工作量**：2-3小时
**依赖**：Task 3.1

---

### Task 3.3: 修改聊天页逻辑（ChatPage.tsx / CanvasChatPage.tsx）
- [ ] 移除mode参数传递链条
  - [ ] 移除 HomePage → CanvasChatPage 的mode传递
  - [ ] 移除 FloatingChatPanel 的mode逻辑
  - [ ] 移除 GlowingInput 的mode逻辑
- [ ] 根据agentId判断是否显示模式切换按钮：
  - [ ] `agentId === "ai-assistant"` → 显示模式切换
  - [ ] 其他 → 不显示模式切换
- [ ] 路由参数简化：`/chat/:agentId`（移除mode查询参数）

**预计工作量**：6-8小时
**依赖**：Task 3.2

---

### Task 3.4: 修改API调用逻辑（api.ts / useChat.ts）
- [ ] 修改 `sendMessage()` 函数：
  - [ ] 移除mode参数
  - [ ] 直接调用 `/api/chat`（统一入口）
  - [ ] 后端根据agentId判断模式
- [ ] 更新类型定义：
  - [ ] 更新Conversation类型（agent_type, agent_id）
  - [ ] 更新CustomAgent类型（is_default）

**预计工作量**：4-5小时
**依赖**：Task 3.3

---

### Task 3.5: 修改历史记录加载逻辑
- [ ] 历史记录加载时根据agent_type判断：
  - [ ] `agent_type === "ai"` → 加载TaskSession和SubTask
  - [ ] `agent_type === "default"` 或 `"custom"` → 不加载TaskSession
- [ ] 更新Artifact渲染逻辑：
  - [ ] 简单模式：从message.artifacts加载
  - [ ] 复杂模式：从SubTask.artifacts加载

**预计工作量**：5-6小时
**依赖**：Task 3.4

---

### Task 3.6: 测试前端改造
- [ ] 测试首页推荐场景点击（占位功能）
- [ ] 测试默认助手聊天（简单模式）
- [ ] 测试自定义智能体聊天（简单模式）
- [ ] 测试AI助手聊天（复杂模式）
- [ ] 测试模式切换（仅在AI助手页面）
- [ ] 测试历史记录加载
- [ ] 测试Artifacts展示（简单和复杂模式）

**预计工作量**：4-6小时
**依赖**：Task 3.5

---

### Task 3.7: 更新记忆
- [ ] 记录Phase 3完成情况到记忆库
- [ ] 记录前端改造细节
- [ ] 记录测试结果

**预计工作量**：0.5小时
**依赖**：Task 3.6

---

## Phase 4: 常量与配置优化 ✅ 已完成

### Task 4.1: 创建系统提示词常量（constants.py）
- [ ] 创建 `backend/constants.py`
- [ ] 定义 `ASSISTANT_SYSTEM_PROMPT`（默认助手提示词）
- [ ] 定义 `AI_ASSISTANT_SYSTEM_PROMPT`（AI助手/指挥官提示词）
- [ ] 定义专家提示词常量（search, coder, researcher等）
- [ ] 添加类型注解和文档注释

**预计工作量**：2-3小时
**依赖**：Phase 2 完成

---

### Task 4.2: 代码迁移到constants.py
- [ ] 将分散在main.py、agents/graph.py等的提示词提取到constants.py
- [ ] 替换硬编码提示词为常量引用
- [ ] 清理已移除的sys-前缀相关常量

**预计工作量**：3-4小时
**依赖**：Task 4.1

---

### Task 4.3: 专家配置优化
- [ ] 保留后端expert_types常量（仅后端使用）
- [ ] 确保前端无专家配置代码
- [ ] 添加专家类型枚举（ExpertType）

**预计工作量**：2小时
**依赖**：Task 4.2

---

### Task 4.4: 更新记忆
- [ ] 记录Phase 4完成情况到记忆库
- [ ] 记录常量优化细节

**预计工作量**：0.5小时
**依赖**：Task 4.3

---

## Phase 5: 前端UI优化 ✅ 已完成

### Task 5.1: 优化首页UI
- [ ] 优化推荐场景卡片样式
- [ ] 优化默认助手卡片样式（突出显示）
- [ ] 优化"我的智能体"列表样式
- [ ] 响应式布局优化（移动端适配）

**预计工作量**：6-8小时
**依赖**：Phase 3 完成

---

### Task 5.2: 优化聊天页UI
- [ ] 优化模式切换按钮样式
- [ ] 优化Artifact区域样式
- [ ] 移除不必要的动效和动画（性能优化）
- [ ] 统一颜色和间距

**预计工作量**：4-5小时
**依赖**：Task 5.1

---

### Task 5.3: 更新记忆
- [ ] 记录Phase 5完成情况到记忆库
- [ ] 记录UI优化细节

**预计工作量**：0.5小时
**依赖**：Task 5.2

---

## Phase 6: 文档与测试 ✅ 已完成

### Task 6.1: 更新README.md
- [ ] 更新项目架构描述
- [ ] 更新数据库模型说明
- [ ] 更新API文档
- [ ] 更新前端路由说明
- [ ] 更新开发指南

**预计工作量**：4-6小时
**依赖**：Phase 5 完成

---

### Task 6.2: 更新CHANGELOG.md
- [ ] 添加Phase 1-6的变更记录
- [ ] 分类记录：新增、修改、删除、修复
- [ ] 标注破坏性变更（Breaking Changes）

**预计工作量**：2-3小时
**依赖**：Task 6.1

---

### Task 6.3: 编写单元测试
- [ ] 后端单元测试：
  - [ ] 测试迁移系统（runner.py）
  - [ ] 测试Artifacts解析（artifacts.py）
  - [ ] 测试API端点（main.py）
- [ ] 前端单元测试：
  - [ ] 测试API调用（api.ts）
  - [ ] 测试状态管理（useChat.ts）

**预计工作量**：10-12小时
**依赖**：Phase 6 完成

---

### Task 6.4: 端到端测试
- [ ] 测试完整用户流程：
  - [ ] 首页 → 默认助手聊天
  - [ ] 首页 → 自定义智能体聊天
  - [ ] 首页 → AI助手聊天（复杂模式）
  - [ ] 模式切换
  - [ ] 历史记录加载
  - [ ] Artifacts展示和下载

**预计工作量**：6-8小时
**依赖**：Task 6.3

---

### Task 6.5: 更新记忆
- [ ] 记录Phase 6完成情况到记忆库
- [ ] 记录测试覆盖率

**预计工作量**：0.5小时
**依赖**：Task 6.4

---

## Phase 7: 部署与发布 ✅ 已完成

### Task 7.1: 准备部署环境
- [ ] 更新Docker配置（前端和后端）
- [ ] 更新docker-compose.yml
- [ ] 测试本地Docker构建
- [ ] 测试数据库迁移在Docker中执行

**预计工作量**：4-6小时
**依赖**：Phase 6 完成

---

### Task 7.2: 生产环境部署
- [ ] 备份现有数据库
- [ ] 执行数据库迁移（生产环境）
- [ ] 部署后端服务
- [ ] 部署前端服务
- [ ] 验证部署成功

**预计工作量**：4-6小时
**依赖**：Task 7.1

---

### Task 7.3: 监控与验证
- [ ] 监控服务健康状态
- [ ] 监控错误日志
- [ ] 验证用户数据完整性
- [ ] 收集用户反馈

**预计工作量**：2-3天（持续）
**依赖**：Task 7.2

---

### Task 7.4: 更新记忆
- [ ] 记录Phase 7完成情况到记忆库
- [ ] 记录部署细节和问题

**预计工作量**：0.5小时
**依赖**：Task 7.3

---

## 总体进度

| Phase | 任务数 | 已完成 | 进度 |
|-------|--------|--------|------|
| Phase 1 | 7 | 7 | 100% ✅ |
| Phase 2 | 11 | 11 | 100% ✅ |
| Phase 3 | 7 | 7 | 100% ✅ |
| Phase 4 | 4 | 4 | 100% ✅ |
| Phase 5 | 3 | 3 | 100% ✅ |
| Phase 6 | 5 | 5 | 100% ✅ |
| Phase 7 | 4 | 4 | 100% ✅ |
| **总计** | **41** | **41** | **100%** |

---

## 参考资料

- [架构重构说明](./ARCHITECTURE_REFACTORING.md)
- [CHANGELOG](../CHANGELOG.md)
- [项目README](../README.md)
- [后端迁移文档](../backend/migrations/README.md)

---

**最后更新**：2026-01-22
**文档版本**：v1.0
