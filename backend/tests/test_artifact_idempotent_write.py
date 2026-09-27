"""产物写入幂等回归（2026-09-27 产物 ×4 事故）。

事故链：任务产物的保存有多条并发路径（后台队列保存 / 流收尾批量收集 /
HITL 恢复回放），各自持独立 session 同时抵达；create_artifacts_batch 的
「先查后插」护栏在跨 session 并发下失效；且部分路径把 raw dict 直接当
DTO 用——载荷键名 artifact_id 与模型字段名 id 不一致，身份被静默丢弃后
每路生成随机新 uuid，主键去重随之失效，同一产物最多落下四行。

修复后：artifact_id 在 batch 内归一进 id 主键（单一归一入口），并发
冲突撞 PK 时首写赢、后到者按幂等空手而归。
"""

import sys
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from crud.execution_plan import create_artifacts_batch  # noqa: E402
from models import Artifact  # noqa: E402


async def _init_tables(engine):
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: SQLModel.metadata.create_all(c))


class _EmptyResult:
    """模拟「先查时另一路尚未提交」的空结果。"""

    def first(self):
        return None

    def all(self):
        return []


class _StalePrecheckSession:
    """前 N 次 exec 返回空结果（制造 check-then-insert 竞态），其余透传真实会话。"""

    def __init__(self, real, blind_calls: int = 1):
        self._real = real
        self._blind = blind_calls

    async def exec(self, statement):
        if self._blind > 0:
            self._blind -= 1
            return _EmptyResult()
        return await self._real.exec(statement)

    def __getattr__(self, name):
        return getattr(self._real, name)


@pytest.fixture
async def db_engine(tmp_path):
    # 临时文件库：多条独立会话模拟并发写入方，StaticPool 单连接做不到
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/artifact-test.db")
    await _init_tables(engine)
    yield engine
    await engine.dispose()


@pytest.fixture
async def make_session(db_engine):
    from sqlmodel.ext.asyncio.session import AsyncSession

    async def _make():
        return AsyncSession(db_engine)

    return _make


@pytest.mark.asyncio
async def test_batch_normalizes_artifact_id_into_pk(make_session):
    """raw dict 载荷的 artifact_id 必须归一为行主键——这是多路径幂等的身份基础。"""
    session = await make_session()
    created = await create_artifacts_batch(
        session,
        "sub-1",
        [{"type": "text", "title": "结果", "content": "C", "artifact_id": "art-1"}],
    )

    assert len(created) == 1
    assert created[0].id == "art-1"


@pytest.mark.asyncio
async def test_batch_race_loser_noops_on_pk_conflict(make_session):
    """并发竞态：先查时另一路尚未提交（预检失明），插入撞 PK 必须首写赢、后到者空手而归。"""
    # 第一路（先写方）：显式 artifact_id 落库
    first = await make_session()
    created_first = await create_artifacts_batch(
        first,
        "sub-1",
        [{"type": "text", "title": "结果", "content": "C", "artifact_id": "art-1"}],
    )
    assert len(created_first) == 1

    # 第二路（竞态方）：预检被盲化（看不到已提交行），带着同一 artifact_id 插入
    second_real = await make_session()
    second = _StalePrecheckSession(second_real, blind_calls=1)
    created_second = await create_artifacts_batch(
        second,
        "sub-1",
        [{"type": "text", "title": "结果", "content": "C", "artifact_id": "art-1"}],
    )

    assert created_second == []

    # 全库仍只有一行，且竞态方会话在回滚后可用（能继续正常查询）
    checker = await make_session()
    rows = (await checker.exec(select(Artifact).where(Artifact.sub_task_id == "sub-1"))).all()
    assert len(rows) == 1
    assert rows[0].id == "art-1"


@pytest.mark.asyncio
async def test_get_embedding_does_not_await_sync_client_factory(monkeypatch):
    """get_embedding_client_async 是同步工厂（返回三元组）：误 await 会 TypeError
    被 except 吞成空列表，全部记忆向量操作静默全灭（2026-09-27 记忆保存失败事故）。"""

    class _FakeEmbeddings:
        async def create(self, input, model):  # noqa: A002
            class _Data:
                embedding = [0.1, 0.2, 0.3]

            class _Resp:
                data = [_Data()]

            return _Resp()

    class _FakeClient:
        embeddings = _FakeEmbeddings()

    import services.memory_manager as mm

    # 同步工厂：直接返回元组（若实现误 await，此 fake 元组会炸 TypeError）
    monkeypatch.setattr(
        mm,
        "get_embedding_client_async",
        lambda: (_FakeClient(), "test-model", 1024),
    )

    vector = await mm.get_embedding("测试文本")

    assert vector == [0.1, 0.2, 0.3]
