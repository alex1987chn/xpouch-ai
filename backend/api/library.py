"""
Library API: skill/template abstraction 第一版
"""

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from database import get_session
from dependencies import get_current_user
from models import (
    SkillTemplate,
    SkillTemplateCreate,
    SkillTemplateResponse,
    SkillTemplateUpdate,
    User,
    UserRole,
)
from utils.exceptions import AuthorizationError, NotFoundError, ValidationError

router = APIRouter(prefix="/api/library", tags=["library"])

EDITABLE_ADMIN_ROLES = {UserRole.ADMIN, UserRole.EDIT_ADMIN}


def _require_editor(current_user: User) -> None:
    if current_user.role not in EDITABLE_ADMIN_ROLES:
        raise AuthorizationError("仅管理员可编辑模板库")


def _validate_mode(mode: str) -> None:
    if mode not in {"simple", "complex"}:
        raise ValidationError("recommended_mode 仅支持 simple 或 complex")


@router.get("/templates", response_model=list[SkillTemplateResponse])
async def list_skill_templates(
    include_inactive: bool = Query(False),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    statement = select(SkillTemplate).order_by(
        SkillTemplate.is_active.desc(),
        SkillTemplate.category.asc(),
        SkillTemplate.created_at.desc(),
    )
    if not include_inactive:
        statement = statement.where(SkillTemplate.is_active)
    return list(session.exec(statement).all())


@router.post("/templates", response_model=SkillTemplateResponse)
async def create_skill_template(
    payload: SkillTemplateCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_editor(current_user)
    _validate_mode(payload.recommended_mode)
    exists = session.exec(
        select(SkillTemplate).where(SkillTemplate.template_key == payload.template_key)
    ).first()
    if exists is not None:
        raise ValidationError("template_key 已存在")
    template = SkillTemplate(**payload.model_dump(), is_builtin=False)
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.put("/templates/{template_id}", response_model=SkillTemplateResponse)
async def update_skill_template(
    template_id: str,
    payload: SkillTemplateUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_editor(current_user)
    template = session.get(SkillTemplate, template_id)
    if template is None:
        raise NotFoundError("模板")
    updates = payload.model_dump(exclude_none=True)
    if "recommended_mode" in updates:
        _validate_mode(updates["recommended_mode"])
    for field_name, value in updates.items():
        setattr(template, field_name, value)
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.delete("/templates/{template_id}")
async def delete_skill_template(
    template_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_editor(current_user)
    template = session.get(SkillTemplate, template_id)
    if template is None:
        raise NotFoundError("模板")
    if template.is_builtin:
        raise ValidationError("内置模板不允许删除，可改为停用")
    session.delete(template)
    session.commit()
    return {"success": True}
