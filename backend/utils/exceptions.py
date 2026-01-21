"""
自定义异常类
提供统一的错误处理机制
"""

from typing import Optional, Any, Dict


class AppError(Exception):
    """应用基础异常类"""
    
    def __init__(
        self, 
        message: str, 
        code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        self.original_error = original_error
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式，用于API响应"""
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details
            }
        }
    
    def __str__(self) -> str:
        return f"[{self.code}] {self.message}"


class ValidationError(AppError):
    """数据验证错误"""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=400,
            details=details
        )


class AuthenticationError(AppError):
    """认证错误"""
    def __init__(self, message: str = "认证失败", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="AUTHENTICATION_ERROR",
            status_code=401,
            details=details
        )


class AuthorizationError(AppError):
    """授权错误"""
    def __init__(self, message: str = "没有权限", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            code="AUTHORIZATION_ERROR",
            status_code=403,
            details=details
        )


class NotFoundError(AppError):
    """资源未找到错误"""
    def __init__(self, resource: str = "资源", details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"{resource} 未找到",
            code="NOT_FOUND",
            status_code=404,
            details=details
        )


class LLMError(AppError):
    """LLM API调用错误"""
    def __init__(self, message: str, provider: str = "unknown", details: Optional[Dict[str, Any]] = None):
        details = details or {}
        details["provider"] = provider
        super().__init__(
            message=message,
            code="LLM_ERROR",
            status_code=502,  # Bad Gateway
            details=details
        )


class DatabaseError(AppError):
    """数据库错误"""
    def __init__(self, message: str, operation: str = "unknown", details: Optional[Dict[str, Any]] = None):
        details = details or {}
        details["operation"] = operation
        super().__init__(
            message=message,
            code="DATABASE_ERROR",
            status_code=503,  # Service Unavailable
            details=details
        )


class ExternalServiceError(AppError):
    """外部服务错误"""
    def __init__(self, service: str, message: str, details: Optional[Dict[str, Any]] = None):
        details = details or {}
        details["service"] = service
        super().__init__(
            message=f"{service} 服务错误: {message}",
            code="EXTERNAL_SERVICE_ERROR",
            status_code=502,
            details=details
        )


class RateLimitError(AppError):
    """速率限制错误"""
    def __init__(self, message: str = "请求过于频繁", retry_after: Optional[int] = None):
        details = {}
        if retry_after:
            details["retry_after"] = retry_after
        super().__init__(
            message=message,
            code="RATE_LIMIT",
            status_code=429,
            details=details
        )


# 错误处理工具函数
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
    return AppError(
        message=str(error),
        original_error=error
    )