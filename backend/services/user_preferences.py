"""用户偏好服务：读写 simple 模式模型/思考偏好（user_settings 表）。

从 routers/system.py 抽取（修复层次穿透：chat router 不得 import 另一 router
的私有函数）；router 层与 graph 注入层共用本服务。
"""

from __future__ import annotations

from sqlmodel import Session

from models import UserSettings

DEFAULT_USER_PREFERENCES: dict = {"simple_model": None, "simple_thinking": "auto"}
VALID_THINKING_MODES = {"auto", "enabled", "disabled"}


def load_user_preferences(session: Session, user_id: str) -> dict:
    """读取用户偏好并与默认值合并（存储缺失或字段缺失时回落默认值）"""
    stored = session.get(UserSettings, user_id)
    prefs = dict(stored.preferences) if stored and stored.preferences else {}
    merged = {**DEFAULT_USER_PREFERENCES, **prefs}
    # 防御历史脏数据
    if merged.get("simple_thinking") not in VALID_THINKING_MODES:
        merged["simple_thinking"] = DEFAULT_USER_PREFERENCES["simple_thinking"]
    return merged
