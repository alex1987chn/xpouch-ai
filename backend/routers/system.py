"""
系统路由模块 - 包含健康检查、调试接口、用户管理
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session as SASession
from sqlmodel import Session, select

from database import engine, get_session
from dependencies import get_current_user_with_auth, require_role
from models import CustomAgent, Thread, User, UserRole
from schemas.user_profile import UserProfileResponse
from utils.exceptions import NotFoundError
from utils.time import utc_now_naive

router = APIRouter(prefix="/api", tags=["system"])


# ============================================================================
# 请求模型
# ============================================================================


# 可更新字段白名单：此模型即边界，往 User 模型加敏感列（plan/quota/role 等）
# 不会自动变成"用户可改"。plan 属配额语义，只能由管理侧流程变更。
class UpdateUserRequest(BaseModel):
    username: str | None = None
    avatar: str | None = None


class UpdateUserSettingsRequest(BaseModel):
    """全局模型偏好更新请求（v3.4.7 起为实例级配置，仅 ADMIN 可写）。

    simple_model 为 null 表示清除选择、跟随系统默认模型（env MODEL_NAME）；
    simple_thinking 三态：auto（跟随系统默认）/ enabled / disabled。
    """

    simple_model: str | None = None
    simple_thinking: str | None = None


# 全局模型偏好的读写已迁至 services/user_preferences.py（system_setting 表）
from services.user_preferences import (  # noqa: E402
    VALID_THINKING_MODES,
    load_model_preferences,
    save_model_preferences,
)

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
    return {"status": "healthy", "timestamp": utc_now_naive().isoformat()}


# ============================================================================
# 用户信息接口
# ============================================================================


def _to_profile_response(user: User) -> UserProfileResponse:
    """ORM User -> 公开资料（has_password 只暴露布尔，不暴露哈希）"""
    return UserProfileResponse(
        id=user.id,
        username=user.username,
        avatar=user.avatar,
        plan=user.plan,
        role=user.role,
        created_at=user.created_at,
        updated_at=user.updated_at,
        has_password=bool(user.password_hash),
    )


@router.get("/user/me", response_model=UserProfileResponse)
async def get_user_me(current_user: User = Depends(get_current_user_with_auth)):
    """获取当前登录用户信息（仅公开字段，不序列化内部凭证列）"""
    return _to_profile_response(current_user)


@router.put("/user/me", response_model=UserProfileResponse)
async def update_user_me(
    request: UpdateUserRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_with_auth),
):
    """更新当前用户信息（仅公开字段，不序列化内部凭证列）"""
    # 记录更新时间戳
    current_user.updated_at = utc_now_naive()

    if request.username is not None:
        current_user.username = request.username
    if request.avatar is not None:
        current_user.avatar = request.avatar

    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return _to_profile_response(current_user)


# ============================================================================
# 模型与用户偏好接口
# ============================================================================


@router.get("/models")
async def list_models(current_user: User = Depends(get_current_user_with_auth)):
    """列出当前可用的模型（provider 已启用且未标记 hidden），作为前端模型列表的单一真相源"""
    from providers_config import get_available_models

    return {"models": get_available_models()}


@router.get("/user/settings")
async def get_user_settings(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_with_auth),
):
    """获取全局模型偏好（v3.4.7 起为实例级配置；普通用户只读，管理员经 PUT 修改）"""
    from providers_config import get_provider_config
    from utils.llm_factory import get_default_model

    preferences = load_model_preferences(session)

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
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """更新全局模型偏好（仅管理员，全实例生效）"""
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

    preferences = save_model_preferences(
        session,
        simple_model=request.simple_model,
        simple_thinking=request.simple_thinking or "auto",
    )

    return {"preferences": preferences}


# ============================================================================
# 调试接口（仅开发环境使用）
# ============================================================================
# ⚠️ 警告：以下端点仅在 development 环境启用，生产环境应禁用
# Fail-closed：环境判断走 config.settings 单一来源（缺省即 production 语义）

from config import settings


def _ensure_debug_enabled() -> None:
    if not settings.is_development:
        raise NotFoundError(resource="端点")


@router.get("/debug/users")
async def debug_list_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_with_auth),
):
    """列出所有用户（仅用于调试，需要登录且仅开发环境）"""
    _ensure_debug_enabled()

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
    _ensure_debug_enabled()

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
    _ensure_debug_enabled()

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


# ============================================================================
# 用量汇总（B5：token 记账可视化）
# ============================================================================


@router.get("/usage/summary")
async def get_usage_summary(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_with_auth),
):
    """当前用户的 token 用量汇总（今日 / 累计；近似值：不含 router/aggregator）"""
    from sqlalchemy import func

    from models import AgentRun

    today_start = utc_now_naive().replace(hour=0, minute=0, second=0, microsecond=0)

    def _sum_since(since: datetime | None) -> dict:
        stmt = select(
            func.coalesce(func.sum(AgentRun.total_tokens), 0),
            func.coalesce(func.sum(AgentRun.prompt_tokens), 0),
            func.coalesce(func.sum(AgentRun.completion_tokens), 0),
            func.count(AgentRun.id),
        ).where(AgentRun.user_id == current_user.id)
        if since is not None:
            stmt = stmt.where(AgentRun.started_at >= since)
        total, prompt, completion, runs = session.exec(stmt).one()
        return {
            "runs": int(runs),
            "total_tokens": int(total),
            "prompt_tokens": int(prompt),
            "completion_tokens": int(completion),
        }

    return {
        "today": _sum_since(today_start),
        "total": _sum_since(None),
    }
