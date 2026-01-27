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
from agents.expert_loader import refresh_cache

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


async def get_current_view_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    获取当前查看权限用户（VIEW_ADMIN 角色）

    适用于只读场景，不要求完全的 ADMIN 权限
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.USER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
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


class ExpertPreviewRequest(BaseModel):
    """专家预览请求 DTO"""
    expert_key: str
    test_input: str = PydanticField(..., min_length=10, description="测试输入（至少10个字符）")


class ExpertPreviewResponse(BaseModel):
    """专家预览响应 DTO"""
    expert_name: str
    test_input: str
    preview_response: str
    model: str
    temperature: float
    execution_time_ms: int


# ============================================================================
# API 端点
# ============================================================================

@router.get("/experts", response_model=List[ExpertResponse])
async def get_all_experts(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_view_admin)  # 需要 VIEW_ADMIN 或 EDIT_ADMIN 权限
):
    """
    获取所有系统专家列表

    权限：VIEW_ADMIN, EDIT_ADMIN, ADMIN
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
    _: User = Depends(get_current_admin)  # 需要 EDIT_ADMIN 或 ADMIN 权限
):
    """
    更新系统专家配置

    权限：EDIT_ADMIN, ADMIN

    可以更新：
    - system_prompt: 专家提示词
    - model: 使用的模型
    - temperature: 温度参数

    注意：更新后会自动刷新 LangGraph 缓存，下次任务立即生效
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

    # 自动刷新 LangGraph 缓存（无需重启）
    try:
        refresh_cache(session)
        print(f"[Admin] LangGraph cache refreshed successfully")
    except Exception as e:
        print(f"[Admin] Warning: Failed to refresh cache: {e}")
        # 缓存刷新失败不影响保存操作，只是下次任务可能会使用旧缓存

    return {
        "message": "专家配置已更新，下次任务生效",
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


@router.post("/experts/preview", response_model=ExpertPreviewResponse)
async def preview_expert(
    request: ExpertPreviewRequest,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_view_admin)  # 需要 VIEW_ADMIN 或 EDIT_ADMIN 权限
):
    """
    预览专家响应（模拟执行）

    权限：VIEW_ADMIN, EDIT_ADMIN, ADMIN

    功能：
    - 使用当前数据库配置的 Prompt
    - 调用 LLM 模拟专家响应
    - 不影响实际任务执行
    - 返回预览结果和执行时间

    注意：此 API 不会刷新缓存，仅用于预览效果
    """
    from datetime import datetime
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import SystemMessage, HumanMessage
    from agents.expert_loader import get_expert_config
    from database import get_session as get_db_session

    # 获取专家配置（不从缓存读取，确保使用最新配置）
    expert_config = get_expert_config(request.expert_key, session)

    if not expert_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"专家 '{request.expert_key}' 不存在"
        )

    # 调用 LLM 进行预览
    started_at = datetime.now()

    try:
        # 使用专家配置的模型和温度参数
        llm = ChatOpenAI(
            model=expert_config["model"],
            temperature=expert_config["temperature"],
            api_key=os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
        )

        response = await llm.ainvoke([
            SystemMessage(content=expert_config["system_prompt"]),
            HumanMessage(content=request.test_input)
        ])

        completed_at = datetime.now()
        execution_time_ms = int((completed_at - started_at).total_seconds() * 1000)

        return ExpertPreviewResponse(
            expert_name=expert_config["name"],
            test_input=request.test_input,
            preview_response=response.content,
            model=expert_config["model"],
            temperature=expert_config["temperature"],
            execution_time_ms=execution_time_ms
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"预览失败: {str(e)}"
        )

