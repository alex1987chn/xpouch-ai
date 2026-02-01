"""
认证路由模块

提供用户认证相关的API端点，包括：
- 手机验证码发送
- 手机验证码验证（登录/注册）
- Token刷新
"""
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlmodel import Session, select
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from datetime import datetime, timedelta

from database import get_session
from models import User, UserRole
from utils.jwt_handler import (
    create_access_token,
    create_refresh_token,
    verify_token,
    AuthenticationError
)
from utils.verification import (
    generate_verification_code,
    verify_code,
    get_code_expiry_duration,
    validate_phone_number,
    mask_phone_number,
    VerificationCodeExpiredError,
    VerificationCodeInvalidError
)
from utils.sms_service import send_verification_code_with_fallback

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


# ==================== Pydantic模型 ====================

class SendCodeRequest(BaseModel):
    """发送验证码请求"""
    phone_number: str = Field(..., description="手机号码")
    
    @field_validator('phone_number')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not validate_phone_number(v):
            raise ValueError('请输入有效的手机号码')
        return v


class VerifyCodeRequest(BaseModel):
    """验证验证码请求"""
    phone_number: str = Field(..., description="手机号码")
    code: str = Field(..., min_length=4, max_length=6, description="验证码")
    
    @field_validator('phone_number')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not validate_phone_number(v):
            raise ValueError('请输入有效的手机号码')
        return v


class TokenResponse(BaseModel):
    """Token响应"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # 过期时间（秒）
    user_id: str
    username: str
    role: str  # 添加角色字段


class RefreshTokenRequest(BaseModel):
    """刷新Token请求"""
    refresh_token: str = Field(..., description="刷新令牌")


class UserResponse(BaseModel):
    """用户信息响应"""
    id: str
    username: str
    avatar: Optional[str]
    plan: str
    role: UserRole  # 👈 统一为枚举类型，修复 Pydantic 警告
    phone_number: Optional[str]
    email: Optional[str]
    is_verified: bool


# ==================== 辅助函数 ====================

# ==================== 辅助函数 ====================

def get_auth_token(authorization: str = Header(default=None)) -> str:
    """
    从 Authorization header 提取 Bearer token

    Args:
        authorization: Authorization header 值

    Returns:
        JWT token 字符串

    Raises:
        HTTPException: header 格式无效
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌格式",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return authorization[len("Bearer "):]


async def get_current_user_by_token(
    token: str,
    session: Session
) -> User:
    """
    通过JWT token获取当前用户

    Args:
        token: JWT access token
        session: 数据库会话

    Returns:
        用户对象

    Raises:
        HTTPException: token无效或用户不存在
    """
    try:
        # 验证token
        payload = verify_token(token, token_type="access")
        user_id = payload["sub"]

        # 获取用户
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )

        return user

    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    token: str = Depends(get_auth_token),
    session: Session = Depends(get_session)
) -> User:
    """
    FastAPI 依赖：从请求头获取 JWT token 并返回当前用户

    Args:
        token: Authorization header 中的 JWT token
        session: 数据库会话

    Returns:
        用户对象

    Raises:
        HTTPException: token无效或用户不存在
    """
    return await get_current_user_by_token(token, session)





# ==================== API端点 ====================

@router.post("/send-code")
async def send_verification_code(
    request: SendCodeRequest,
    session: Session = Depends(get_session)
):
    """
    发送手机验证码

    功能说明：
    1. 验证手机号码格式
    2. 生成6位数字验证码
    3. 检查手机号是否已注册
       - 如果已注册，更新验证码
       - 如果未注册，创建新用户
    4. 返回成功响应（开发环境返回验证码，生产环境不返回）

    注意：当前为开发版本，实际发送短信需集成短信服务商
    """
    try:
        import sys
        print(f"[Auth] 收到发送验证码请求，方法: POST")
        phone_number = request.phone_number
        print(f"[Auth] 请求体已解析，手机号: {phone_number}")
        
        # 生成验证码（6位数字）
        code = generate_verification_code(length=6)
        expires_at = get_code_expiry_duration(minutes=5)
        
        # 判断是否开发环境
        is_development = os.getenv("ENVIRONMENT", "development").lower() == "development"
        
        # 查询用户是否存在
        user = session.exec(
            select(User).where(User.phone_number == phone_number)
        ).first()
        
        if user:
            # 用户已存在，更新验证码
            user.verification_code = code
            user.verification_code_expires_at = expires_at
            session.add(user)
            session.commit()
            
            # 发送验证码短信
            success, error_message = send_verification_code_with_fallback(phone_number, code, expire_minutes=5)
            
            if not success:
                logger.warning(f"验证码短信发送失败: {error_message}")
                # 继续返回成功，因为验证码已生成并存储，用户可能通过其他方式获取
            
            response_data = {
                "message": "验证码已发送",
                "expires_in": 300,  # 5分钟，单位：秒
                "phone_masked": mask_phone_number(phone_number),
            }
            
            # 开发环境返回验证码用于调试
            if is_development:
                response_data["_debug_code"] = code
                
            return response_data
        else:
            # 用户不存在，创建新用户（未验证状态）
            # 生成用户ID
            import uuid
            new_user_id = str(uuid.uuid4())
            
            new_user = User(
                id=new_user_id,
                username=f"用户{phone_number[-4:]}",
                phone_number=phone_number,
                verification_code=code,
                verification_code_expires_at=expires_at,
                auth_provider="phone",
                is_verified=False,
                role="user"  # 添加默认角色
            )
            
            session.add(new_user)
            session.commit()
            session.refresh(new_user)
            
            # 发送验证码短信
            success, error_message = send_verification_code_with_fallback(phone_number, code, expire_minutes=5)
            
            if not success:
                logger.warning(f"验证码短信发送失败: {error_message}")
                # 继续返回成功，因为验证码已生成并存储，用户可能通过其他方式获取
            
            response_data = {
                "message": "验证码已发送（新用户注册）",
                "expires_in": 300,
                "phone_masked": mask_phone_number(phone_number),
                "user_id": new_user_id,
            }
            
            # 开发环境返回验证码用于调试
            if is_development:
                response_data["_debug_code"] = code
                
            return response_data
    except Exception as e:
        logger.error(f"发送验证码处理异常: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"服务器内部错误: {str(e)}"
        )


@router.post("/verify-code", response_model=TokenResponse)
async def verify_code_and_login(
    request: VerifyCodeRequest,
    session: Session = Depends(get_session)
):
    """
    验证验证码并登录/注册
    
    功能说明：
    1. 验证手机号码和验证码
    2. 如果验证成功，生成JWT token
    3. 更新用户的验证状态和token信息
    4. 返回token和用户信息
    
    返回：
    - access_token: 访问令牌（有效期30天）
    - refresh_token: 刷新令牌（有效期60天）
    - token_type: 令牌类型（bearer）
    - expires_in: 过期时间（秒）
    - user_id: 用户ID
    - username: 用户名
    """
    phone_number = request.phone_number
    code = request.code
    
    # 查询用户
    user = session.exec(
        select(User).where(User.phone_number == phone_number)
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在，请先发送验证码"
        )
    
    # 验证验证码
    try:
        verify_code(
            stored_code=user.verification_code,
            provided_code=code,
            expires_at=user.verification_code_expires_at
        )
    except VerificationCodeExpiredError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码已过期，请重新发送"
        )
    except VerificationCodeInvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # 验证成功，生成token
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    
    # 更新用户信息
    user.is_verified = True
    user.access_token = access_token
    user.refresh_token = refresh_token
    user.token_expires_at = datetime.utcnow() + timedelta(days=30)
    user.verification_code = None  # 清空验证码
    user.verification_code_expires_at = None
    
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=30 * 24 * 3600,  # 30天，单位：秒
        user_id=user.id,
        username=user.username,
        role=str(user.role) if user.role else "user"  # 添加角色字段（现在 role 是字符串）
    )


@router.post("/refresh-token", response_model=TokenResponse)
async def refresh_access_token(
    request: RefreshTokenRequest,
    session: Session = Depends(get_session)
):
    """
    刷新访问令牌
    
    功能说明：
    1. 验证refresh token
    2. 生成新的access token
    3. 更新用户的token信息
    4. 返回新的token
    
    注意：refresh token本身不会更新，仍然有效60天
    """
    from utils.jwt_handler import refresh_access_token as jwt_refresh
    
    try:
        # 验证refresh token
        payload = verify_token(request.refresh_token, token_type="refresh")
        user_id = payload["sub"]
        
        # 获取用户
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )
        
        # 生成新的access token
        new_access_token = jwt_refresh(request.refresh_token)
        
        # 更新用户的access token
        user.access_token = new_access_token
        user.token_expires_at = datetime.utcnow() + timedelta(days=30)
        
        session.add(user)
        session.commit()
        session.refresh(user)
        
        return TokenResponse(
            access_token=new_access_token,
            refresh_token=request.refresh_token,  # refresh token不变
            token_type="bearer",
            expires_in=30 * 24 * 3600,
            user_id=user.id,
            username=user.username
        )
        
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
