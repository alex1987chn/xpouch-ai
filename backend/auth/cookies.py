"""认证 Cookie 的配置与读写（HttpOnly）。"""

from fastapi import HTTPException, Request, Response, status

from config import settings
from utils.jwt_handler import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from utils.logger import logger


# P0 修复: Cookie 安全配置
def get_cookie_config():
    """获取 Cookie 配置"""
    return {
        "httponly": True,  # JavaScript 无法读取
        "secure": settings.is_production,  # 生产环境必须使用 HTTPS
        "samesite": "lax",  # 防止 CSRF，同时允许部分跨站导航
        "path": "/",  # 全站可用
    }


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """
    P0 修复: 设置认证 Cookie

    Args:
        response: FastAPI Response 对象
        access_token: 访问令牌
        refresh_token: 刷新令牌
    """
    cookie_config = get_cookie_config()

    # Access Token: 60 分钟
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # 秒
        **cookie_config,
    )

    # Refresh Token: 60 天
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,  # 秒
        **cookie_config,
    )

    logger.info("[Auth] Cookie 设置完成")


def clear_auth_cookies(response: Response) -> None:
    """
    P0 修复: 清除认证 Cookie（登出用）

    Args:
        response: FastAPI Response 对象
    """
    cookie_config = get_cookie_config()

    response.delete_cookie(key="access_token", **cookie_config)
    response.delete_cookie(key="refresh_token", **cookie_config)

    logger.info("[Auth] Cookie 已清除")


def get_refresh_token_from_cookie(request: Request) -> str:
    """
    P0 修复: 从 Cookie 获取 refresh token

    Raises:
        HTTPException: Cookie 不存在
    """
    token = request.cookies.get("refresh_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌不存在，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token
