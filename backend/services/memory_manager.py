import asyncio

from sqlmodel import Session, select

from database import engine
from models.memory import UserMemory
from providers_config import get_embedding_client
from utils.logger import logger
from utils.time import utc_now


def get_embedding(text: str) -> list[float]:
    """
    获取向量嵌入

    从 providers.yaml 读取配置，支持动态切换提供商
    """
    try:
        # 从统一配置获取客户端
        client, model, dimensions = get_embedding_client()

        response = client.embeddings.create(input=text.replace("\n", " "), model=model)
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"[Memory] Embedding Error: {e}")
        return []


class MemoryManager:
    """记忆管理器 - 处理用户长期记忆的存储和检索"""

    # --- 同步方法 (运行在线程池中) ---
    def _add_memory_sync(
        self, user_id: str, content: str, source: str = "conversation", memory_type: str = "fact"
    ):
        """同步添加记忆到数据库。

        embedding 失败抛 RuntimeError 而非静默返回：调用方（generic 记忆分支）
        会向用户如实上报"未记住"——静默跳过曾让用户以为记住了实际没有。
        """
        if not content or not content.strip():
            return

        # 1. 转向量
        vector = get_embedding(content)
        if not vector:
            raise RuntimeError(f"embedding 为空，无法生成记忆向量: {content[:50]}...")

        # 2. 幂等去重：同用户同内容不重复入库（"记住我名字"类指令会反复触发，
        #    也让写入中途失败后的重试安全——已入库的行不会被重复种）
        # 3. 存入数据库
        try:
            with Session(engine) as session:
                dup = session.exec(
                    select(UserMemory).where(
                        UserMemory.user_id == user_id,
                        UserMemory.content == content,
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
                session.commit()
                logger.info(f"[Memory] ✅ 已记住: {content[:80]}...")
        except Exception as e:
            # 包装为 RuntimeError：调用方（generic 记忆分支）只接 RuntimeError/ValueError，
            # 裸 psycopg 异常会穿透到执行框架层
            raise RuntimeError(f"记忆数据库写入失败: {e}") from e

    def _list_memories_sync(self, user_id: str, limit: int = 50) -> list[str]:
        """列出当前用户的记忆（按时间正序），供"查看我的记忆"类请求出具清单。"""
        try:
            with Session(engine) as session:
                rows = session.exec(
                    select(UserMemory)
                    .where(UserMemory.user_id == user_id)
                    .order_by(UserMemory.created_at)
                    .limit(limit)
                ).all()
                return [r.content for r in rows]
        except Exception as e:
            raise RuntimeError(f"记忆查询失败: {e}") from e

    def _delete_memories_sync(
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
            with Session(engine) as session:
                rows = session.exec(
                    select(UserMemory)
                    .where(UserMemory.user_id == user_id, UserMemory.content.ilike(pattern))
                    .order_by(UserMemory.created_at)
                ).all()
                contents = [r.content for r in rows]
                if not dry_run:
                    for r in rows:
                        session.delete(r)
                    session.commit()
                    logger.info(f"[Memory] 🗑️ 已删除 {len(contents)} 条记忆（关键词: {keyword}）")
                return contents
        except Exception as e:
            raise RuntimeError(f"记忆删除失败: {e}") from e

    def _search_sync(self, user_id: str, query: str, limit: int = 5) -> str:
        """同步检索相关记忆"""
        if not query or not query.strip():
            return ""

        logger.info("[Memory] _search_sync start")
        query_vector = get_embedding(query)
        logger.info(f"[Memory] embedding done, dim={len(query_vector) if query_vector else 0}")
        if not query_vector:
            return ""

        try:
            with Session(engine) as session:
                logger.info("[Memory] db session acquired, querying")
                # 🔥 向量相似度排序 (cosine_distance 越小越相似)
                statement = (
                    select(UserMemory)
                    .where(UserMemory.user_id == user_id)
                    .order_by(UserMemory.embedding.cosine_distance(query_vector))
                    .limit(limit)
                )

                results = session.exec(statement).all()
            logger.info(f"[Memory] query done, {len(results)} rows")

            if not results:
                return ""

            # 格式化返回记忆内容
            memories = []
            for m in results:
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
        await asyncio.to_thread(self._add_memory_sync, user_id, content, source, memory_type)

    async def search_relevant_memories(self, user_id: str, query: str, limit: int = 5) -> str:
        """异步检索相关记忆 - 使用 to_thread 防止阻塞主线程。

        🔥 2026-09-13 T4 恢复 to_thread：检索 ~1.4s（embeddings + pgvector），
        协程内同步直调会冻结整个事件循环。本机 dev 若复发调度挂起，
        改用容器/WSL 跑后端绕开。
        """
        return await asyncio.to_thread(self._search_sync, user_id, query, limit)

    async def list_memories(self, user_id: str, limit: int = 50) -> list[str]:
        """异步列出用户记忆（to_thread 同上）。"""
        return await asyncio.to_thread(self._list_memories_sync, user_id, limit)

    async def delete_memories(
        self, user_id: str, keyword: str, *, dry_run: bool = False
    ) -> list[str]:
        """异步删除（或 dry_run 预览）用户记忆（to_thread 同上）。"""
        return await asyncio.to_thread(
            self._delete_memories_sync, user_id, keyword, dry_run=dry_run
        )


# 全局记忆管理器实例
memory_manager = MemoryManager()
