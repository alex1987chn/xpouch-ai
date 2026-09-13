"""专家名册：**任何登录用户可读**的只读端点。

[为什么需要它] 专家的**显示名**是管理员在控制台可改的（`systemexpert.name`：例如
`aggregator` 的显示名是「首席联络官」），而前端此前只有两份都不可靠的副本——
写死的 i18n 词条（管理员改名后会漂移）和自定义智能体列表（`GET /agents` 只含自定义专家）。
能读到权威名的 `GET /admin/experts` 是**管理员**端点，普通用户拿不到，于是任务步骤、
计划审批弹窗、修订对照三处只能显示 `expert_type` 原串（界面上就是「search 执行」）。

[为什么单独一支而不是复用 admin 的 ExpertResponse] 后者含 `system_prompt`、`model`、
`temperature`、`config_version`——那是实例级管理信息。只为了显示一个名字而把它们发给
所有用户，是权限面的不必要扩大。这里只回 `expert_key` + `name` 两个字段。
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from dependencies import get_current_user
from models import SystemExpert, User

router = APIRouter(prefix="/api/experts", tags=["experts"])


class ExpertCatalogItem(BaseModel):
    """名册条目：只有"这是谁"所需的两个字段。"""

    expert_key: str
    name: str


@router.get("/catalog", response_model=list[ExpertCatalogItem])
async def get_expert_catalog(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ExpertCatalogItem]:
    """列出全部专家的 key 与显示名（供前端把 expert_type 翻成名字）。"""
    experts = session.exec(select(SystemExpert).order_by(SystemExpert.created_at)).all()
    return [ExpertCatalogItem(expert_key=expert.expert_key, name=expert.name) for expert in experts]
