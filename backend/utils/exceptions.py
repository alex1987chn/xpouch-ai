"""
自定义异常类
提供统一的错误处理机制
"""

from typing import Any

from utils.error_codes import ErrorCode, as_error_code


class AppError(Exception):
    """应用基础异常类"""

    def __init__(
        self,
        message: str,
        code: str | ErrorCode = ErrorCode.INTERNAL_ERROR,
        status_code: int = 500,
        details: dict[str, Any] | None = None,
        original_error: Exception | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = as_error_code(code)
        self.status_code = status_code
        self.details = details or {}
        self.original_error = original_error

    def to_dict(self) -> dict[str, Any]:
        """转换为字典格式，用于API响应"""
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}

    def __str__(self) -> str:
        return f"[{self.code}] {self.message}"


class ValidationError(AppError):
    """数据验证错误"""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(
            message=message, code=ErrorCode.VALIDATION_ERROR, status_code=400, details=details
        )


class AuthorizationError(AppError):
    """授权错误"""

    def __init__(self, message: str = "没有权限", details: dict[str, Any] | None = None):
        super().__init__(
            message=message, code=ErrorCode.AUTHORIZATION_ERROR, status_code=403, details=details
        )


class NotFoundError(AppError):
    """资源未找到错误"""

    def __init__(self, resource: str = "资源", details: dict[str, Any] | None = None):
        super().__init__(
            message=f"{resource} 未找到", code=ErrorCode.NOT_FOUND, status_code=404, details=details
        )


def handle_error(error: Exception) -> AppError:
    """将通用异常转换为 AppError"""
    if isinstance(error, AppError):
        return error

    # 根据异常类型映射
    if isinstance(error, ValueError):
        return ValidationError(str(error))
    elif isinstance(error, KeyError):
        return ValidationError(f"缺少必要的字段: {error}")
    elif isinstance(error, TypeError):
        return ValidationError(f"类型错误: {error}")

    # 默认内部错误
    return AppError(message=str(error), original_error=error)
