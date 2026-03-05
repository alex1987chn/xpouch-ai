import asyncio
from datetime import datetime

from sqlmodel import Session, select

from database import engine
from models.memory import UserMemory
from providers_config import get_embedding_client
from utils.logger import logger


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
        """同步添加记忆到数据库"""
        if not content or not content.strip():
            return

        # 1. 转向量
        vector = get_embedding(content)
        if not vector:
            logger.warning(f"[Memory] ❌ 向量生成失败，跳过存储: {content[:50]}...")
            return

        # 2. 存入数据库
        try:
            with Session(engine) as session:
                memory = UserMemory(
                    user_id=user_id,
                    content=content,
                    embedding=vector,
                    created_at=datetime.now().isoformat(),
                    source=source,
                    memory_type=memory_type,
                )
                session.add(memory)
                session.commit()
                logger.info(f"[Memory] ✅ 已记住: {content[:80]}...")
        except Exception as e:
            logger.error(f"[Memory] ❌ 数据库写入失败: {e}")

    def _search_sync(self, user_id: str, query: str, limit: int = 5) -> str:
        """同步检索相关记忆"""
        if not query or not query.strip():
            return ""

        query_vector = get_embedding(query)
        if not query_vector:
            return ""

        try:
            with Session(engine) as session:
                # 🔥 向量相似度排序 (cosine_distance 越小越相似)
                statement = (
                    select(UserMemory)
                    .where(UserMemory.user_id == user_id)
                    .order_by(UserMemory.embedding.cosine_distance(query_vector))
                    .limit(limit)
                )

                results = session.exec(statement).all()

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

    def _get_all_memories_sync(self, user_id: str, limit: int = 50) -> list[UserMemory]:
        """获取用户所有记忆（用于调试或导出）"""
        try:
            with Session(engine) as session:
                statement = (
                    select(UserMemory)
                    .where(UserMemory.user_id == user_id)
                    .order_by(UserMemory.created_at.desc())
                    .limit(limit)
                )
                return session.exec(statement).all()
        except Exception as e:
            logger.error(f"[Memory] ❌ 获取记忆失败: {e}")
            return []

    def _delete_memory_sync(self, memory_id: int, user_id: str) -> bool:
        """删除指定记忆"""
        try:
            with Session(engine) as session:
                memory = session.get(UserMemory, memory_id)
                if memory and memory.user_id == user_id:
                    session.delete(memory)
                    session.commit()
                    return True
                return False
        except Exception as e:
            logger.error(f"[Memory] ❌ 删除记忆失败: {e}")
            return False

    # --- 异步入口 (供 Agent 调用) ---
    async def add_memory(
        self, user_id: str, content: str, source: str = "conversation", memory_type: str = "fact"
    ):
        """异步添加记忆 - 使用 to_thread 防止阻塞主线程"""
        await asyncio.to_thread(self._add_memory_sync, user_id, content, source, memory_type)

    async def search_relevant_memories(self, user_id: str, query: str, limit: int = 5) -> str:
        """异步检索相关记忆 - 使用 to_thread 防止阻塞心跳"""
        return await asyncio.to_thread(self._search_sync, user_id, query, limit)

    async def get_user_memories(self, user_id: str, limit: int = 50) -> list[UserMemory]:
        """异步获取用户所有记忆"""
        return await asyncio.to_thread(self._get_all_memories_sync, user_id, limit)

    async def delete_memory(self, memory_id: int, user_id: str) -> bool:
        """异步删除记忆"""
        return await asyncio.to_thread(self._delete_memory_sync, memory_id, user_id)


# 全局记忆管理器实例
memory_manager = MemoryManager()
