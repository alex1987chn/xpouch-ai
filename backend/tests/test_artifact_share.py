"""分享令牌服务测试：创建 / 解析 / 撤销 / 权限。

用一次性内存 SQLite（StaticPool 单连接）建齐 share 链路涉及的 5 张表，
不依赖真实数据库（与 CI 空库环境一致）。
"""

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from models import Artifact, ExecutionPlan, ShareToken, SubTask, Thread
from services.chat.share_service import ShareService
from utils.exceptions import AuthorizationError, NotFoundError

_TEST_ENGINE_HOLDER = [None]


async def _init_tables(engine, tables=None):

    async with engine.begin() as conn:
        await conn.run_sync(
            lambda c: (
                SQLModel.metadata.create_all(c, tables=tables)
                if tables
                else SQLModel.metadata.create_all(c)
            )
        )


def _test_session() -> "AsyncSession":
    from sqlmodel.ext.asyncio.session import AsyncSession as _AS

    return _AS(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


TABLES = [
    Thread.__table__,
    ExecutionPlan.__table__,
    SubTask.__table__,
    Artifact.__table__,
    ShareToken.__table__,
]


@pytest.fixture
async def db():
    _TEST_ENGINE_HOLDER[0] = engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    await _init_tables(engine, tables=TABLES)
    async with _test_session() as session:
        yield session


@pytest.fixture
async def owned_artifact(db):
    """u1 名下的 artifact（thread→plan→subtask→artifact 链）"""
    db.add(Thread(id="t1", title="会话", user_id="u1"))
    db.add(ExecutionPlan(id="p1", thread_id="t1", user_query="q"))
    db.add(
        SubTask(
            id="s1",
            execution_plan_id="p1",
            expert_type="coder",
            description="生成示例产物",
            status="completed",
        )
    )
    artifact = Artifact(
        id="a1",
        sub_task_id="s1",
        thread_id="t1",
        type="markdown",
        title="示例产物",
        content="# Hello\n\n世界",
    )
    db.add(artifact)
    await db.commit()
    return artifact


async def test_create_share_returns_token_once(db, owned_artifact):
    service = ShareService(db)
    result = await service.create_share("a1", "u1")

    assert result["token"]
    assert result["path"] == f"/s/{result['token']}"
    # 库里只存哈希，明文不落库
    row = db.query(ShareToken).filter_by(artifact_id="a1").first()
    assert row is not None
    assert row.token_hash != result["token"]
    assert len(row.token_hash) == 64


async def test_resolve_returns_artifact_and_revoked_returns_none(db, owned_artifact):
    service = ShareService(db)
    token = await service.create_share("a1", "u1")["token"]

    artifact = service.resolve(token)
    assert artifact is not None
    assert artifact.id == "a1"

    await service.revoke_shares("a1", "u1")
    assert service.resolve(token) is None


def test_resolve_unknown_token_is_none(db):
    assert ShareService(db).resolve("no-such-token") is None


async def test_create_share_requires_owner(db, owned_artifact):
    service = ShareService(db)
    with pytest.raises(AuthorizationError):
        await service.create_share("a1", "u2")


async def test_create_share_missing_artifact(db):
    service = ShareService(db)
    with pytest.raises(NotFoundError):
        await service.create_share("missing", "u1")
