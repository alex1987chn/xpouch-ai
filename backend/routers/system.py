"""
系统路由模块 - 包含健康检查、调试接口、用户管理
"""
import sys
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload, Session as SASession

from database import get_session, engine
from dependencies import get_current_user, get_current_user_with_auth
from models import User, Thread, CustomAgent
from utils.exceptions import NotFoundError


router = APIRouter(prefix="/api", tags=["system"])


# ============================================================================
# 请求模型
# ============================================================================

class UpdateUserRequest(BaseModel):
    username: Optional[str] = None
    avatar: Optional[str] = None
    plan: Optional[str] = None


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
async def get_user_me(
    current_user: User = Depends(get_current_user_with_auth)
):
    """获取当前登录用户信息"""
    return current_user


@router.put("/user/me")
async def update_user_me(
    request: UpdateUserRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_with_auth)
):
    """更新当前用户信息"""
    print(f"[API] 收到更新用户信息请求，用户ID: {current_user.id}", file=sys.stderr)
    print(f"[API] 请求内容: username={request.username}, avatar={'有' if request.avatar else '否'}, plan={request.plan}", file=sys.stderr)

    # 记录更新时间戳
    current_user.updated_at = datetime.now()
    
    if request.username is not None:
        current_user.username = request.username
        print(f"[API] 更新用户名为: {request.username}", file=sys.stderr)
    if request.avatar is not None:
        current_user.avatar = request.avatar
        print(f"[API] 更新头像: {'是' if request.avatar else '否'}", file=sys.stderr)
    if request.plan is not None:
        current_user.plan = request.plan
        print(f"[API] 更新套餐: {request.plan}", file=sys.stderr)

    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    print(f"[API] 用户信息更新成功: {current_user.username} (更新时间: {current_user.updated_at})", file=sys.stderr)
    return current_user


# ============================================================================
# 调试接口
# ============================================================================

@router.get("/debug/users")
async def debug_list_users(
    session: Session = Depends(get_session)
):
    """列出所有用户（仅用于调试）"""
    users = session.exec(select(User).order_by(User.created_at.desc())).all()
    return {
        "count": len(users),
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "phone_number": u.phone_number,
                "auth_provider": u.auth_provider,
                "created_at": u.created_at.isoformat() if u.created_at else None
            }
            for u in users
        ]
    }


@router.get("/debug/verify-token")
async def debug_verify_token(
    request: Request,
    session: Session = Depends(get_session)
):
    """验证JWT token并返回用户信息（仅用于调试）"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return {"error": "No Authorization header"}

    from utils.jwt_handler import verify_token, AuthenticationError as JWTAuthError

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
                    "auth_provider": user.auth_provider
                }
            }
        else:
            return {
                "token_user_id": user_id,
                "user_found": False,
                "error": "User not found in database"
            }
    except JWTAuthError as e:
        return {
            "error": "Invalid token",
            "detail": str(e)
        }


@router.delete("/debug/cleanup-users")
async def debug_cleanup_users():
    """清理没有手机号的垃圾用户（仅用于调试）"""
    # 创建新的session，不经过get_current_user依赖
    with SASession(engine) as session:
        # 查找所有没有手机号的用户
        users_to_delete = session.exec(
            select(User).where(User.phone_number.is_(None))
        ).all()

        count = len(users_to_delete)

        for user in users_to_delete:
            # 1. 先删除该用户的所有线程（会级联删除messages）
            threads = session.exec(
                select(Thread).where(Thread.user_id == user.id)
            ).all()
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
            "deleted_users": [{"id": u.id, "username": u.username} for u in users_to_delete]
        }
