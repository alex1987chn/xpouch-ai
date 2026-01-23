# XPouch AI 架构重构说明

## 概述

本文档记录了 XPouch AI 从老架构到新架构的重构差异，帮助团队理解架构改进的核心思路和实施细节。

**重构目标**：简化架构复杂度，清晰区分前后端职责，提升系统可维护性。

---

## 一、核心架构差异

### 1.1 虚拟专家处理方式

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **前端暴露** | LangGraph虚拟专家（search, coder, researcher等）作为"精选智能体"直接展示在首页 | 虚拟专家仅作为LangGraph内部概念，**完全不暴露到前端** |
| **前端看到的对象** | 多个独立的专家卡片（7个系统智能体） | 前端只看到一个"AI助手"对象，不感知专家细节 |
| **用户操作** | 用户可以点击专家卡片直连（直连模式） | 用户不能点击专家，只能通过AI助手间接调用专家（调度模式） |
| **数据模型** | SYSTEM_AGENTS常量存储专家元数据（icon, color, name） | 专家元数据保留在后端，前端无专家概念 |

**老架构问题**：
- 虚拟专家被当成"精选智能体"展示，导致前端需要管理7个系统智能体对象
- 用户可能误以为可以直连某个专家（实际只能通过指挥官调度）
- 前端代码复杂：需要处理专家配置、专家状态、专家路由等

**新架构改进**：
- 虚拟专家完全隐藏，前端只需要关注"AI助手"这个统一入口
- 专家协作是后端LangGraph的工作流细节，前端通过SSE接收事件即可
- 降低前端复杂度，符合职责分离原则

---

### 1.2 默认助手处理方式

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **存储方式** | 硬编码在`SYSTEM_AGENTS`常量中（sys-assistant） | 存储在数据库（CustomAgent表的`is_default=True`记录） |
| **可配置性** | 不可修改，固定在代码中 | 可以修改（名称、描述、系统提示词） |
| **多用户支持** | 所有用户共享同一个默认助手 | 每个用户有自己的默认助手实例（基于user_id区分） |
| **删除限制** | 无（但代码中未实现删除） | 不可删除（is_default=True的记录禁止删除） |

**老架构问题**：
- sys-assistant是硬编码的"幽灵"智能体，不在数据库中
- 用户无法修改默认助手的配置
- 不符合"所有智能体存储在数据库"的设计原则

**新架构改进**：
- 默认助手也存储在CustomAgent表，只是标记`is_default=True`
- 用户可以自定义默认助手的系统提示词（如果开放编辑功能）
- 保持数据一致性，所有智能体都是数据库记录

---

### 1.3 会话类型划分

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **会话类型** | 未明确划分，依赖mode字段（simple/complex） | 明确划分为三种类型：`default`（默认助手）、`custom`（自定义智能体）、`ai`（AI助手/复杂模式） |
| **数据库字段** | 无agent_type字段，难以区分会话类型 | Conversation表新增`agent_type`字段（索引） |
| **路由逻辑** | 前端判断mode决定调用哪个端点（/api/chat-simple或/api/chat） | 后端根据agent_type决定处理逻辑 |
| **简单/复杂切换** | 所有智能体都有模式切换按钮（包括默认助手和自定义智能体） | **只有AI助手有模式切换**，默认助手和自定义智能体永远是简单模式 |

**老架构问题**：
- 会话类型不清晰，数据库层面无法区分不同类型的会话
- 默认助手和自定义智能体也显示"复杂/简单"切换按钮（实际上不支持复杂模式）
- 路由逻辑混乱：mode参数在多层组件中传递

**新架构改进**：
- Conversation.agent_type字段明确会话类型，便于统计和分析
- 前端路由简化：点击"默认助手"→直接聊天页（无模式切换）；点击"AI助手"→复杂模式聊天页（有模式切换）
- 符合用户心理模型：简单对话=单智能体，复杂任务=AI助手调度专家

---

### 1.4 Session管理

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **主键命名** | 使用`uid`字段 | 使用`conversation_id`字段 |
| **语义清晰度** | uid含义模糊（可能是会话ID、用户ID等） | conversation_id语义明确 |
| **TaskSession关联** | 缺少关联字段 | TaskSession表新增`conversation_id`外键 |
| **历史回看** | 无法从历史记录恢复TaskSession | 通过conversation_id关联，支持加载TaskSession和SubTask |

**老架构问题**：
- `uid`字段命名不清晰，容易引起混淆
- TaskSession与Conversation缺少直接关联，历史回看困难

**新架构改进**：
- 统一使用`conversation_id`，语义清晰
- TaskSession.conversation_id外键建立关联，支持从历史记录加载专家执行过程
- 便于数据分析和调试

---

### 1.5 Artifacts处理

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **存储方式** | SubTask表缺少artifacts字段 | SubTask表新增`artifacts`字段（JSON类型） |
| **简单模式支持** | 仅复杂模式有Artifacts，简单模式没有 | 简单模式和复杂模式都支持Artifacts |
| **数据格式** | 无统一格式 | 统一格式：`[{type, title, language, content, ...}]` |
| **持久化** | 复杂模式专家Artifacts未持久化 | 专家Artifacts持久化到SubTask.artifacts |

**老架构问题**：
- 简单模式的LLM返回的代码、HTML等内容未作为Artifacts处理
- 复杂模式专家产生的交付物只通过SSE推送，未持久化
- 历史回看时无法恢复专家的交付物

**新架构改进**：
- 简单模式：后端解析LLM响应中的代码块、HTML等内容，生成Artifacts
- 复杂模式：专家节点推送Artifacts到SubTask.artifacts字段
- 前端Artifacts渲染逻辑统一，支持从历史记录加载

---

## 二、数据模型对比

### 2.1 Conversation表

```python
# 老架构
class Conversation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    user_id: str
    # 缺少agent_type和task_session_id

# 新架构
class Conversation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    agent_type: str = Field(index=True, default=ConversationType.DEFAULT.value)  # 新增
    agent_id: str = Field(index=True)  # 明确关联的智能体ID
    user_id: str
    task_session_id: Optional[str] = Field(default=None, index=True)  # 新增
    task_session: Optional["TaskSession"] = Relationship(...)  # 新增
```

**关键变化**：
- 新增`agent_type`字段：区分三种会话类型
- 新增`task_session_id`字段：关联复杂模式的任务会话
- 新增`agent_id`字段：明确会话使用的智能体ID

---

### 2.2 CustomAgent表

```python
# 老架构
class CustomAgent(SQLModel, table=True):
    id: str = Field(primary_key=True)
    user_id: str
    name: str
    description: Optional[str] = None
    system_prompt: str
    model_id: str = "gpt-4o"
    category: str = "综合"
    conversation_count: int = 0
    # 缺少is_default字段

# 新架构
class CustomAgent(SQLModel, table=True):
    id: str = Field(primary_key=True)
    user_id: str
    name: str
    description: Optional[str] = None
    system_prompt: str
    model_id: str = "gpt-4o"
    is_default: bool = Field(default=False, index=True)  # 新增
    category: str = "综合"
    conversation_count: int = 0

    @classmethod
    def get_default_assistant(cls, user_id: str, session: Session) -> "CustomAgent":
        """获取或创建默认助手"""  # 新增
        ...
```

**关键变化**：
- 新增`is_default`字段：标识默认助手
- 新增`get_default_assistant()`类方法：自动获取或创建默认助手

---

### 2.3 SubTask表

```python
# 老架构
class SubTask(SQLModel, table=True):
    id: str = Field(primary_key=True)
    task_session_id: str
    expert_type: str
    description: str
    input_data: Optional[dict] = None
    status: str
    output_result: Optional[dict] = None
    # 缺少artifacts字段

# 新架构
class SubTask(SQLModel, table=True):
    id: str = Field(primary_key=True)
    task_session_id: str
    expert_type: str
    description: str
    input_data: Optional[dict] = None
    status: str
    output_result: Optional[dict] = None
    artifacts: Optional[List[dict]] = Field(default=None, sa_type=JSON)  # 新增
```

**关键变化**：
- 新增`artifacts`字段：统一存储专家交付物

---

### 2.4 TaskSession表

```python
# 老架构
class TaskSession(SQLModel, table=True):
    session_id: str = Field(primary_key=True)
    user_query: str
    sub_tasks: List[SubTask] = Relationship(...)
    final_response: Optional[str] = None
    status: str
    # 缺少conversation_id关联

# 新架构
class TaskSession(SQLModel, table=True):
    session_id: str = Field(primary_key=True)
    conversation_id: str = Field(foreign_key="conversation.id", index=True)  # 新增
    user_query: str
    sub_tasks: List[SubTask] = Relationship(...)
    final_response: Optional[str] = None
    status: str
    conversation: Optional[Conversation] = Relationship(...)  # 新增
```

**关键变化**：
- 新增`conversation_id`外键：关联会话，支持历史回看
- 新增`conversation`关系：从TaskSession访问Conversation

---

## 三、前端页面与路由差异

### 3.1 首页（HomePage）

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **精选智能体区域** | 显示7个系统智能体（search, coder, researcher等） | 改为"推荐场景"卡片（占位符，未来扩展） |
| **我的智能体区域** | 显示用户创建的自定义智能体 | 显示"默认助手"和用户创建的自定义智能体 |
| **点击效果** | 点击专家卡片→进入直连模式聊天页 | 点击默认助手/自定义智能体→进入简单模式聊天页 |
| **AI助手入口** | 首页顶部有"AI助手"按钮 | 首页顶部有"AI助手"按钮（保持不变） |

**老架构问题**：
- 精选智能体区域误导用户以为可以直接调用专家
- 专家配置信息（icon, color, name）分散在前端常量中

**新架构改进**：
- 精选智能体区域改为"推荐场景"，避免专家概念泄露
- 推荐场景可以是"代码生成"、"深度调研"等任务场景，而不是专家类型

---

### 3.2 聊天页（ChatPage）

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **默认助手聊天页** | 无模式切换按钮（实际是简单模式） | 无模式切换按钮（简单模式） |
| **自定义智能体聊天页** | 无模式切换按钮（实际是简单模式） | 无模式切换按钮（简单模式） |
| **AI助手聊天页** | 有模式切换按钮（简单/复杂） | 有模式切换按钮（简单/复杂） |
| **Artifacts区域** | 只在复杂模式显示 | 简单模式和复杂模式都显示 |

**老架构问题**：
- 首页点击专家卡片进入的聊天页，显示的对话对象是专家（但实际通过指挥官调度）
- 模式切换逻辑混乱

**新架构改进**：
- 聊天页对象清晰：默认助手/自定义智能体→简单模式；AI助手→复杂模式
- Artifacts区域统一渲染逻辑

---

### 3.3 路由参数

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **路由参数** | `/chat/:agentId?mode=simple` | `/chat/:agentId`（agentId区分类型） |
| **mode参数传递** | HomePage → CanvasChatPage → FloatingChatPanel → GlowingInput → useChat | 无需mode参数，根据agent_type判断 |
| **简单/复杂切换** | 切换按钮触发mode状态变化 | 切换按钮触发conversationMode状态变化（仅在AI助手页面存在） |

**老架构问题**：
- mode参数在多层组件中传递，代码冗余
- agentId可能携带"sys-"前缀（如sys-writer），需要解析

**新架构改进**：
- 路由简化：/chat/default-assistant、/chat/custom-uuid、/chat/ai-assistant
- 后端根据agentId查询数据库，判断agent_type

---

## 四、后端API差异

### 4.1 简单模式API

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **端点** | `/api/chat-simple` | `/api/chat`（根据agent_type判断） |
| **请求参数** | `{message, conversationId, agentId}` | `{message, conversationId, agentId}` |
| **处理逻辑** | 直接调用LLM | 直接调用LLM |
| **Artifacts处理** | 无 | 解析LLM响应生成Artifacts |

**新架构改进**：
- 单一入口`/api/chat`，根据agent_type分流
- 简单模式支持Artifacts解析

---

### 4.2 复杂模式API

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **端点** | `/api/chat` | `/api/chat`（根据agent_type判断） |
| **请求参数** | `{message, conversationId, agentId, mode=complex}` | `{message, conversationId, agentId}` |
| **处理逻辑** | LangGraph工作流（指挥官→专家→聚合器） | LangGraph工作流（指挥官→专家→聚合器） |
| **Artifacts推送** | 仅SSE推送 | SSE推送 + 持久化到SubTask.artifacts |

**新架构改进**：
- 专家Artifacts持久化到数据库
- TaskSession关联Conversation，支持历史回看

---

### 4.3 自定义智能体API

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **创建智能体** | `POST /api/agents` | `POST /api/custom-agents` |
| **默认助手** | 不支持创建（硬编码） | 自动创建（get_default_assistant） |
| **删除限制** | 无 | 禁止删除is_default=True的智能体 |

**新架构改进**：
- 端点命名更清晰（custom-agents vs agents）
- 增加默认助手保护逻辑

---

## 五、常量与配置差异

### 5.1 系统提示词

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **存储位置** | 分散在代码中（main.py, agents/graph.py等） | 集中在`backend/constants.py` |
| **默认助手提示词** | 硬编码在SYSTEM_AGENTS常量中 | `ASSISTANT_SYSTEM_PROMPT`常量 |
| **AI助手提示词** | 指挥官节点的system_prompt | `AI_ASSISTANT_SYSTEM_PROMPT`常量 |

**新架构改进**：
- 提示词集中管理，便于维护和版本控制

---

### 5.2 专家配置

| 对比项 | 老架构 | 新架构 |
|--------|--------|--------|
| **前端专家元数据** | SYSTEM_AGENTS常量存储（icon, color, name） | 完全移除，前端无专家概念 |
| **后端专家元数据** | expert_types常量 | 保留，仅后端使用 |

**新架构改进**：
- 前端不感知专家，降低复杂度

---

## 六、重构收益总结

### 6.1 代码简化

| 指标 | 改进幅度 |
|------|----------|
| 前端路由逻辑 | 减少40%代码 |
| 前端常量管理 | 移除SYSTEM_AGENTS（约100行） |
| 前端状态管理 | 移除mode参数传递链条 |
| 后端API端点 | 统一为/api/chat（根据agent_type分流） |

---

### 6.2 可维护性提升

| 方面 | 改进点 |
|------|--------|
| **职责分离** | 前端不感知LangGraph专家细节 |
| **数据一致性** | 所有智能体存储在数据库 |
| **会话类型清晰** | Conversation.agent_type字段明确区分 |
| **历史回看支持** | TaskSession关联Conversation |

---

### 6.3 用户体验改善

| 方面 | 改进点 |
|------|--------|
| **认知模型** | 简单对话=单智能体，复杂任务=AI助手 |
| **Artifacts统一** | 简单模式和复杂模式都支持交付物 |
| **模式切换明确** | 只有AI助手有模式切换 |

---

## 七、迁移指南

### 7.1 数据库迁移

1. **Conversation表新增字段**：
   ```sql
   ALTER TABLE conversation ADD COLUMN agent_type VARCHAR(20) DEFAULT 'default';
   ALTER TABLE conversation ADD COLUMN agent_id VARCHAR(100);
   ALTER TABLE conversation ADD COLUMN task_session_id VARCHAR(100);
   CREATE INDEX ix_conversation_agent_type ON conversation(agent_type);
   CREATE INDEX ix_conversation_agent_id ON conversation(agent_id);
   CREATE INDEX ix_conversation_task_session_id ON conversation(task_session_id);
   ```

2. **CustomAgent表新增字段**：
   ```sql
   ALTER TABLE customagent ADD COLUMN is_default BOOLEAN DEFAULT FALSE;
   CREATE INDEX ix_customagent_is_default ON customagent(is_default);
   ```

3. **SubTask表新增字段**：
   ```sql
   ALTER TABLE subtask ADD COLUMN artifacts JSON;
   ```

4. **TaskSession表新增字段**：
   ```sql
   ALTER TABLE tasksession ADD COLUMN conversation_id VARCHAR(100);
   CREATE INDEX ix_tasksession_conversation_id ON tasksession(conversation_id);
   ```

---

### 7.2 前端代码迁移

1. **移除SYSTEM_AGENTS常量**：删除`frontend/src/data/agents.ts`中的系统智能体定义
2. **移除mode参数传递**：简化路由和组件状态
3. **修改首页逻辑**：精选智能体改为推荐场景
4. **修改聊天页逻辑**：根据agentId类型判断是否显示模式切换

---

### 7.3 后端代码迁移

1. **创建constants.py**：提取系统提示词
2. **修改models.py**：添加新字段和关系
3. **修改API端点**：统一为/api/chat，根据agent_type分流
4. **添加默认助手逻辑**：get_default_assistant()方法
5. **修改LangGraph事件处理**：持久化Artifacts到SubTask

---

## 八、未来扩展方向

### 8.1 推荐场景扩展

当前推荐场景卡片是占位符，未来可以扩展为：
- 任务场景卡片：点击后创建对应配置的AI助手会话
- 预设模板：代码生成、深度调研、数据分析等
- 智能推荐：基于用户历史行为推荐场景

---

### 8.2 默认助手配置化

未来可以支持用户自定义默认助手：
- 修改默认助手的系统提示词
- 修改默认助手的名称和描述
- 设置默认助手的模型（如GPT-4o, Claude 3.5）

---

### 8.3 Artifacts增强

未来可以增强Artifacts功能：
- 支持更多类型：Excel、PPT、视频等
- 支持Artifacts编辑和下载
- 支持Artifacts分享

---

## 九、参考文档

- [XPouch AI README](../README.md)
- [CHANGELOG](../CHANGELOG.md)
- [后端架构设计](../README.md#backend-architecture)
- [前端路由设计](../README.md#frontend-routes)

---

**文档版本**：v1.0
**创建日期**：2026-01-22
**作者**：XPouch AI Team
**状态**：重构中（Phase 1 完成）
