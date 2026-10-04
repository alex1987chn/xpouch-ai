from datetime import datetime
from math import exp, log

from sqlmodel import select

from database import SessionFactory
from models.memory import UserMemory
from providers_config import get_embedding_client_async
from utils.logger import logger
from utils.time import utc_now

# 检索时效衰减半衰期（天）：相似度权重每过 90 天减半。偏好类记忆缓变，
# 90 天让"半年前的旧偏好"自然沉到同相似度的新记忆之后；常数而非配置——
# 它是检索排序语义的一部分，改它就是改行为契约（测试钉住）。
RECENCY_HALF_LIFE_DAYS = 90.0
# 衰减重排的候选池倍数：先按纯相似度取 3×limit，再混入时效重排——
# 候选池太小衰减没得挑，太大浪费 IO。
DECAY_CANDIDATE_MULTIPLIER = 3


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """余弦相似度 ∈ [-1,1]（维度一致由调用方保证；零向量按 0 处理）。"""
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = sum(v * v for v in a) ** 0.5
    norm_b = sum(v * v for v in b) ** 0.5
    if not norm_a or not norm_b:
        return 0.0
    return dot / (norm_a * norm_b)


def recency_weight(age_days: float) -> float:
    """时效权重：exp(-ln2·age/半衰期)，age 以天计、负数按 0。"""
    age_days = max(age_days, 0.0)
    return exp(-log(2) * age_days / RECENCY_HALF_LIFE_DAYS)


def blended_recency_score(
    embedding: list[float],
    query_vector: list[float],
    created_at: datetime,
    now: datetime,
) -> float:
    """检索重排分：sim × 时效权重。

    sim clamp 到 [0,1]——反义的旧记忆不该因衰减项翻正。模块级纯函数：
    排序语义必须有独立于数据库的测试钉住（首版曾在 SQL 侧把距离当相似度
    用，排序整个反了）。
    """
    sim = max(0.0, cosine_similarity(embedding, query_vector))
    age_days = (now - created_at).total_seconds() / 86400.0
    return sim * recency_weight(age_days)


async def get_embedding(text: str) -> list[float]:
    """
    获取向量嵌入

    从 providers.yaml 读取配置，支持动态切换提供商
    """
    try:
        # 从统一配置获取客户端（同步工厂，返回 (client, model, dimensions) 三元组；
        # 误 await 会 TypeError 被下方 except 吞成空列表，全部向量操作静默全灭）
        client, model, dimensions = get_embedding_client_async()

        response = await client.embeddings.create(input=text.replace("\n", " "), model=model)
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"[Memory] Embedding Error: {e}")
        return []


class MemoryManager:
    """记忆管理器 - 处理用户长期记忆的存储和检索"""

    # --- 同步方法 (运行在线程池中) ---
    async def _add_memory_impl(
        self, user_id: str, content: str, source: str = "conversation", memory_type: str = "fact"
    ):
        """同步添加记忆到数据库。

        embedding 失败抛 RuntimeError 而非静默返回：调用方（generic 记忆分支）
        会向用户如实上报"未记住"——静默跳过曾让用户以为记住了实际没有。
        """
        if not content or not content.strip():
            return

        # 1. 转向量
        vector = await get_embedding(content)
        if not vector:
            raise RuntimeError(f"embedding 为空，无法生成记忆向量: {content[:50]}...")

        # 2. 幂等去重：同用户同内容不重复入库（"记住我名字"类指令会反复触发，
        #    也让写入中途失败后的重试安全——已入库的行不会被重复种）
        # 3. 存入数据库
        try:
            async with SessionFactory() as session:
                dup = (
                    await session.exec(
                        select(UserMemory).where(
                            UserMemory.user_id == user_id,
                            UserMemory.content == content,
                        )
                    )
                ).first()
                if dup:
                    logger.info(f"[Memory] 重复记忆跳过（同用户同内容）: {content[:50]}...")
                    return
                memory = UserMemory(
                    user_id=user_id,
                    content=content,
                    embedding=vector,
                    created_at=utc_now(),
                    source=source,
                    memory_type=memory_type,
                )
                session.add(memory)
                await session.commit()
                logger.info(f"[Memory] ✅ 已记住: {content[:80]}...")
        except Exception as e:
            # 包装为 RuntimeError：调用方（generic 记忆分支）只接 RuntimeError/ValueError，
            # 裸 psycopg 异常会穿透到执行框架层
            raise RuntimeError(f"记忆数据库写入失败: {e}") from e

    async def _list_memories_impl(self, user_id: str, limit: int = 50) -> list[str]:
        """列出当前用户的记忆（最近的在前），供"查看我的记忆"类请求出具清单，
        也是改写前定位记忆原文的数据源。"""
        try:
            async with SessionFactory() as session:
                rows = (
                    await session.exec(
                        select(UserMemory)
                        .where(UserMemory.user_id == user_id)
                        .order_by(UserMemory.created_at.desc())
                        .limit(limit)
                    )
                ).all()
                return [r.content for r in rows]
        except Exception as e:
            raise RuntimeError(f"记忆查询失败: {e}") from e

    async def _delete_memories_impl(
        self, user_id: str, keyword: str, *, dry_run: bool = False
    ) -> list[str]:
        """按关键词匹配删除（或预览）当前用户的记忆。

        匹配规则：content ILIKE %keyword%，**严格限定 user_id**（跨用户零交集）。
        返回被删除（dry_run 时为预览命中）的记忆内容列表，供调用方向用户出具
        清单。硬删除：记忆是可再生数据（用户随时可再"记住"），无软删除必要。
        """
        keyword = (keyword or "").strip()
        if not keyword:
            return []
        pattern = f"%{keyword}%"
        try:
            async with SessionFactory() as session:
                rows = (
                    await session.exec(
                        select(UserMemory)
                        .where(UserMemory.user_id == user_id, UserMemory.content.ilike(pattern))
                        .order_by(UserMemory.created_at)
                    )
                ).all()
                contents = [r.content for r in rows]
                if not dry_run:
                    for r in rows:
                        await session.delete(r)
                    await session.commit()
                    logger.info(f"[Memory] 🗑️ 已删除 {len(contents)} 条记忆（关键词: {keyword}）")
                return contents
        except Exception as e:
            raise RuntimeError(f"记忆删除失败: {e}") from e

    async def _rewrite_memory_impl(
        self, user_id: str, old_content: str, new_content: str
    ) -> tuple[bool, str]:
        """精确改写单条记忆（"把 XX 改成 YY"）。

        old_content 必须与存储行逐字相等：入库幂等去重保证同用户同内容唯一，
        精确文本即唯一键（模型从 search_memories 的清单里原样复制即可拿到）。
        未命中返回 (False, 提示)——改写是精确操作，宁 fail-loud 也不做关键词
        模糊替换（多行命中被一并覆盖成一条，信息静默丢失）。命中则整行替换
        内容 + 重新向量化，created_at 刷新（新事实按新时间参与时效衰减）。
        """
        old_content, new_content = old_content.strip(), new_content.strip()
        if not old_content or not new_content:
            return False, "old_content 与 new_content 都不能为空"
        if old_content == new_content:
            return False, "新旧内容相同，无需改写"

        try:
            async with SessionFactory() as session:
                row = (
                    await session.exec(
                        select(UserMemory).where(
                            UserMemory.user_id == user_id,
                            UserMemory.content == old_content,
                        )
                    )
                ).first()
                if not row:
                    return False, (
                        f"未找到与原文逐字匹配的记忆（{old_content[:60]}...）。"
                        "请先用 search_memories 查到记忆原文，再把原文整段作为 old_content 传入。"
                    )

                vector = await get_embedding(new_content)
                if not vector:
                    raise RuntimeError(f"embedding 为空，改写失败: {new_content[:50]}...")

                row.content = new_content
                row.embedding = vector
                row.created_at = utc_now()
                session.add(row)
                await session.commit()
                logger.info(
                    f"[Memory] ✏️ 已改写记忆 #{row.id}: {old_content[:40]}... → {new_content[:40]}..."
                )
                return True, new_content
        except Exception as e:
            raise RuntimeError(f"记忆改写失败: {e}") from e

    async def _search_impl(self, user_id: str, query: str, limit: int = 5) -> str:
        """检索相关记忆（相似度 × 时效衰减重排）"""
        if not query or not query.strip():
            return ""

        logger.info("[Memory] _search_sync start")
        query_vector = await get_embedding(query)
        logger.info(f"[Memory] embedding done, dim={len(query_vector) if query_vector else 0}")
        if not query_vector:
            return ""

        try:
            async with SessionFactory() as session:
                logger.info("[Memory] db session acquired, querying")
                # 🔥 先按纯相似度取候选池，时效衰减在池内重排
                statement = (
                    select(UserMemory)
                    .where(UserMemory.user_id == user_id)
                    .order_by(UserMemory.embedding.cosine_distance(query_vector))
                    .limit(limit * DECAY_CANDIDATE_MULTIPLIER)
                )

                results = (await session.exec(statement)).all()
            logger.info(f"[Memory] query done, {len(results)} rows")

            if not results:
                return ""

            now = utc_now()
            top = sorted(
                results,
                key=lambda m: blended_recency_score(m.embedding, query_vector, m.created_at, now),
                reverse=True,
            )[:limit]

            # 格式化返回记忆内容
            memories = []
            for m in top:
                prefix = f"[{m.memory_type}]" if m.memory_type != "fact" else ""
                memories.append(f"{prefix} {m.content}")

            return "\n".join([f"- {m}" for m in memories])

        except Exception as e:
            logger.error(f"[Memory] ❌ 检索失败: {e}")
            return ""

    # --- 异步入口 (供 Agent 调用) ---
    async def add_memory(
        self, user_id: str, content: str, source: str = "conversation", memory_type: str = "fact"
    ):
        """异步添加记忆 - 使用 to_thread 防止阻塞主线程"""
        await self._add_memory_impl(user_id, content, source, memory_type)

    async def search_relevant_memories(self, user_id: str, query: str, limit: int = 5) -> str:
        """异步检索相关记忆 - 使用 to_thread 防止阻塞主线程。

        🔥 2026-09-13 T4 恢复 to_thread：检索 ~1.4s（embeddings + pgvector），
        协程内同步直调会冻结整个事件循环。本机 dev 若复发调度挂起，
        改用容器/WSL 跑后端绕开。
        """
        return await self._search_impl(user_id, query, limit)

    async def list_memories(self, user_id: str, limit: int = 50) -> list[str]:
        """异步列出用户记忆（最近的在前，供预览与改写定位原文）。"""
        return await self._list_memories_impl(user_id, limit)

    async def delete_memories(
        self, user_id: str, keyword: str, *, dry_run: bool = False
    ) -> list[str]:
        """异步删除（或 dry_run 预览）用户记忆。"""
        return await self._delete_memories_impl(user_id, keyword, dry_run=dry_run)

    async def rewrite_memory(
        self, user_id: str, old_content: str, new_content: str
    ) -> tuple[bool, str]:
        """异步精确改写单条记忆（语义见 _rewrite_memory_impl）。"""
        return await self._rewrite_memory_impl(user_id, old_content, new_content)


# 全局记忆管理器实例
memory_manager = MemoryManager()
