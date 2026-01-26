# CHANGELOG - ARCHIVED

This file contains historical changelog entries for XPouch AI.
For recent changes, please see [CHANGELOG.md](./CHANGELOG.md).

---

## [v0.2.2] - 2026-01-17 (详细版本)

### 🧠 指挥官工作流实现 (第二步)

**核心组件** (`backend/agents/graph.py`):

**AgentState 定义**:
- `messages`: 消息历史（支持 add_messages）
- `task_list`: 子任务列表
- `current_task_index`: 当前任务索引
- `strategy`: 执行策略
- `expert_results`: 专家执行结果汇总
- `final_response`: 最终整合的响应

**指挥官节点 (commander_node)**:
- 功能：分析用户查询，拆解为多个子任务
- 输出：`CommanderOutput` (tasks 列表, strategy, estimated_steps)
- 兼容性：使用 JSON 解析替代 `with_structured_output()`（支持 DeepSeek API）

**专家分发器 (expert_dispatcher_node)**:
- 功能：根据 `current_task_index` 循环分发任务到对应专家
- 支持专家：search, coder, researcher, analyzer, writer, planner
- 专家实现：通用 LLM 调用，使用不同提示词

**聚合器节点 (aggregator_node)**:
- 功能：整合所有专家执行结果，生成最终响应
- 入入：expert_results 列表
- 输出：连贯、有用的最终答案

**路由逻辑 (route_commander)**:
- 条件边：检查 `task_list` 和 `current_task_index`
- 路径：commander → expert_dispatcher（循环）→ aggregator → END

**工作流编译** (`create_commander_workflow`):
- 状态图：`StateGraph(AgentState)`
- 节点：3 个（commander, expert_dispatcher, aggregator）
- 条件路由：2 处（commander→expert, expert→aggregator/END）

**执行函数** (`execute_commander_workflow`):
- 输入：用户查询（字符串）
- 输出：完整执行结果（包含 task_list, expert_results, final_response）
- 异步支持：`await commander_graph.ainvoke(initial_state)`

**测试脚本** (`backend/test_commander.py`):
- 4 个测试用例（单专家、双专家、多专家协作、研究型任务）
- 验证函数：任务拆解、专家执行、结果聚合
- 交互模式：支持手动输入查询测试
- 简化测试：`quick_test.py`（快速验证核心功能）

### 🔧 技术修复
- **DeepSeek API 兼容性**：移除 `with_structured_output()`，改用 JSON 提示词和解析
- **枚举类型修复**：`ExpertType` 和 `TaskStatus` 改为 `Enum` 类，SQLModel 字段用 `str` 存储
- **LangSmith 集成**：在 graph.py 中加载配置并初始化 tracing
- **Windows GBK 编码**：过滤 emoji，避免控制台输出错误
- **DTO 枚举修复**：所有 DTO 中的枚举字段改为 `str` 类型

### 🧪 测试验证结果
- ✅ 指挥官节点：成功拆解查询为 4 个子任务
- ✅ 路由逻辑：正确循环分发任务
- ✅ 专家执行：3/4 专家成功执行（WRITER 因网络问题失败）
- ✅ 聚合器：成功整合结果（3217 字符响应）

### 📦 文件变更统计
- 重写 1 个文件：`agents/graph.py` (580+ 行)
- 新增 2 个测试文件：`test_commander.py`, `quick_test.py`
- 修改 2 个文件：`models.py` (枚举修复), `config.py` (emoji 修复)

---

## [v0.2.2] - 2026-01-17 (架构优化)

### 🔧 架构优化：通用 JSON 解析器

**新增工具** (`backend/utils/json_parser.py`):

**核心功能**:
- `parse_llm_json()`: 通用 LLM JSON 响应解析器
  - 支持 Markdown 代码块清理（```json ... ```）
  - 自动提取 JSON 内容（处理前后缀文本）
  - Pydantic 模型验证
  - 清理常见格式问题（尾部逗号、注释等）

**辅助函数**:
- `_clean_markdown_blocks()`: 移除 Markdown 代码块标记
- `_extract_json()`: 从文本中提取 JSON 内容
- `_clean_json_format()`: 清理 JSON 格式问题
- `_fix_and_parse()`: 尝试修复并解析 JSON 数据
- `extract_json_blocks()`: 提取所有 JSON 代码块
- `is_valid_json()`: 检查内容是否为有效 JSON

**架构优势**:
1. **模型无关性**: 兼容所有 LLM（DeepSeek, GPT-4, Claude 等）
2. **Prompt 控制权**: 100% 可见和控制发送给模型的指令
3. **调试友好**: 清晰的解析流程，易于定位问题
4. **可扩展性**: 为未来更换模型提供"一键切换"能力
5. **一致性**: 图状态保持不变，后续节点使用标准 Pydantic 对象

**graph.py 改进**:
- 移除内联 JSON 解析代码
- 使用 `parse_llm_json()` 替代手动正则匹配
- 清晰的专家类型说明（search/coder/researcher/analyzer/writer/planner）
- 简化提示词，去除冗余格式说明

### 📦 文件变更统计
- 新增 1 个工具文件：`utils/json_parser.py` (230+ 行)
- 更新 1 个文件：`agents/graph.py` (使用新解析器)

---

## [v0.2.2] - 2026-01-17 (专家池与结果汇总)

**专家节点实现** (`backend/agents/experts.py`, 370+ 行):

**核心专家节点**:
- `search_expert()`: 信息搜索专家
  - 搜索并整理相关信息
  - 提供可靠的信息来源
  - 结构化的输出格式

- `coder_expert()`: 编程专家
  - 编写清晰、高效的代码
  - 确保可读性和可维护性
  - 提供代码注释和使用示例

- `researcher_expert()`: 研究专家
  - 进行深入的文献和技术调研
  - 比较不同方法的优劣
  - 提供研究建议和方向

- `analyzer_expert()`: 分析专家
  - 逻辑严密的分析和推理
  - 识别关键因素和数据驱动洞察
  - 评估方案可行性

- `writer_expert()`: 写作专家
  - 创作生动、优美的内容
  - 确保逻辑性和连贯性
  - 适应目标受众需求

- `planner_expert()`: 规划专家
  - 制定详细的执行计划
  - 识别步骤和依赖关系
  - 提供风险预案

**专家提示词模板**:
- `EXPERT_PROMPTS`: 包含 6 个专家的系统提示词
- 每个专家有明确的职责和输出要求
- 结构化的任务执行流程

**专家分发器**:
- `dispatch_to_expert()`: 统一的专家调用入口
- `EXPERT_FUNCTIONS`: 专家类型到函数的映射
- 自动路由到对应的专家节点
- 统一的错误处理和结果格式

**Aggregator 改进** (`backend/agents/graph.py`):

**Markdown 响应生成**:
- `_build_markdown_response()`: 构建结构化 Markdown
- 按专家类型分组结果
- 每个专家输出包含：状态、耗时、内容
- 汇总章节：执行总结和后续建议

**响应格式**:
```markdown
# 多专家协作结果

**执行策略**: {strategy}

---

## 搜索结果
### 1. {description}
**状态**: ✅ completed
**耗时**: 2.35 秒

{output}

...

## 汇总
本次协作共调用 N 个专家节点...
```

**graph.py 改进**:
- 移除内联专家执行代码
- 使用 `dispatch_to_expert()` 替代
- 专家结果包含元数据（status, duration_ms, timestamps）
- 聚合器生成结构化 Markdown 响应

**流式测试脚本** (`backend/test_full_workflow.py`, 200+ 行):

**测试模式**:
1. **流式执行** (`astream`):
   - 实时观察节点流转过程
   - 打印每个节点的输入输出
   - 验证最终响应完整性

2. **节点流转测试**:
   - 验证节点执行顺序
   - 检查是否所有预期节点都被访问
   - 比对实际和期望流转路径

3. **LangSmith 追踪测试**:
   - 验证配置是否正确
   - 检查 Trace 是否被记录
   - 提供 LangSmith 控制台链接

4. **全链路测试**:
   - 顺序执行所有测试
   - 验证工作流完整性

**测试输出**:
- 节点访问顺序可视化
- 每个 state 变化的详细打印
- 最终响应预览
- 错误和异常捕获

### 📦 文件变更统计
- 新增 1 个专家文件：`agents/experts.py` (370+ 行)
- 更新 2 个文件：`agents/graph.py` (使用新专家), `CHANGELOG.md`
- 新增 1 个测试文件：`test_full_workflow.py` (200+ 行)

---

## [v0.2.2] - 2026-01-17 (质量保证)

### ✅ 质量保证
- 所有模型遵循 SQLModel + Pydantic v2 规范
- 支持 FastAPI 异步调用
- 完整的类型注解
- 详细的中文注释
- 验证脚本确保数据结构正确

### 🎯 设计理念

**模块化设计**:
- 配置与模型分离
- DTO 与数据库模型分离
- 验证脚本独立

**可扩展性**:
- 专家类型易于扩展
- 支持多种任务状态
- 灵活的 JSON 字段支持任意数据结构

**可追踪性**:
- 完整的时间戳记录
- 任务会话到子任务的完整链路
- LangSmith 集成支持

---

## [v0.2.2] - 2026-01-17 (Docker & 体验优化)

### 🐳 部署与运维
- **Docker 化**：提供了完整的 `Dockerfile` 和 `docker-compose.yml`，支持一键启动前后端。
- **环境自适应**：前端智能判断开发环境（直连后端）与生产环境（Nginx 代理），无需手动修改代码即可部署。
- **Nginx 集成**：前端容器内置 Nginx，处理静态资源服务与 API 反向代理。

### 🎨 UI/UX 优化
- **首页布局**：紧凑化设计，拉近了 Logo 与输入框的距离，提升视觉凝聚力。
- **视觉增强**：
   - 聊天输入框在非激活状态下边框加深，边界更清晰。
   - 聊天顶部栏高度收窄，并增加了精致的毛玻璃 吸顶效果。
   - 首页"我的智能体"切换时增加滚动条预留空间，彻底解决了页面抖动问题。
- **交互细节**：
   - 侧边栏头像菜单加宽，改为长方形布局，更符合桌面端操作习惯。
   - 修复了从首页跳转到对话页时，首条消息可能不显示的 Race Condition 问题。

### 🐛 核心修复
- **后端异步调用**：修复了 FastAPI 与 LangGraph 结合时，因同步调用异步节点导致的 `500 Internal Server Error`。
- **CORS 策略**：完善了跨域资源共享配置，确保本地开发与容器通信畅通。
- **数据关联**：修复了获取会话详情时，后端未加载关联消息 (Lazy Loading) 导致历史记录空白的问题。

---

## [v0.2.0] - 2026-01-16 (架构升级版)

### 🚀 架构升级 (Backend)
- **技术栈迁移**：从 Node.js (Express) 迁移至 **Python (FastAPI)**，充分利用 Python 在 AI 领域的生态优势。
- **LangGraph Python**：重写了智能体工作流 (`graph.py`)，逻辑与原 TS 版保持一致，但更易于扩展。
- **数据持久化**：
   - 引入 **SQLModel (SQLite)** 作为数据库。
   - 实现了 `Conversation` 和 `Message` 的持久化存储。
   - 告别了不可靠的 LocalStorage 存储方案，数据云端（数据库）同步。
- **API 增强**：
   - 新增 RESTful 接口：`GET /conversations` (列表), `GET /conversations/{id}` (详情), `DELETE` (删除)。
   - 实现了更健壮的 **SSE (Server-Sent Events)** 流式输出。

### ⚡️ 前端重构 (Frontend)
- **状态管理**：引入 **Zustand** (`chatStore.ts`) 替代 React Context/State，解决了 Prop Drilling 问题。
- **路由系统**：引入 **React Router** (`react-router-dom`)。
   - 支持通过 URL (`/chat/:id`) 直接访问特定会话。
   - 实现了 `HomePage`, `ChatPage`, `HistoryPage` 的组件解耦。
- **逻辑抽离**：创建自定义 Hook `useChat.ts`，将复杂的发送/接收/流处理逻辑从 UI 组件中剥离。
- **体验优化**：
   - 自动保存会话：发送第一条消息时自动创建会话并更新 URL。
   - 历史记录：从后端实时拉取，支持按时间排序和删除。

### 🐛 修复
- 修复了刷新页面导致聊天记录丢失的问题（得益于数据库集成）。
- 修复了 URL 状态与当前会话不一致的问题。
- 修复了大量 TypeScript 类型定义错误 (`any` 类型减少)。
- 移除了未使用的代码和依赖，减小了包体积。

---

## [v0.1.1] - 2026-01-15 (晚间)

### 新增功能
- **自定义智能体**：实现了用户创建、保存自定义 AI 智能体的完整流程
- **智能体管理**：首页新增 Tab 切换（"精选智能体" vs "我创建的"）
- **真实流式输出**：后端重构为基于 LangGraph `streamEvents` 的 Token 级 SSE 流式传输
- **侧边栏升级**：
   - 新增"创建用户智能体"按钮
   - "回到上一个会话"按钮逻辑优化，准确恢复最近会话
- **流畅动画**：全局过渡动画统一调整为 200ms，优化主题切换体验

### 优化
- **对话体验**：
   - 修复了对话开始时出现"空气泡"和"双重气泡"的视觉问题
   - 移除了 AI 回复中意外出现的内部意图分类前缀（如 `general_chat`）
- **上下文管理**：修复了多轮对话中上下文传递和消息去重的问题
- **导航状态**：优化了侧边栏在不同页面（首页/对话/历史）下的高亮逻辑

### 修复
- 修复了流式输出时 JSON 解析可能导致的乱码问题
- 修复了从历史记录进入会话时侧边栏状态不正确的问题

---

## [v0.1.0] - 2026-01-15 (下午)

### 新增功能
- 实现流式输出效果（SSE 格式）
- 连续对话支持：发送消息后输入框保持 focus 状态
- 历史记录页面：按助手分组的卡片式展示
- 新增"当前对话"按钮，快速回到最近会话
- 四个功能按钮独立切换：首页/当前对话/历史记录/知识库
- 主题切换按钮颜色过渡动画

### 优化
- 侧边栏宽度从 100px 调整为 92px
- 头像大小调整为 40x40px 与功能按钮一致
- 移动端适配优化
- 历史记录重复问题修复
- 点击历史记录进入对话时自动选中"当前对话"按钮

### 修复
- 修复重复保存对话记录的问题
- 修复移动端头像不可见问题
- 修复弹出菜单被遮挡问题
- 修复主题切换闪烁问题

---

## [v0.0.5] - 2026-01-15 (上午)

### 新增功能
- 多智能体系统（8个 AI 助手）
- 响应式设计（移动端/平板/桌面）
- 深色模式支持
- 国际化（中/英/日）
- 流式打字效果

### 优化
- 前端/后端分离的 monorepo 架构
- 代码分割和性能优化
- 错误边界处理

---

## [v0.0.1] - 初始版本

### 新增功能
- 基础聊天功能
- LangGraph 工作流引擎
- 多模型支持（DeepSeek/OpenAI/Anthropic/Google）
