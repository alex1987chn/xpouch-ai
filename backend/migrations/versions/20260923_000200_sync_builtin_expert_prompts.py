"""内置专家教材修复下发 + router/aggregator 补种（单一真相源 = expert_config）

Revision ID: 20260923_000200
Revises: 20260923_000100
Create Date: 2026-09-23

教材修复内容（代码侧 EXPERT_DEFAULTS 已改，本迁移把已部署库同步到同款）：
1. search：删除死占位符 {current_time}（generic worker 从不替换它；时间由
   执行框架头部注入【当前系统时间】，教材改为指向该头部——消除双通道）；
   One-Shot 禁令改为与框架工具循环协议一致化的表述（原措辞与执行框架
   注入的"多轮工具/防偷懒"指令互相矛盾）
1b. memorize_expert：输出协议从 JSON 数组改为「一行一条记忆、无可记输出
   无」——记忆存储是纯 content 文本 + 向量检索，category/validity 无人承接，
   空数组 [] 还会被整段存成垃圾记忆；消费端（generic.py）配套逐行入库
2. router / aggregator：EXPERT_DEFAULTS 新增种子（此前只在手工造的 DB 行里
   存在，空库初始化后这两个专家缺失，运行时走 constants 静态兜底——而静态
   版规则与 DB 版脑裂且无占位符注入点）。本迁移对全部内置专家做
   INSERT IF NOT EXISTS：已部署库只实际补种 router/aggregator，空库一次种齐
   （内置清单不含 story_writer——题材型创作专家不属系统内置，用户可按需自建）
3. 存量内置标记修复：把系统专家的 is_dynamic/is_system 归位（f/t——
   此前空库灌入走模型默认 t/f，管理台可删核心专家）

不动的东西：is_dynamic=true 的行（用户在管理台自建的专家，如本库的
story_writer）一律不碰——那是用户内容，不是系统教材。

教材内容不复制进本文件：直接 import expert_config.EXPERT_DEFAULTS
（迁移运行环境已含 backend 根于 sys.path），单一真相源。
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import uuid4

from alembic import op
from sqlalchemy import bindparam, text

# revision identifiers, used by Alembic.
revision: str = "20260923_000200"
down_revision: str | None = "20260923_000100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# 教材有实质修复、需要覆盖下发的内置专家（story_writer 不在其列：题材型
# 创作专家已移出内置清单）
_PROMPT_SYNC_TARGETS = {"search", "memorize_expert"}
# 内置标记归位的专家（is_dynamic=true 的行除外）
_SYSTEM_TYPES = {
    "search",
    "coder",
    "researcher",
    "analyzer",
    "writer",
    "planner",
    "image_analyzer",
    "commander",
    "router",
    "aggregator",
    "memorize_expert",
}


def _now() -> str:
    return datetime.now().isoformat()


def upgrade() -> None:
    from expert_config import EXPERT_DEFAULTS

    conn = op.get_bind()

    for entry in EXPERT_DEFAULTS:
        expert_type = entry["expert_type"]

        if expert_type in _PROMPT_SYNC_TARGETS:
            conn.execute(
                text(
                    "UPDATE systemexpert SET system_prompt = :p, updated_at = :u, "
                    "config_version = config_version + 1 "
                    "WHERE expert_type = :t AND is_dynamic = false"
                ),
                {"p": entry["system_prompt"], "u": _now(), "t": expert_type},
            )

        # 全部内置专家 INSERT IF NOT EXISTS（幂等）：已部署库只补缺失的
        # router/aggregator；空库则一次种齐 12 个——注意不能只补 router/
        # aggregator：空库跑完本迁移后表已非空，main.py 的"空表才灌种"自举
        # 会判定已初始化而跳过，其余专家就永远缺失了。迁移即种子。
        exists = conn.execute(
            text("SELECT 1 FROM systemexpert WHERE expert_type = :t"),
            {"t": expert_type},
        ).fetchone()
        if not exists:
            conn.execute(
                text(
                    "INSERT INTO systemexpert "
                    "(id, expert_type, name, description, system_prompt, model, "
                    "temperature, is_dynamic, is_system, config_version, "
                    "created_at, updated_at) "
                    "VALUES (:id, :t, :n, :d, :p, :m, :tp, false, true, 0, :u, :u)"
                ),
                {
                    "id": str(uuid4()),
                    "t": expert_type,
                    "n": entry["name"],
                    "d": entry.get("description"),
                    "p": entry["system_prompt"],
                    "m": entry.get("model", "deepseek-flash"),
                    "tp": entry.get("temperature", 0.5),
                    "u": _now(),
                },
            )

    # 内置标记归位（只动列表内且非用户自建的行）
    conn.execute(
        text(
            "UPDATE systemexpert SET is_dynamic = false, is_system = true "
            "WHERE expert_type IN :types AND is_dynamic = true"
        ).bindparams(bindparam("types", expanding=True)),
        {"types": sorted(_SYSTEM_TYPES)},
    )


def downgrade() -> None:
    # 教材与标记回不去（旧教材含死占位符/占位值缺陷，无回滚价值）；
    # router/aggregator 补种行保留——它们本就该存在
    pass
