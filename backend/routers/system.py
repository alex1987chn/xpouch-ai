"""
系统路由模块 - 包含健康检查、调试接口、用户管理
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session as SASession
from sqlmodel import Session, select

from database import engine, get_session
from dependencies import get_current_user_with_auth
from models import CustomAgent, Thread, User, UserSettings
from utils.exceptions import NotFoundError

router = APIRouter(prefix="/api", tags=["system"])


# ============================================================================
# 请求模型
# ============================================================================


class UpdateUserRequest(BaseModel):
    username: str | None = None
    avatar: str | None = None
    plan: str | None = None


class UpdateUserSettingsRequest(BaseModel):
    """用户偏好设置更新请求。

    simple_model 为 null 表示清除选择、跟随系统默认模型；
    simple_thinking 三态：auto（跟随系统默认）/ enabled / disabled。
    """

    simple_model: str | None = None
    simple_thinking: str | None = None


# 用户偏好默认值（未存储任何偏好时的行为）
DEFAULT_USER_PREFERENCES = {
    "simple_model": None,  # None = 跟随系统默认模型
    "simple_thinking": "auto",
}
VALID_THINKING_MODES = {"auto", "enabled", "disabled"}


# ============================================================================
# 根路径和健康检查
# ============================================================================


@router.get("/", include_in_schema=False)
async def root():
    """根路径健康检查"""
    return {"status": "ok", "message": "XPouch AI Backend (Python + SQLModel) is running"}


@router.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# ============================================================================
# 用户信息接口
# ============================================================================


@router.get("/user/me")
async def get_user_me(current_user: User = Depends(get_current_user_with_auth)):
    """获取当前登录用户信息"""
    return current_user


@router.put("/user/me")
async def update_user_me(
    request: UpdateUserRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_with_auth),
):
    """更新当前用户信息"""
    # 记录更新时间戳
    current_user.updated_at = datetime.now()

    if request.username is not None:
        current_user.username = request.username
    if request.avatar is not None:
        current_user.avatar = request.avatar
    if request.plan is not None:
        current_user.plan = request.plan

    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return current_user


# ============================================================================
# 模型与用户偏好接口
# ============================================================================


@router.get("/models")
async def list_models(current_user: User = Depends(get_current_user_with_auth)):
    """列出当前可用的模型（provider 已启用且未标记 hidden），作为前端模型列表的单一真相源"""
    from providers_config import get_available_models

    return {"models": get_available_models()}


def _load_user_preferences(session: Session, user_id: str) -> dict:
    """读取用户偏好并与默认值合并（存储缺失或字段缺失时回落默认值）"""
    stored = session.get(UserSettings, user_id)
    prefs = dict(stored.preferences) if stored and stored.preferences else {}
    merged = {**DEFAULT_USER_PREFERENCES, **prefs}
    # 防御历史脏数据
    if merged.get("simple_thinking") not in VALID_THINKING_MODES:
        merged["simple_thinking"] = DEFAULT_USER_PREFERENCES["simple_thinking"]
    return merged


@router.get("/user/settings")
async def get_user_settings(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_with_auth),
):
    """获取当前用户偏好设置（含默认值合并与系统默认模型信息）"""
    from providers_config import get_provider_config
    from utils.llm_factory import get_default_model

    preferences = _load_user_preferences(session, current_user.id)

    default_model = get_default_model()
    provider_config = get_provider_config("deepseek") or {}
    return {
        "preferences": preferences,
        "default_model": {
            "id": default_model,
            "name": provider_config.get("name", default_model),
        },
    }


@router.put("/user/settings")
async def update_user_settings(
    request: UpdateUserSettingsRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_with_auth),
):
    """更新当前用户偏好设置（整体写入，字段校验后 upsert）"""
    from providers_config import get_available_models

    # 校验 simple_model：null 或必须存在于可用模型列表
    if request.simple_model is not None:
        available_ids = {m["id"] for m in get_available_models()}
        if request.simple_model not in available_ids:
            from utils.exceptions import ValidationError

            raise ValidationError(message=f"未知或不可用的模型: {request.simple_model}")

    # 校验 simple_thinking
    if request.simple_thinking is not None and request.simple_thinking not in VALID_THINKING_MODES:
        from utils.exceptions import ValidationError

        raise ValidationError(
            message=f"无效的 thinking 取值: {request.simple_thinking}，允许 auto/enabled/disabled"
        )

    stored = session.get(UserSettings, current_user.id)
    preferences = {
        "simple_model": request.simple_model,
        "simple_thinking": request.simple_thinking or DEFAULT_USER_PREFERENCES["simple_thinking"],
    }

    if stored:
        stored.preferences = preferences
        session.add(stored)
    else:
        stored = UserSettings(user_id=current_user.id, preferences=preferences)
        session.add(stored)

    session.commit()

    return {"preferences": _load_user_preferences(session, current_user.id)}


# ============================================================================
# 调试接口（仅开发环境使用）
# ============================================================================
# ⚠️ 警告：以下端点仅在 development 环境启用，生产环境应禁用

import os

# 检查是否在开发环境
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_DEVELOPMENT = ENVIRONMENT.lower() == "development"


@router.get("/debug/users")
async def debug_list_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_with_auth),
):
    """列出所有用户（仅用于调试，需要登录且仅开发环境）"""
    if not IS_DEVELOPMENT:
        raise NotFoundError(resource="端点")

    users = session.exec(select(User).order_by(User.created_at.desc())).all()
    return {
        "count": len(users),
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "phone_number": u.phone_number,
                "auth_provider": u.auth_provider,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


@router.get("/debug/verify-token")
async def debug_verify_token(request: Request, session: Session = Depends(get_session)):
    """验证JWT token并返回用户信息（仅用于调试，仅开发环境）"""
    if not IS_DEVELOPMENT:
        raise NotFoundError(resource="端点")

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return {"error": "No Authorization header"}

    from utils.jwt_handler import AuthenticationError as JWTAuthError
    from utils.jwt_handler import verify_token

    token = auth_header.split(" ")[1]
    try:
        payload = verify_token(token, token_type="access")
        user_id = payload["sub"]
        user = session.get(User, user_id)

        if user:
            return {
                "token_user_id": user_id,
                "user_found": True,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "phone_number": user.phone_number,
                    "auth_provider": user.auth_provider,
                },
            }
        else:
            return {
                "token_user_id": user_id,
                "user_found": False,
                "error": "User not found in database",
            }
    except JWTAuthError as e:
        return {"error": "Invalid token", "detail": str(e)}


@router.delete("/debug/cleanup-users")
async def debug_cleanup_users(current_user: User = Depends(get_current_user_with_auth)):
    """清理没有手机号的垃圾用户（仅用于调试，需要登录且仅开发环境）"""
    if not IS_DEVELOPMENT:
        raise NotFoundError(resource="端点")

    # 创建新的session，不经过get_current_user依赖
    with SASession(engine) as session:
        # 查找所有没有手机号的用户
        users_to_delete = session.exec(select(User).where(User.phone_number.is_(None))).all()

        count = len(users_to_delete)

        for user in users_to_delete:
            # 1. 先删除该用户的所有线程（会级联删除messages）
            threads = session.exec(select(Thread).where(Thread.user_id == user.id)).all()
            for conv in threads:
                session.delete(conv)

            # 2. 删除该用户的所有自定义智能体
            custom_agents = session.exec(
                select(CustomAgent).where(CustomAgent.user_id == user.id)
            ).all()
            for agent in custom_agents:
                session.delete(agent)

            # 3. 最后删除用户
            session.delete(user)

        session.commit()

        return {
            "deleted_count": count,
            "deleted_users": [{"id": u.id, "username": u.username} for u in users_to_delete],
        }
