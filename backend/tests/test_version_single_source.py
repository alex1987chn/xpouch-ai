"""版本号单一真相源的防回归测试。

背景：版本号曾在 6 处各写一份且没有闸门（根 package.json、frontend/package.json、
pyproject.toml、config.py 的 VERSION 默认值、前端 ui.ts 常量、.env.example 注释）。
结果是**恰好用户能看见的两处**——管理台「系统状态」版本卡（读 config.settings.version）
与设置中心「关于」（读前端常量）——在 v3.5.2 / v3.5.3 连续两个版本漏更新，界面一直
显示旧版本号。

收敛后：真相源只有 `backend/pyproject.toml` 一处；运行时由 utils/version.py 读取，
前端由 vite.config.ts 在构建期注入 `__APP_VERSION__`。本测试锁住这两条前提，
防止有人再引入第二份版本号（"再写一份"正是问题本身）。
"""

import json
import tomllib
from pathlib import Path

from config import Settings
from utils.version import APP_VERSION

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


def test_app_version_matches_pyproject() -> None:
    """运行时版本 == pyproject 的声明（真相源读取链路可用）。"""
    with (BACKEND_DIR / "pyproject.toml").open("rb") as f:
        declared = tomllib.load(f)["project"]["version"]

    assert declared == APP_VERSION
    # 读取失败会退化为哨兵值：单独断言，避免将来 pyproject 挪位置后悄悄返回 0.0.0+unknown
    assert APP_VERSION != "0.0.0+unknown"


def test_config_does_not_declare_version() -> None:
    """config.Settings 不得再有 version 字段（防回归：它就是曾经陈旧的那份）。"""
    assert "version" not in Settings.model_fields, (
        "版本号只能来自 pyproject.toml + utils/version.py；"
        "别在 config.Settings 里重新加 version 字段——那会再次制造第二份真相源。"
    )


def test_npm_manifests_do_not_declare_version() -> None:
    """两个 package.json 不得再写 version（渲染层与构建层都不再依赖它们）。"""
    for manifest in (REPO_ROOT / "package.json", REPO_ROOT / "frontend" / "package.json"):
        data = json.loads(manifest.read_text(encoding="utf-8"))
        assert "version" not in data, (
            f"{manifest} 不应再声明 version："
            "前端版本由 vite.config.ts 从 backend/pyproject.toml 注入，"
            "这两个 private 包从未被发布（镜像 tag 用 GIT_VERSION）。"
        )
