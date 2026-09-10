"""全局模型偏好服务：读写 simple 模式的全局默认模型/思考偏好（system_setting 表）。

v3.4.7 起模型偏好从「每用户个人设置」收敛为「管理员配置的全局默认」：
- 读取链：system_setting 全局值 → 字段默认值（simple_model=None 即跟随
  env 的系统默认模型 MODEL_NAME）
- 写入口仅 ADMIN（routers/system.py PUT /user/settings 角色守卫）
- 历史每用户覆盖值（user_settings.preferences）不再参与解析，列保留不迁移

从 routers/system.py 抽取（修复层次穿透：chat router 不得 import 另一 router
的私有函数）；router 层与 graph 注入层共用本服务。
"""

from __future__ import annotations

import json

from sqlmodel import Session

from models import SystemSetting
from utils.logger import logger

MODEL_PREFERENCES_KEY = "model_preferences"
DEFAULT_MODEL_PREFERENCES: dict = {"simple_model": None, "simple_thinking": "auto"}
VALID_THINKING_MODES = {"auto", "enabled", "disabled"}


def load_model_preferences(session: Session) -> dict:
    """读取全局模型偏好并与默认值合并（缺失、脏 JSON、脏字段回落默认值）"""
    stored = session.get(SystemSetting, MODEL_PREFERENCES_KEY)
    prefs: dict = {}
    if stored:
        try:
            parsed = json.loads(stored.value)
            if isinstance(parsed, dict):
                prefs = parsed
            else:
                logger.warning("[ModelPreferences] 全局偏好非 JSON 对象，回落默认值")
        except (ValueError, TypeError):
            logger.warning("[ModelPreferences] 全局偏好 JSON 解析失败，回落默认值")
    merged = {**DEFAULT_MODEL_PREFERENCES, **prefs}
    # 防御历史脏数据
    if merged.get("simple_thinking") not in VALID_THINKING_MODES:
        merged["simple_thinking"] = DEFAULT_MODEL_PREFERENCES["simple_thinking"]
    return merged


def save_model_preferences(
    session: Session, *, simple_model: str | None, simple_thinking: str
) -> dict:
    """写入全局模型偏好（upsert），返回合并后的生效值"""
    preferences = {"simple_model": simple_model, "simple_thinking": simple_thinking}
    payload = json.dumps(preferences, ensure_ascii=False)
    stored = session.get(SystemSetting, MODEL_PREFERENCES_KEY)
    if stored:
        stored.value = payload
        session.add(stored)
    else:
        session.add(SystemSetting(key=MODEL_PREFERENCES_KEY, value=payload))
    session.commit()
    return load_model_preferences(session)
