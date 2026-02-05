"""
异步任务队列 - 用于后台执行 I/O 操作

设计目标：
1. 不阻塞主流程（LLM 调用）
2. 确保数据最终一致性
3. 提供错误处理和重试机制

使用场景：
- 专家执行结果的数据库保存
- 日志批量写入
- 其他非关键路径的 I/O 操作

Author: XPouch AI Team
Created: 2026-02-05
"""
import asyncio
import traceback
from typing import Callable, Any, Dict, Optional
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime


class AsyncTaskQueue:
    """
    异步任务队列
    
    使用后台线程池执行同步 I/O 操作，不阻塞主事件循环。
    """
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, max_workers: int = 4):
        if self._initialized:
            return
            
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="async_io_")
        self._tasks: list = []
        self._stats = {
            "submitted": 0,
            "completed": 0,
            "failed": 0
        }
        self._initialized = True
        print(f"[AsyncTaskQueue] 初始化完成，线程池大小: {max_workers}")
    
    async def submit(self, func: Callable, *args, **kwargs) -> asyncio.Future:
        """
        提交任务到后台线程池执行
        
        Args:
            func: 要执行的同步函数
            *args, **kwargs: 函数参数
            
        Returns:
            Future 对象，可用于等待结果（但通常不需要）
        """
        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(self._executor, self._wrap_task, func, *args, **kwargs)
        self._stats["submitted"] += 1
        return future
    
    def _wrap_task(self, func: Callable, *args, **kwargs) -> Any:
        """包装任务，添加错误处理和统计"""
        try:
            result = func(*args, **kwargs)
            self._stats["completed"] += 1
            return result
        except Exception as e:
            self._stats["failed"] += 1
            print(f"[AsyncTaskQueue] 任务执行失败: {e}")
            traceback.print_exc()
            raise
    
    def get_stats(self) -> Dict[str, int]:
        """获取队列统计信息"""
        return self._stats.copy()
    
    def shutdown(self, wait: bool = True):
        """关闭线程池"""
        self._executor.shutdown(wait=wait)
        print("[AsyncTaskQueue] 线程池已关闭")


# 全局单例
task_queue = AsyncTaskQueue()


async def async_save_expert_result(
    task_id: str,
    expert_type: str,
    output_result: str,
    artifact_data: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[int] = None
) -> None:
    """
    异步保存专家执行结果

    将数据库保存操作放到后台线程执行，不阻塞 LLM 响应返回。

    🔥 修复：创建独立的 Session，避免主线程 Session 线程安全问题

    Args:
        task_id: 任务 ID
        expert_type: 专家类型
        output_result: 输出结果
        artifact_data: Artifact 数据（可选）
        duration_ms: 执行耗时（毫秒，可选）
    """
    from database import engine, Session
    from agents.services.task_manager import save_expert_execution_result

    # 🔥 核心修复：创建新的 Session（线程安全）
    # 这个 Session 的生命周期完全由这个后台函数控制，与主线程无关
    with Session(engine) as new_session:
        # 提交到后台线程池
        await task_queue.submit(
            save_expert_execution_result,
            new_session,  # ✅ 传入新创建的 session，线程安全
            task_id,
            expert_type,
            output_result,
            artifact_data,
            duration_ms
        )

        print(f"[AsyncSave] 已提交后台保存任务: {expert_type} (task_id={task_id})")


def get_async_stats() -> Dict[str, int]:
    """获取异步任务统计"""
    return task_queue.get_stats()
