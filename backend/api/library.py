"""
Library API: skill/template abstraction 第一版
"""

import json
from datetime import datetime
from typing import Any

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
from schemas.template_import_export import (
    TemplateConflictInfo,
    TemplateExportData,
    TemplateExportMeta,
    TemplateExportSchema,
    TemplateImportPreviewRequest,
    TemplateImportPreviewResponse,
    TemplateImportRequest,
    TemplateImportResponse,
    XpouchTemplateHeader,
)
from utils.exceptions import AuthorizationError, NotFoundError, ValidationError
from utils.logger import logger

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


# ==================== 模板导入导出 API ====================


def _generate_suggested_key(base_key: str) -> str:
    """生成建议的新 key（添加时间戳后缀）"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{base_key}_imported_{timestamp}"


def _parse_template_export(
    data: dict[str, Any],
) -> tuple[bool, TemplateExportData | None, str | None]:
    """
    解析模板导出数据

    Returns:
        (是否有效, 模板数据, 错误信息)
    """
    try:
        # 检查协议头
        xpouch_template = data.get("xpouch_template", {})
        if not xpouch_template:
            return False, None, "缺少 xpouch_template 协议头"

        version = xpouch_template.get("version", "1.0")
        # 目前只支持 1.0 版本
        if version != "1.0":
            return False, None, f"不支持的协议版本: {version}"

        # 解析模板数据
        template_data = data.get("template", {})
        if not template_data:
            return False, None, "缺少 template 数据"

        # 验证必填字段
        required_fields = ["template_key", "name", "starter_prompt"]
        for field in required_fields:
            if not template_data.get(field):
                return False, None, f"缺少必填字段: {field}"

        # 验证 template_key 格式
        template_key = template_data.get("template_key", "")
        if not _is_valid_template_key(template_key):
            return False, None, f"template_key 格式无效: {template_key}"

        # 构建 TemplateExportData
        export_data = TemplateExportData(
            template_key=template_key,
            name=template_data.get("name", ""),
            description=template_data.get("description"),
            category=template_data.get("category", "general"),
            starter_prompt=template_data.get("starter_prompt", ""),
            system_hint=template_data.get("system_hint"),
            recommended_mode=template_data.get("recommended_mode", "complex"),
            suggested_tags=template_data.get("suggested_tags"),
            tool_hints=template_data.get("tool_hints"),
            expected_artifact_types=template_data.get("expected_artifact_types"),
            artifact_schema_hint=template_data.get("artifact_schema_hint"),
        )

        return True, export_data, None
    except Exception as e:
        return False, None, f"解析失败: {str(e)}"


def _is_valid_template_key(key: str) -> bool:
    """验证 template_key 格式"""
    if not key or len(key) > 128:
        return False
    # 只允许小写字母、数字、连字符和下划线
    import re

    return bool(re.match(r"^[a-z0-9_-]+$", key))


@router.get("/templates/{template_key}/export")
async def export_skill_template(
    template_key: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    导出模板为 JSON

    Returns:
        TemplateExportSchema 结构的 JSON
    """
    # 查询模板
    template = session.exec(
        select(SkillTemplate).where(SkillTemplate.template_key == template_key)
    ).first()

    if template is None:
        raise NotFoundError("模板")

    # 构建导出数据结构
    export_schema = TemplateExportSchema(
        xpouch_template=XpouchTemplateHeader(
            version="1.0", schema_url="https://xpouch.ai/schema/template-v1.json"
        ),
        template=TemplateExportData(
            template_key=template.template_key,
            name=template.name,
            description=template.description,
            category=template.category,
            starter_prompt=template.starter_prompt,
            system_hint=template.system_hint,
            recommended_mode=template.recommended_mode,
            suggested_tags=template.suggested_tags,
            tool_hints=template.tool_hints,
            expected_artifact_types=template.expected_artifact_types,
            artifact_schema_hint=template.artifact_schema_hint,
        ),
        meta=TemplateExportMeta(
            exported_at=datetime.now(),
            exported_by=str(current_user.id) if current_user else None,
            source_instance=None,  # 可从配置读取
        ),
    )

    logger.info(f"[Template Export] 用户 {current_user.id} 导出模板: {template_key}")

    return export_schema


@router.post("/templates/import-preview", response_model=TemplateImportPreviewResponse)
async def preview_import_template(
    request: TemplateImportPreviewRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    预览模板导入

    解析 JSON 内容，检查格式有效性和冲突情况，但不执行导入
    """
    try:
        # 解析 JSON
        try:
            data = json.loads(request.content)
        except json.JSONDecodeError as e:
            return TemplateImportPreviewResponse(valid=False, error=f"JSON 格式无效: {str(e)}")

        # 解析模板数据
        valid, template_data, error = _parse_template_export(data)

        if not valid:
            return TemplateImportPreviewResponse(valid=False, error=error)

        # 检查冲突
        existing = session.exec(
            select(SkillTemplate).where(SkillTemplate.template_key == template_data.template_key)
        ).first()

        conflict_info = TemplateConflictInfo(
            exists=existing is not None,
            existing_template={
                "id": str(existing.id),
                "name": existing.name,
                "template_key": existing.template_key,
                "is_builtin": existing.is_builtin,
            }
            if existing
            else None,
            suggested_key=_generate_suggested_key(template_data.template_key),
        )

        # 提取版本信息
        xpouch_template = data.get("xpouch_template", {})
        version = xpouch_template.get("version", "1.0")

        return TemplateImportPreviewResponse(
            valid=True, version=version, template=template_data, conflict=conflict_info
        )

    except Exception as e:
        logger.error(f"[Template Import Preview] 预览失败: {e}", exc_info=True)
        return TemplateImportPreviewResponse(valid=False, error=f"预览失败: {str(e)}")


@router.post("/templates/import", response_model=TemplateImportResponse)
async def import_skill_template(
    request: TemplateImportRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    执行模板导入

    根据策略执行导入操作（覆盖/克隆/跳过）
    """
    _require_editor(current_user)

    try:
        # 解析 JSON
        try:
            data = json.loads(request.content)
        except json.JSONDecodeError as e:
            return TemplateImportResponse(
                success=False, strategy=request.strategy, message=f"JSON 格式无效: {str(e)}"
            )

        # 解析模板数据
        valid, template_data, error = _parse_template_export(data)

        if not valid:
            return TemplateImportResponse(success=False, strategy=request.strategy, message=error)

        # 验证 recommended_mode
        try:
            _validate_mode(template_data.recommended_mode)
        except ValidationError as e:
            return TemplateImportResponse(success=False, strategy=request.strategy, message=str(e))

        original_key = template_data.template_key
        target_key = original_key

        # 检查冲突
        existing = session.exec(
            select(SkillTemplate).where(SkillTemplate.template_key == original_key)
        ).first()

        # 根据策略处理
        if existing:
            if request.strategy == "skip":
                return TemplateImportResponse(
                    success=False,
                    strategy="skip",
                    template_key=original_key,
                    message=f"模板 '{original_key}' 已存在，已跳过",
                )

            elif request.strategy == "clone":
                # 使用用户指定的 key 或自动生成
                target_key = request.target_key or _generate_suggested_key(original_key)

                # 确保新 key 也不冲突
                while session.exec(
                    select(SkillTemplate).where(SkillTemplate.template_key == target_key)
                ).first():
                    target_key = _generate_suggested_key(target_key)

            elif request.strategy == "override":
                if existing.is_builtin:
                    return TemplateImportResponse(
                        success=False,
                        strategy="override",
                        template_key=original_key,
                        message="内置模板不允许覆盖",
                    )
                # 删除现有模板
                session.delete(existing)
                session.commit()

        # 创建新模板
        new_template = SkillTemplate(
            template_key=target_key,
            name=template_data.name,
            description=template_data.description,
            category=template_data.category,
            starter_prompt=template_data.starter_prompt,
            system_hint=template_data.system_hint,
            recommended_mode=template_data.recommended_mode,
            suggested_tags=template_data.suggested_tags,
            tool_hints=template_data.tool_hints,
            expected_artifact_types=template_data.expected_artifact_types,
            artifact_schema_hint=template_data.artifact_schema_hint,
            is_active=True,
            is_builtin=False,
        )

        session.add(new_template)
        session.commit()
        session.refresh(new_template)

        actual_strategy = (
            "clone" if target_key != original_key else (request.strategy if existing else "new")
        )

        logger.info(
            f"[Template Import] 用户 {current_user.id} 导入模板: "
            f"original={original_key}, target={target_key}, strategy={actual_strategy}"
        )

        return TemplateImportResponse(
            success=True,
            strategy=actual_strategy,
            template_key=target_key,
            template_id=str(new_template.id),
            message=f"模板导入成功: {target_key}",
        )

    except Exception as e:
        session.rollback()
        logger.error(f"[Template Import] 导入失败: {e}", exc_info=True)
        return TemplateImportResponse(
            success=False, strategy=request.strategy, message=f"导入失败: {str(e)}"
        )
