"""
模板导入导出 Schema

定义模板导入导出的数据结构和请求/响应模型
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# ==================== 导出数据结构 ====================


class XpouchTemplateHeader(BaseModel):
    """模板协议头"""

    version: str = Field(default="1.0", description="协议版本")
    schema_url: str = Field(
        default="https://xpouch.ai/schema/template-v1.json", description="Schema 定义地址"
    )


class TemplateExportMeta(BaseModel):
    """导出元数据"""

    exported_at: datetime = Field(description="导出时间")
    exported_by: str | None = Field(default=None, description="导出用户ID")
    source_instance: str | None = Field(default=None, description="源实例ID")


class TemplateExportData(BaseModel):
    """模板导出数据（与 SkillTemplate 模型对应）"""

    template_key: str = Field(description="模板唯一标识")
    name: str = Field(description="模板名称")
    description: str | None = Field(default=None, description="模板描述")
    category: str = Field(default="general", description="分类")
    starter_prompt: str = Field(description="启动提示")
    system_hint: str | None = Field(default=None, description="系统提示")
    recommended_mode: str = Field(default="complex", description="推荐模式")
    suggested_tags: list[str] | None = Field(default=None, description="建议标签")
    tool_hints: list[str] | None = Field(default=None, description="工具提示")
    expected_artifact_types: list[str] | None = Field(default=None, description="预期产出类型")
    artifact_schema_hint: str | None = Field(default=None, description="产出结构提示")


class TemplateExportSchema(BaseModel):
    """完整的模板导出 Schema"""

    xpouch_template: XpouchTemplateHeader = Field(description="协议头")
    template: TemplateExportData = Field(description="模板数据")
    meta: TemplateExportMeta = Field(description="导出元数据")


# ==================== 导入预览 ====================


class TemplateImportPreviewRequest(BaseModel):
    """导入预览请求"""

    content: str = Field(description="JSON 文件内容")


class TemplateConflictInfo(BaseModel):
    """冲突信息"""

    exists: bool = Field(description="是否已存在")
    existing_template: dict | None = Field(default=None, description="现有模板信息")
    suggested_key: str = Field(description="建议的新 key（克隆时使用）")


class TemplateImportPreviewResponse(BaseModel):
    """导入预览响应"""

    valid: bool = Field(description="JSON 是否有效")
    version: str | None = Field(default=None, description="检测到的协议版本")
    template: TemplateExportData | None = Field(default=None, description="解析出的模板数据")
    conflict: TemplateConflictInfo | None = Field(default=None, description="冲突信息")
    error: str | None = Field(default=None, description="错误信息（无效时）")


# ==================== 导入执行 ====================

TemplateImportStrategy = Literal["override", "clone", "skip"]


class TemplateImportRequest(BaseModel):
    """导入执行请求"""

    content: str = Field(description="JSON 文件内容")
    strategy: TemplateImportStrategy = Field(
        default="clone", description="导入策略: override=覆盖, clone=克隆, skip=跳过"
    )
    target_key: str | None = Field(default=None, description="指定新 key（clone 策略时使用，可选）")


class TemplateImportResponse(BaseModel):
    """导入执行响应"""

    success: bool = Field(description="是否成功")
    strategy: str = Field(description="实际使用的策略")
    template_key: str | None = Field(default=None, description="最终模板 key")
    template_id: str | None = Field(default=None, description="模板ID")
    message: str = Field(description="结果说明")
