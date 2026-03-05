"""
MCP 工具服务

职责:
- 统一获取 MCP 服务器工具
- 提供 TTL 缓存机制（5分钟）
- 自动检测服务器配置变化

使用:
    from services.mcp_tools_service import mcp_tools_service
    tools = await mcp_tools_service.get_tools()
"""
import asyncio
import hashlib
import json
from datetime import datetime
from typing import Any

from langchain_mcp_adapters.client import MultiServerMCPClient
from sqlmodel import Session, select

from database import engine
from models.mcp import MCPServer
from utils.logger import logger


class MCPToolsService:
    """MCP 工具服务 - 统一获取和管理 MCP 工具"""

    # 缓存结构: (工具列表, 缓存时间, 服务器配置哈希)
    _cache: tuple[list[Any], datetime, str] | None = None
    _cache_lock = asyncio.Lock()
    _cache_ttl_seconds = 300  # 5分钟
    _inflight_task: asyncio.Task[list[Any]] | None = None

    async def get_tools(self) -> list[Any]:
        """
        获取所有激活的 MCP 服务器工具

        P2 优化:
        - 添加 TTL 缓存 (5分钟)，避免频繁创建连接
        - 缓存键: 激活服务器列表的哈希

        P0 修复:
        - 添加超时控制 (10秒)
        - 使用直接实例化 (0.2.1 不支持 async with)

        Returns:
            List[Tool]: MCP 工具列表
        """
        # 🔥 P2: 检查缓存
        async with self._cache_lock:
            if self._cache is not None:
                tools, cached_at, cached_hash = self._cache
                elapsed = (datetime.now() - cached_at).total_seconds()
                if elapsed < self._cache_ttl_seconds:
                    logger.debug(f"[MCP] 使用缓存工具 ({elapsed:.1f}s)")
                    return tools
                else:
                    logger.debug("[MCP] 缓存过期，重新获取")
                    self._cache = None

            # ARCH-13: single-flight 防雪崩
            # 若已有并发请求在拉取工具，则复用同一个任务，避免瞬时并发打爆 MCP Server。
            if self._inflight_task is not None and not self._inflight_task.done():
                logger.debug("[MCP] 复用进行中的工具拉取任务（single-flight）")
                inflight = self._inflight_task
            else:
                self._inflight_task = asyncio.create_task(self._load_tools())
                inflight = self._inflight_task

        try:
            return await inflight
        finally:
            async with self._cache_lock:
                if self._inflight_task is inflight and inflight.done():
                    self._inflight_task = None

    async def _load_tools(self) -> list[Any]:
        """实际执行 MCP 工具拉取（由 get_tools single-flight 调用）。"""
        tools: list[Any] = []

        try:
            # Python 3.13: 在异步函数中使用同步上下文管理器
            with Session(engine) as session:
                active_servers = session.exec(
                    select(MCPServer).where(MCPServer.is_active)
                ).all()

                if not active_servers:
                    # 清空缓存（如果没有激活服务器）
                    async with self._cache_lock:
                        self._cache = None
                    return tools

                # 🔥 P2: 计算当前服务器配置哈希
                current_servers_hash = hashlib.md5(
                    json.dumps([{"name": s.name, "url": str(s.sse_url)} for s in active_servers], sort_keys=True).encode()
                ).hexdigest()

                # 🔥 P2: 检查缓存哈希是否匹配
                async with self._cache_lock:
                    if self._cache is not None:
                        _, _, cached_hash = self._cache
                        if cached_hash != current_servers_hash:
                            logger.debug("[MCP] 服务器配置变化，缓存失效")
                            self._cache = None

                # 构建 MCP 客户端配置
                # 支持多种传输协议：sse, streamable_http
                mcp_config = {}
                for server in active_servers:
                    # 获取传输协议，默认为 sse（兼容旧数据）
                    transport = getattr(server, 'transport', None) or "sse"
                    mcp_config[server.name] = {
                        "url": str(server.sse_url),
                        "transport": transport
                    }

                # P0 修复: 使用超时控制（streamable_http 需要更长时间）
                # 注意: 0.2.1 版本不支持 async with，使用直接实例化
                timeout_seconds = 30 if any(cfg.get("transport") == "streamable_http" for cfg in mcp_config.values()) else 15
                async with asyncio.timeout(timeout_seconds):
                    client = MultiServerMCPClient(mcp_config)
                    tools = await client.get_tools()
                    logger.info(f"[MCP] 已加载 {len(tools)} 个 MCP 工具 from {len(active_servers)} 个服务器")

                    # 🔥 P2: 计算服务器配置哈希并更新缓存
                    current_servers_hash = hashlib.md5(
                        json.dumps([{"name": s.name, "url": str(s.sse_url)} for s in active_servers], sort_keys=True).encode()
                    ).hexdigest()
                    async with self._cache_lock:
                        self._cache = (tools, datetime.now(), current_servers_hash)

        except TimeoutError:
            logger.error("[MCP] 获取 MCP 工具超时 (10秒)")
        except Exception as e:
            logger.error(f"[MCP] 获取 MCP 工具失败: {e}")
            # MCP 工具加载失败不影响主流程

        return tools

    async def invalidate_cache(self):
        """手动使 MCP 工具缓存失效"""
        async with self._cache_lock:
            self._cache = None
            self._inflight_task = None
            logger.info("[MCP] 工具缓存已清除")


# 全局单例实例
mcp_tools_service = MCPToolsService()
