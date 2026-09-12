"""集中定义所有用于 DB 持久化的 StrEnum；DB 列必须使用 .value 映射。"""

from enum import StrEnum


def _enum_values(enum_cls: type[StrEnum]) -> list[str]:
    """Use enum .value for DB persistence/reading instead of member names."""
    return [member.value for member in enum_cls]


class UserRole(StrEnum):
    """用户角色枚举。

    v3.4.7 起收敛为双角色：admin 管理实例级功能（专家/模型/工具治理/
    模板/MCP/用户角色），user 使用产品。历史值 view_admin/edit_admin 由
    迁移 20260910_000300 归一（view→user，edit→admin）。
    """

    USER = "user"
    ADMIN = "admin"


class ConversationType(StrEnum):
    """会话类型枚举"""

    DEFAULT = "default"
    CUSTOM = "custom"
    AI = "ai"


class ExpertType(StrEnum):
    """专家类型枚举"""

    SEARCH = "search"
    CODER = "coder"
    RESEARCHER = "researcher"
    ANALYZER = "analyzer"
    WRITER = "writer"
    PLANNER = "planner"
    IMAGE_ANALYZER = "image_analyzer"


class TaskStatus(StrEnum):
    """子任务状态枚举"""

    PENDING = "pending"
    WAITING_FOR_APPROVAL = "waiting_for_approval"  # HITL: 等待用户审核计划
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class GraphTaskStatus(StrEnum):
    """图状态（AgentState.task_list）内部的子任务词表。

    与 DB 的 TaskStatus 是两个概念：本词表描述节点执行过程中的瞬态
    （in_progress / waiting_for_tool），持久化前须经 to_task_status() 映射；
    直接 TaskStatus(图状态值) 对中间态会 ValueError。
    """

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    WAITING_FOR_TOOL = "waiting_for_tool"
    COMPLETED = "completed"
    FAILED = "failed"


def to_task_status(value: GraphTaskStatus | str) -> TaskStatus:
    """图状态 → DB TaskStatus 映射（持久化边界的唯一转换点）。"""
    status = GraphTaskStatus(value)
    if status in (GraphTaskStatus.IN_PROGRESS, GraphTaskStatus.WAITING_FOR_TOOL):
        return TaskStatus.RUNNING
    return TaskStatus(status.value)


class RunStatus(StrEnum):
    """统一运行时状态枚举。"""

    QUEUED = "queued"
    RUNNING = "running"
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    RESUMING = "resuming"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


class ThreadStatus(StrEnum):
    """会话展示状态（Thread.status 字段）。

    由 RunStatus 经 derive_thread_status_from_run_status 推导，
    消除散落在 service/crud 层的裸字符串双轨。
    """

    RUNNING = "running"
    IDLE = "idle"
    PAUSED = "paused"


class ExecutionMode(StrEnum):
    """任务执行模式"""

    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"


class RunEventType(StrEnum):
    """
    运行事件类型枚举

    用于 RunEvent 账本记录，追踪 AgentRun 的完整生命周期。
    事件命名遵循 {entity}_{action} 规范。
    """

    # 生命周期事件
    RUN_CREATED = "run_created"  # 运行实例创建
    RUN_STARTED = "run_started"  # 运行开始执行

    # 路由事件
    ROUTER_DECIDED = "router_decided"  # Router 决策完成

    # 计划事件（复杂模式）
    PLAN_CREATED = "plan_created"  # ExecutionPlan 创建
    PLAN_UPDATED = "plan_updated"  # 计划被用户修改

    # HITL 事件
    HITL_INTERRUPTED = "hitl_interrupted"  # 等待用户审核
    HITL_RESUMED = "hitl_resumed"  # 用户批准后恢复
    HITL_REJECTED = "hitl_rejected"  # 用户拒绝计划（终止语义）
    HITL_REVISION_STARTED = "hitl_revision_started"  # 驳回+反馈 → 规划专家修订中
    HITL_REVISION_FAILED = "hitl_revision_failed"  # 修订失败（保持原计划待审）

    # 任务执行事件
    TASK_STARTED = "task_started"  # 子任务开始执行
    TASK_COMPLETED = "task_completed"  # 子任务完成
    TASK_FAILED = "task_failed"  # 子任务失败

    # 产物事件
    ARTIFACT_GENERATED = "artifact_generated"  # 产物生成

    # 终态事件
    RUN_COMPLETED = "run_completed"  # 运行完成
    RUN_FAILED = "run_failed"  # 运行失败
    RUN_CANCELLED = "run_cancelled"  # 运行取消
    RUN_TIMED_OUT = "run_timed_out"  # 运行超时
