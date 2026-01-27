"""
管理员 API 接口

提供以下功能：
1. 获取系统专家列表
2. 更新系统专家配置
3. 升级用户为管理员
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel, Field as PydanticField, field_validator

from auth import get_current_user
from models import User, SystemExpert, UserRole
from database import get_session

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================================================
# 权限依赖
# ============================================================================

async def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    获取当前管理员用户

    验证用户是否为管理员，否则抛出 403 错误
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return current_user


# ============================================================================
# Pydantic 模型
# ============================================================================

class ExpertResponse(BaseModel):
    """专家响应 DTO"""
    id: int
    expert_key: str
    name: str
    system_prompt: str
    model: str
    temperature: float
    updated_at: str


class ExpertUpdate(BaseModel):
    """专家更新 DTO"""
    system_prompt: str = PydanticField(..., min_length=10, description="系统提示词（至少10个字符）")
    model: str = PydanticField(default="gpt-4o", description="模型名称")
    temperature: float = PydanticField(default=0.5, ge=0.0, le=2.0, description="温度参数（0.0-2.0）")

    @field_validator('system_prompt')
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        if not v or len(v.strip()) < 10:
            raise ValueError("system_prompt 不能为空且长度必须大于 10")
        return v.strip()


class UserPromoteRequest(BaseModel):
    """用户升级请求 DTO"""
    email: str


# ============================================================================
# API 端点
# ============================================================================

@router.get("/experts", response_model=List[ExpertResponse])
async def get_all_experts(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_admin)  # 需要管理员权限
):
    """
    获取所有系统专家列表

    权限：Admin
    """
    experts = session.exec(select(SystemExpert)).all()

    return [
        ExpertResponse(
            id=expert.id,
            expert_key=expert.expert_key,
            name=expert.name,
            system_prompt=expert.system_prompt,
            model=expert.model,
            temperature=expert.temperature,
            updated_at=expert.updated_at.isoformat()
        )
        for expert in experts
    ]


@router.get("/experts/{expert_key}", response_model=ExpertResponse)
async def get_expert(
    expert_key: str,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_admin)  # 需要管理员权限
):
    """
    获取单个专家配置

    权限：Admin
    """
    expert = session.exec(
        select(SystemExpert).where(SystemExpert.expert_key == expert_key)
    ).first()

    if not expert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"专家 '{expert_key}' 不存在"
        )

    return ExpertResponse(
        id=expert.id,
        expert_key=expert.expert_key,
        name=expert.name,
        system_prompt=expert.system_prompt,
        model=expert.model,
        temperature=expert.temperature,
        updated_at=expert.updated_at.isoformat()
    )


@router.patch("/experts/{expert_key}")
async def update_expert(
    expert_key: str,
    expert_update: ExpertUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_admin)  # 需要管理员权限
):
    """
    更新系统专家配置

    权限：Admin

    可以更新：
    - system_prompt: 专家提示词
    - model: 使用的模型
    - temperature: 温度参数
    """
    # 查找专家
    expert = session.exec(
        select(SystemExpert).where(SystemExpert.expert_key == expert_key)
    ).first()

    if not expert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"专家 '{expert_key}' 不存在"
        )

    # 更新字段
    expert.system_prompt = expert_update.system_prompt
    expert.model = expert_update.model
    expert.temperature = expert_update.temperature

    session.add(expert)
    session.commit()
    session.refresh(expert)

    print(f"[Admin] Expert '{expert_key}' updated by admin")

    return {
        "message": "专家配置已更新",
        "expert_key": expert_key,
        "updated_at": expert.updated_at.isoformat()
    }


@router.post("/promote-user")
async def promote_user(
    request: UserPromoteRequest,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_admin)  # 需要管理员权限
):
    """
    升级指定用户为管理员

    权限：Admin

    Args:
        request: 包含用户邮箱的请求体
    """
    # 查找用户
    user = session.exec(
        select(User).where(User.email == request.email)
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"用户 '{request.email}' 不存在"
        )

    # 检查是否已经是管理员
    if user.role == UserRole.ADMIN:
        return {
            "message": "用户已经是管理员",
            "username": user.username,
            "email": user.email
        }

    # 升级为管理员
    user.role = UserRole.ADMIN
    session.add(user)
    session.commit()

    print(f"[Admin] User '{user.username}' promoted to admin")

    return {
        "message": "用户已升级为管理员",
        "username": user.username,
        "email": user.email
    }
