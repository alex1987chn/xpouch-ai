"""记忆改写语义 + 检索时效衰减的数学契约。

- 改写（rewrite_memory）：精确单行替换（old_content 逐字匹配、未命中
  fail-loud 给出自愈指引）、新内容重嵌入、created_at 刷新（新事实按新
  时间参与衰减）。
- 衰减（blended_recency_score / recency_weight）：90 天半衰期；相似度
  clamp 到 [0,1]；同相似度时新记忆胜出。排序语义必须有独立于数据库的
  测试钉住——首版曾在 SQL 侧把余弦距离当相似度用，排序整个反了。

sqlite 无法承载 pgvector 的 `<=>` 算子，检索 SQL 不在本文件测试范围
（e2e 覆盖）；改写只走普通 select，sqlite 可跑。
"""

from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select

from models.memory import UserMemory
from services.memory_manager import (
    RECENCY_HALF_LIFE_DAYS,
    MemoryManager,
    blended_recency_score,
    cosine_similarity,
    recency_weight,
)
from utils.time import utc_now

_TEST_ENGINE_HOLDER = [None]


def _test_session():
    from sqlmodel.ext.asyncio.session import AsyncSession

    return AsyncSession(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


# ---------- 纯函数：衰减数学 ----------


class TestRecencyDecay:
    def test_half_life(self):
        assert recency_weight(0.0) == pytest.approx(1.0)
        assert recency_weight(RECENCY_HALF_LIFE_DAYS) == pytest.approx(0.5)
        assert recency_weight(RECENCY_HALF_LIFE_DAYS * 2) == pytest.approx(0.25)
        assert recency_weight(-5.0) == pytest.approx(1.0)  # 未来时间按 0

    def test_similarity_direction(self):
        # 同向=1、正交=0、反向=-1：方向必须正确（首版曾把距离当相似度）
        assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
        assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)
        assert cosine_similarity([1.0, 0.0], [-1.0, 0.0]) == pytest.approx(-1.0)
        assert cosine_similarity([0.0, 0.0], [1.0, 0.0]) == pytest.approx(0.0)

    def test_blended_ranking_same_similarity_newer_wins(self):
        now = utc_now()
        vec = [1.0, 0.0]
        fresh = blended_recency_score(vec, vec, now - timedelta(days=1), now)
        old = blended_recency_score(vec, vec, now - timedelta(days=365), now)
        assert fresh == pytest.approx(0.99, abs=0.01)  # 1 天 ≈ 2^(-1/90)
        assert old < 0.1  # 一年 ≈ 4 个半衰期 ≈ 0.0625
        assert fresh > old

    def test_blended_clamps_negative_similarity(self):
        # 反义记忆（sim=-1）不得因衰减项翻正
        now = utc_now()
        opposite = blended_recency_score([-1.0, 0.0], [1.0, 0.0], now, now)
        assert opposite == 0.0

    def test_high_similarity_old_vs_low_similarity_new(self):
        # 强相关但陈旧 vs 弱相关但新鲜：90 天半衰期下，0.9×0.25(180d) 仍胜
        # 0.15×1.0——衰减是次序微调，不掩盖语义相关性
        now = utc_now()
        old_relevant = blended_recency_score(
            [0.95, 0.31], [1.0, 0.0], now - timedelta(days=180), now
        )
        fresh_weak = blended_recency_score([0.15, 0.99], [1.0, 0.0], now, now)
        assert old_relevant > fresh_weak


# ---------- DB 语义：改写 ----------


@pytest.fixture
async def db(monkeypatch):
    _TEST_ENGINE_HOLDER[0] = engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda c: SQLModel.metadata.create_all(c, tables=[UserMemory.__table__])
        )

    monkeypatch.setattr("services.memory_manager.SessionFactory", _test_session)

    async with _test_session() as session:
        session.add(
            UserMemory(
                user_id="u1",
                content="User lives in Beijing.",
                embedding=[1.0] * 8,
                created_at=utc_now() - timedelta(days=400),
            )
        )
        session.add(
            UserMemory(
                user_id="u2",  # 隔离对照：跨用户不可见
                content="User lives in Beijing.",
                embedding=[1.0] * 8,
            )
        )
        await session.commit()
        yield session
    await engine.dispose()


@pytest.fixture
def fake_embedding(monkeypatch):
    calls: list[str] = []

    async def _fake(text: str) -> list[float]:
        calls.append(text)
        return [0.5] * 8

    monkeypatch.setattr("services.memory_manager.get_embedding", _fake)
    return calls


class TestRewriteMemory:
    async def test_exact_rewrite_replaces_row(self, db, fake_embedding):
        ok, message = await MemoryManager().rewrite_memory(
            "u1", "User lives in Beijing.", "User lives in Hangzhou."
        )
        assert ok is True
        assert message == "User lives in Hangzhou."

        rows = (await db.exec(select(UserMemory))).all()
        mine = [r for r in rows if r.user_id == "u1"]
        assert [r.content for r in mine] == ["User lives in Hangzhou."]
        # 重嵌入用了新内容
        assert fake_embedding == ["User lives in Hangzhou."]
        # created_at 刷新：改写后的记忆按新时间参与衰减
        assert mine[0].created_at > utc_now() - timedelta(seconds=5)
        # 跨用户行原样保留
        assert any(r.user_id == "u2" and r.content == "User lives in Beijing." for r in rows)

    async def test_no_match_fails_loud_with_self_heal_hint(self, db, fake_embedding):
        ok, message = await MemoryManager().rewrite_memory(
            "u1", "User lives in Shanghai.", "User lives in Hangzhou."
        )
        assert ok is False
        assert "search_memories" in message  # 自愈指引：先取原文再改
        rows = (await db.exec(select(UserMemory))).all()
        assert len(rows) == 2  # 无一行被动过

    async def test_identical_content_rejected(self, db, fake_embedding):
        ok, message = await MemoryManager().rewrite_memory(
            "u1", "User lives in Beijing.", "User lives in Beijing."
        )
        assert ok is False
        assert "相同" in message

    async def test_empty_arguments_rejected(self, db, fake_embedding):
        ok, _ = await MemoryManager().rewrite_memory("u1", "  ", "new")
        assert ok is False
        ok, _ = await MemoryManager().rewrite_memory("u1", "old", "")
        assert ok is False
