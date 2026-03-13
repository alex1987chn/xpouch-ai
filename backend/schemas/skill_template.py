"""
Skill / Template DTO
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SkillTemplateCreate(BaseModel):
    template_key: str
    name: str
    description: str | None = None
    category: str = "general"
    starter_prompt: str
    system_hint: str | None = None
    recommended_mode: str = "complex"
    suggested_tags: list[str] | None = None
    tool_hints: list[str] | None = None
    expected_artifact_types: list[str] | None = None
    artifact_schema_hint: str | None = None
    is_active: bool = True


class SkillTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    starter_prompt: str | None = None
    system_hint: str | None = None
    recommended_mode: str | None = None
    suggested_tags: list[str] | None = None
    tool_hints: list[str] | None = None
    expected_artifact_types: list[str] | None = None
    artifact_schema_hint: str | None = None
    is_active: bool | None = None


class SkillTemplateResponse(BaseModel):
    id: str
    template_key: str
    name: str
    description: str | None = None
    category: str
    starter_prompt: str
    system_hint: str | None = None
    recommended_mode: str
    suggested_tags: list[str] | None = None
    tool_hints: list[str] | None = None
    expected_artifact_types: list[str] | None = None
    artifact_schema_hint: str | None = None
    is_active: bool
    is_builtin: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
