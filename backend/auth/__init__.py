"""认证路由包。

原 auth.py 单文件（701 行）拆分为 schemas / cookies / limiter / verify /
routes_otp / routes_password / routes_account；本文件只负责组装 router
（消费方直接 import 对应子模块，不再走包级 re-export）。
"""

from fastapi import APIRouter

from auth.routes_account import router as account_router
from auth.routes_otp import router as otp_router
from auth.routes_password import router as password_router

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
router.include_router(otp_router)
router.include_router(password_router)
router.include_router(account_router)

__all__ = ["router"]
