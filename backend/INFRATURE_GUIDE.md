# 超智能体基础设施使用指南

## 📦 概述

本文档说明如何使用新增的基础设施模型（SubTask、TaskSession）以及 LangSmith 追踪配置。

## 🏗️ 数据模型

### 1. SubTask（子任务）

由"指挥官"分发给特定专家的具体任务。

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 子任务唯一标识 |
| `expert_type` | ExpertType | 执行任务的专家类型（search, coder, researcher等） |
| `description` | str | 自然语言描述的任务内容 |
| `input_data` | JSON | 任务参数（可选，Python dict 类型） |
| `status` | TaskStatus | 任务状态（pending/running/completed/failed） |
| `output_result` | JSON | 执行结果（可选，Python dict 类型） |
| `task_session_id` | str | 所属任务会话 ID（外键） |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |
| `started_at` | datetime | 开始时间（可选） |
| `completed_at` | datetime | 完成时间（可选） |

**专家类型**:

```python
ExpertType = Literal[
    "search",      # 信息搜索专家
    "coder",      # 编程专家
    "researcher",  # 研究专家
    "analyzer",    # 分析专家
    "writer",      # 写作专家
    "planner",     # 规划专家
]
```

### 2. TaskSession（任务会话）

记录一次完整的多专家协作过程，包含用户查询、所有子任务和最终响应。

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `session_id` | UUID | 会话唯一标识 |
| `user_query` | str | 用户原始查询 |
| `sub_tasks` | List[SubTask] | 关联的子任务列表（一对多） |
| `final_response` | str | 整合所有子任务的最终答案 |
| `status` | TaskStatus | 会话状态 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |
| `completed_at` | datetime | 完成时间（可选） |

## 🔧 配置管理

### 环境变量

在 `backend/.env` 文件中配置：

```env
# API 端口
PORT=3002

# LangSmith 追踪（可选）
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_your-key-here
LANGCHAIN_PROJECT=xpouch-ai
```

### 使用配置

```python
from config import (
    init_langchain_tracing,
    get_langsmith_config,
    validate_config,
    EXPERT_TYPES,
    EXPERT_NAMES
)

# 应用启动时调用
init_langchain_tracing()

# 获取 LangSmith 配置
config = get_langsmith_config()
print(f"LangSmith enabled: {config['enabled']}")

# 验证配置
is_valid = validate_config()
```

## 📨 DTO（数据传输对象）

### SubTaskCreate

用于 API 创建子任务请求：

```python
from models import SubTaskCreate, ExpertType

subtask_data = SubTaskCreate(
    expert_type="coder",
    description="实现一个快速排序算法",
    input_data={
        "language": "Python",
        "complexity": "O(n log n)"
    }
)
```

### SubTaskUpdate

用于 API 更新子任务状态：

```python
from models import SubTaskUpdate, TaskStatus
from datetime import datetime

update_data = SubTaskUpdate(
    status="completed",
    output_result={
        "code": "def quicksort(arr): ...",
        "explanation": "时间复杂度 O(n log n)"
    },
    completed_at=datetime.now()
)
```

### TaskSessionCreate

用于 API 创建任务会话请求：

```python
from models import TaskSessionCreate

session_data = TaskSessionCreate(
    user_query="帮我写一个快速排序算法"
)
```

## 🔄 工作流示例

### 完整的"指挥官"工作流

```python
from models import (
    SubTask, 
    TaskSession, 
    SubTaskCreate, 
    TaskSessionCreate,
    TaskStatus
)
from datetime import datetime

# 1. 创建任务会话
session = TaskSession(
    user_query="帮我分析并优化这段代码",
    status="pending"
)

# 2. 指挥官分解任务，创建子任务
subtask1 = SubTask(
    expert_type="analyzer",
    description="分析代码性能瓶颈",
    input_data={"code": "..."},
    task_session_id=session.session_id,
    status="pending"
)

subtask2 = SubTask(
    expert_type="coder",
    description="优化代码实现",
    input_data={"original_code": "..."},
    task_session_id=session.session_id,
    status="pending"
)

session.sub_tasks = [subtask1, subtask2]

# 3. 分发子任务到对应专家
for task in session.sub_tasks:
    # 更新状态为运行中
    task.status = "running"
    task.started_at = datetime.now()
    
    # 调用专家执行（伪代码）
    result = await expert_dispatcher.dispatch(task)
    
    # 更新状态和结果
    task.status = "completed"
    task.output_result = result
    task.completed_at = datetime.now()

# 4. 整合所有子任务结果
all_results = [task.output_result for task in session.sub_tasks]
final_response = orchestrator.synthesize(all_results)

# 5. 更新任务会话
session.final_response = final_response
session.status = "completed"
session.completed_at = datetime.now()
```

## 🧪 验证脚本

### 运行验证

```bash
# Windows
python backend\test_models.py

# Linux/Mac
python backend/test_models.py
```

### 验证内容

验证脚本演示了以下内容：

1. ✅ SubTask 实例创建和 JSON 序列化
2. ✅ TaskSession 实例创建和验证
3. ✅ DTO 的使用方式
4. ✅ 完整的工作流演示（用户查询 → 任务会话 → 子任务 → 最终响应）
5. ✅ Pydantic v2 标准验证

## 📊 数据库集成

### 创建表

```python
from database import create_db_and_tables
from models import SQLModel

# 在应用启动时调用
create_db_and_tables()
```

### 使用 Session 操作数据库

```python
from database import get_session
from sqlmodel import select

# 创建会话
with get_session() as session:
    # 创建任务会话
    new_session = TaskSession(user_query="test")
    session.add(new_session)
    session.commit()
    session.refresh(new_session)
    
    # 查询任务会话
    statement = select(TaskSession).where(
        TaskSession.session_id == new_session.session_id
    )
    result = session.exec(statement).first()
```

## 🔍 LangSmith 追踪

### 启用追踪

1. 获取 LangSmith API Key: https://smith.langchain.com
2. 在 `.env` 中配置：

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_your-key-here
LANGCHAIN_PROJECT=xpouch-ai
```

3. 应用启动时自动初始化追踪

### 查看追踪数据

访问 LangSmith Dashboard: https://smith.langchain.com

可以看到：
- 每个 LLM 调用的详细记录
- Token 使用统计
- 延迟分析
- 错误追踪

## 🎯 下一步

本基础设施已完成，下一步将实现：

1. **第二步**：专家注册与发现机制
2. **第三步**："指挥官"决策与任务分发
3. **第四步**：专家执行与结果聚合
4. **第五步**：完整流程集成与测试

## 📝 注意事项

1. **Pydantic v2 兼容性**: 所有模型使用 Pydantic v2 语法，确保序列化正确
2. **FastAPI 异步调用**: 模型设计为支持 FastAPI 异步操作
3. **JSON 字段**: `input_data` 和 `output_result` 使用 JSON 类型，可存储任意结构化数据
4. **时间戳**: 所有时间戳使用 `datetime.now()` 工厂函数自动生成
5. **级联删除**: TaskSession 删除时会自动删除关联的 SubTask

## 🤝 贡献

如需添加新的专家类型，请：

1. 在 `EXPERT_TYPES` 中添加类型
2. 在 `EXPERT_NAMES` 中添加显示名称
3. 更新 `ExpertType` Literal
4. 更新 CHANGELOG
