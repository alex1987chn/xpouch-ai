"""
管理员 API 接口

提供以下功能：
1. 获取系统专家列表
2. 更新系统专家配置
3. 升级用户为管理员
4. 自动生成专家描述
"""
from typing import List, Optional
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
    description: Optional[str]
    system_prompt: str
    model: str
    temperature: float
    updated_at: str


class ExpertUpdate(BaseModel):
    """专家更新 DTO"""
    system_prompt: str = PydanticField(..., min_length=10, description="系统提示词（至少10个字符）")
    description: Optional[str] = PydanticField(default=None, description="专家能力描述，用于 Planner 决定任务分配")
    model: str = PydanticField(default_factory=lambda: os.getenv("MODEL_NAME", "deepseek-chat"), description="模型名称")
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


class GenerateDescriptionRequest(BaseModel):
    """生成专家描述请求 DTO"""
    system_prompt: str = PydanticField(..., min_length=10, description="系统提示词")


class GenerateDescriptionResponse(BaseModel):
    """生成专家描述响应 DTO"""
    description: str
    generated_at: str
    temperature: float
    execution_time_ms: int


class UserPromoteRequest(BaseModel):
    """用户升级请求 DTO"""
    email: str = PydanticField(..., description="用户邮箱地址")

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not v or '@' not in v:
            raise ValueError("请输入有效的邮箱地址")
        return v.strip().lower()



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
    # 按 id 排序，确保顺序始终一致
    experts = session.exec(
        select(SystemExpert).order_by(SystemExpert.id)
    ).all()

    return [
        ExpertResponse(
            id=expert.id,
            expert_key=expert.expert_key,
            name=expert.name,
            description=expert.description,
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
        description=expert.description,
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
    - description: 专家能力描述（用于 Planner 决定任务分配）
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
    expert.description = expert_update.description
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
    from langchain_core.messages import SystemMessage, HumanMessage
    from agents.expert_loader import get_expert_config
    from database import get_session as get_db_session
    from utils.llm_factory import get_llm_instance

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
        # 使用工厂方法创建 LLM 实例
        llm = get_llm_instance(
            model=expert_config["model"],
            temperature=expert_config["temperature"]
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


@router.post("/experts/generate-description", response_model=GenerateDescriptionResponse)
async def generate_expert_description(
    request: GenerateDescriptionRequest,
    _: User = Depends(get_current_admin)  # 需要管理员权限
):
    """
    根据 System Prompt 自动生成专家描述

    权限：EDIT_ADMIN, ADMIN

    功能：
    - 分析 System Prompt 的内容
    - 使用 LLM 生成一句简短的专家能力描述
    - 用于 Planner 决定何时将任务分配给该专家

    说明：
    - 生成的描述建议在 50-100 字之间
    - 描述应简洁明了，突出专家核心能力
    - 不会保存到数据库，仅返回生成的描述供前端使用
    """
    from datetime import datetime
    from langchain_core.messages import SystemMessage, HumanMessage
    from utils.llm_factory import get_router_llm

    # 构建生成描述的 Prompt
    description_prompt = f"""请根据以下 System Prompt，生成一句简短的专家能力描述（50-100字）。

这个描述将被用于任务分配系统，帮助 Planner 决定何时将任务分配给该专家。

要求：
1. 简洁明了，突出核心能力
2. 说明该专家擅长什么类型的任务
3. 控制在 50-100 字之间
4. 使用第三人称（如：擅长...、能够...）

System Prompt:
{request.system_prompt}

请只输出描述文字，不要有任何前缀、解释或额外内容。"""

    try:
        # 使用 Router LLM 生成描述（温度稍高以获得更有创意的描述）
        started_at = datetime.now()
        llm = get_router_llm()
        
        # 获取温度参数
        from providers_config import get_router_config
        router_config = get_router_config()
        temperature = router_config.get('temperature', 0.5)

        response = await llm.ainvoke([
            SystemMessage(content="你是一个专业的 AI 助手描述生成器。"),
            HumanMessage(content=description_prompt)
        ])

        description = response.content.strip()

        # 清理可能的引号
        description = description.strip('"').strip("'")
        
        completed_at = datetime.now()
        execution_time_ms = int((completed_at - started_at).total_seconds() * 1000)

        return GenerateDescriptionResponse(
            description=description,
            generated_at=completed_at.isoformat(),
            temperature=temperature,
            execution_time_ms=execution_time_ms
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"生成描述失败: {str(e)}"
        )

