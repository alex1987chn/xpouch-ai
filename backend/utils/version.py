"""应用版本号的单一真相源。

版本号只在 `backend/pyproject.toml` 里写一次（uv 与打包系统本来就需要它），
运行时的值由本模块在 import 时读出来——发版只需要改 pyproject 一处 + `uv lock`。

为什么要有这个模块：版本号此前散在 6 处（根 package.json、frontend/package.json、
pyproject.toml、config.py 的 VERSION 默认值、前端 ui.ts 的常量、.env.example 的注释），
没有真源也没有闸门。结果是**恰好用户能看见的两处**（config.py 默认值 → 管理台
「系统状态」版本卡；ui.ts 常量 → 设置中心「关于」）在 v3.5.2 / v3.5.3 连续两次
漏更新，界面一直显示旧版本，而生产也不会通过 env 覆盖它（deploy 只注入 GIT_VERSION
做镜像 tag）。收敛到 pyproject 后，这类漏更新在结构上不再可能。

前端同理：`frontend/vite.config.ts` 在构建时读同一个文件注入 `__APP_VERSION__`。

读取失败（文件缺失/无 version 字段）不抛异常——版本只影响展示，不该拦住启动；
此时返回 UNKNOWN_VERSION，让界面显示得"明显不对"而不是显示一个错的旧值。
"""

import tomllib
from pathlib import Path

from utils.logger import logger

# 读取失败时的哨兵值：刻意用一个不像正式版本号的字符串，
# 避免它被误当成真实版本（历史上正是"陈旧但看起来正常"的值骗过了目检）。
UNKNOWN_VERSION = "0.0.0+unknown"

# 本地（backend/utils/version.py）与容器内（/app/utils/version.py）都是"上两级目录"
# ——backend/Dockerfile 把 pyproject.toml COPY 到应用根目录，与 config.py 同级。
_PYPROJECT_PATH = Path(__file__).resolve().parent.parent / "pyproject.toml"


def _read_pyproject_version() -> str:
    try:
        with _PYPROJECT_PATH.open("rb") as f:
            return str(tomllib.load(f)["project"]["version"])
    except Exception as e:
        logger.warning(f"[Version] 无法从 {_PYPROJECT_PATH} 读取版本号: {e}")
        return UNKNOWN_VERSION


APP_VERSION: str = _read_pyproject_version()
