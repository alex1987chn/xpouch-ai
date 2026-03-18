"""
模板导入导出功能测试
"""

import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from main import app
from models import SkillTemplate, User, UserRole


@pytest.fixture
def client():
    """测试客户端"""
    return TestClient(app)


@pytest.fixture
def admin_user(session: Session):
    """创建管理员用户"""
    user = User(
        email="admin@test.com",
        phone="13800000000",
        name="Admin",
        role=UserRole.ADMIN,
        hashed_password="test_hash",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture
def regular_user(session: Session):
    """创建普通用户"""
    user = User(
        email="user@test.com",
        phone="13800000001",
        name="User",
        role=UserRole.USER,
        hashed_password="test_hash",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture
def sample_template(session: Session):
    """创建示例模板"""
    template = SkillTemplate(
        template_key="test-template",
        name="测试模板",
        description="用于测试的模板",
        category="test",
        starter_prompt="这是一个测试提示",
        system_hint="系统提示",
        recommended_mode="simple",
        suggested_tags=["test"],
        is_active=True,
        is_builtin=False,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


class TestTemplateExport:
    """测试模板导出功能"""

    def test_export_existing_template(self, client: TestClient, sample_template: SkillTemplate):
        """测试导出现有模板"""
        response = client.get(f"/api/library/templates/{sample_template.template_key}/export")

        assert response.status_code == 200
        data = response.json()

        # 验证协议头
        assert "xpouch_template" in data
        assert data["xpouch_template"]["version"] == "1.0"

        # 验证模板数据
        assert "template" in data
        template = data["template"]
        assert template["template_key"] == sample_template.template_key
        assert template["name"] == sample_template.name
        assert template["starter_prompt"] == sample_template.starter_prompt

        # 验证元数据
        assert "meta" in data
        assert "exported_at" in data["meta"]

    def test_export_nonexistent_template(self, client: TestClient):
        """测试导出不存在模板"""
        response = client.get("/api/library/templates/nonexistent/export")

        assert response.status_code == 404
        assert "不存在" in response.json()["detail"]


class TestTemplateImportPreview:
    """测试模板导入预览功能"""

    def test_preview_valid_new_template(self, client: TestClient):
        """测试预览有效的新模板"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": "new-imported-template",
                "name": "新导入模板",
                "starter_prompt": "新模板提示",
                "category": "imported",
            },
        }

        response = client.post(
            "/api/library/templates/import-preview", json={"content": json.dumps(template_data)}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["valid"] is True
        assert data["version"] == "1.0"
        assert data["template"]["template_key"] == "new-imported-template"
        assert data["conflict"]["exists"] is False
        assert "suggested_key" in data["conflict"]

    def test_preview_existing_template_conflict(
        self, client: TestClient, sample_template: SkillTemplate
    ):
        """测试预览已存在模板的冲突"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": sample_template.template_key,
                "name": "同名模板",
                "starter_prompt": "同名提示",
            },
        }

        response = client.post(
            "/api/library/templates/import-preview", json={"content": json.dumps(template_data)}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["valid"] is True
        assert data["conflict"]["exists"] is True
        assert data["conflict"]["existing_template"]["name"] == sample_template.name

    def test_preview_invalid_json(self, client: TestClient):
        """测试预览无效 JSON"""
        response = client.post(
            "/api/library/templates/import-preview", json={"content": "invalid json"}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["valid"] is False
        assert "JSON" in data["error"]

    def test_preview_missing_required_fields(self, client: TestClient):
        """测试预览缺少必填字段"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                # 缺少 template_key 和 starter_prompt
                "name": "不完整模板"
            },
        }

        response = client.post(
            "/api/library/templates/import-preview", json={"content": json.dumps(template_data)}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["valid"] is False
        assert "必填字段" in data["error"]

    def test_preview_invalid_template_key(self, client: TestClient):
        """测试预览无效的 template_key"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": "Invalid Key With Spaces!",
                "name": "无效key模板",
                "starter_prompt": "提示",
            },
        }

        response = client.post(
            "/api/library/templates/import-preview", json={"content": json.dumps(template_data)}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["valid"] is False
        assert "格式无效" in data["error"]

    def test_preview_unsupported_version(self, client: TestClient):
        """测试预览不支持的版本"""
        template_data = {
            "xpouch_template": {"version": "2.0"},
            "template": {
                "template_key": "future-template",
                "name": "未来模板",
                "starter_prompt": "提示",
            },
        }

        response = client.post(
            "/api/library/templates/import-preview", json={"content": json.dumps(template_data)}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["valid"] is False
        assert "不支持" in data["error"]


class TestTemplateImport:
    """测试模板导入功能"""

    def test_import_new_template(self, client: TestClient, admin_user: User):
        """测试导入新模板"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": "import-new-test",
                "name": "导入新模板测试",
                "starter_prompt": "新模板提示",
                "category": "imported",
                "recommended_mode": "simple",
            },
        }

        response = client.post(
            "/api/library/templates/import",
            json={"content": json.dumps(template_data), "strategy": "clone"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert data["strategy"] == "new"
        assert data["template_key"] == "import-new-test"
        assert "导入成功" in data["message"]

    def test_import_clone_strategy(
        self, client: TestClient, admin_user: User, sample_template: SkillTemplate
    ):
        """测试克隆策略导入"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": sample_template.template_key,
                "name": "克隆的模板",
                "starter_prompt": "克隆提示",
                "recommended_mode": "simple",
            },
        }

        response = client.post(
            "/api/library/templates/import",
            json={"content": json.dumps(template_data), "strategy": "clone"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert data["strategy"] == "clone"
        assert data["template_key"] != sample_template.template_key
        assert "imported" in data["template_key"]  # 验证重命名

    def test_import_override_strategy(
        self, client: TestClient, admin_user: User, sample_template: SkillTemplate
    ):
        """测试覆盖策略导入"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": sample_template.template_key,
                "name": "覆盖后的模板",
                "starter_prompt": "覆盖提示",
                "recommended_mode": "simple",
            },
        }

        response = client.post(
            "/api/library/templates/import",
            json={"content": json.dumps(template_data), "strategy": "override"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert data["strategy"] == "override"
        assert data["template_key"] == sample_template.template_key

    def test_import_skip_strategy(
        self, client: TestClient, admin_user: User, sample_template: SkillTemplate
    ):
        """测试跳过策略导入"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": sample_template.template_key,
                "name": "跳过的模板",
                "starter_prompt": "跳过提示",
                "recommended_mode": "simple",
            },
        }

        response = client.post(
            "/api/library/templates/import",
            json={"content": json.dumps(template_data), "strategy": "skip"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is False
        assert data["strategy"] == "skip"
        assert "已跳过" in data["message"]

    def test_import_builtin_override_fails(
        self, client: TestClient, admin_user: User, session: Session
    ):
        """测试覆盖内置模板失败"""
        # 创建内置模板
        builtin = SkillTemplate(
            template_key="builtin-test", name="内置模板", starter_prompt="内置提示", is_builtin=True
        )
        session.add(builtin)
        session.commit()

        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": "builtin-test",
                "name": "覆盖尝试",
                "starter_prompt": "覆盖提示",
                "recommended_mode": "simple",
            },
        }

        response = client.post(
            "/api/library/templates/import",
            json={"content": json.dumps(template_data), "strategy": "override"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is False
        assert "内置模板" in data["message"]

    def test_import_invalid_mode(self, client: TestClient, admin_user: User):
        """测试导入无效的 recommended_mode"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": "invalid-mode",
                "name": "无效模式模板",
                "starter_prompt": "提示",
                "recommended_mode": "invalid_mode",
            },
        }

        response = client.post(
            "/api/library/templates/import",
            json={"content": json.dumps(template_data), "strategy": "clone"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["success"] is False
        assert "recommended_mode" in data["message"]

    def test_import_regular_user_forbidden(self, client: TestClient, regular_user: User):
        """测试普通用户无法导入"""
        template_data = {
            "xpouch_template": {"version": "1.0"},
            "template": {
                "template_key": "unauthorized-test",
                "name": "未授权测试",
                "starter_prompt": "提示",
                "recommended_mode": "simple",
            },
        }

        response = client.post(
            "/api/library/templates/import",
            json={"content": json.dumps(template_data), "strategy": "clone"},
        )

        assert response.status_code == 403
        assert "管理员" in response.json()["detail"]


class TestTemplateImportExportIntegration:
    """导入导出集成测试"""

    def test_export_then_import(
        self, client: TestClient, admin_user: User, sample_template: SkillTemplate
    ):
        """测试导出后导入（完整流程）"""
        # 1. 导出模板
        export_response = client.get(
            f"/api/library/templates/{sample_template.template_key}/export"
        )
        assert export_response.status_code == 200

        export_data = export_response.json()
        export_json = json.dumps(export_data)

        # 2. 预览导入
        preview_response = client.post(
            "/api/library/templates/import-preview", json={"content": export_json}
        )
        assert preview_response.status_code == 200

        preview_data = preview_response.json()
        assert preview_data["valid"] is True
        assert preview_data["conflict"]["exists"] is True  # 已存在

        # 3. 克隆导入
        import_response = client.post(
            "/api/library/templates/import", json={"content": export_json, "strategy": "clone"}
        )
        assert import_response.status_code == 200

        import_data = import_response.json()
        assert import_data["success"] is True
        assert import_data["strategy"] == "clone"

        # 4. 验证导入的模板
        new_key = import_data["template_key"]
        new_template_response = client.get(f"/api/library/templates/{new_key}/export")
        assert new_template_response.status_code == 200

        new_template = new_template_response.json()["template"]
        assert new_template["name"] == sample_template.name
        assert new_template["starter_prompt"] == sample_template.starter_prompt
