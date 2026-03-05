"""集中定义所有用于 DB 持久化的 StrEnum；DB 列必须使用 .value 映射。"""

from enum import StrEnum


def _enum_values(enum_cls: type[StrEnum]) -> list[str]:
    """Use enum .value for DB persistence/reading instead of member names."""
    return [member.value for member in enum_cls]


class UserRole(StrEnum):
    """用户角色枚举"""

    USER = "user"
    ADMIN = "admin"
    VIEW_ADMIN = "view_admin"
    EDIT_ADMIN = "edit_admin"


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
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ExecutionMode(StrEnum):
    """任务执行模式"""

    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
