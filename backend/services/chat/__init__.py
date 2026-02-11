"""
Chat 服务层 - XPouch AI 后端核心服务

职责:
将 backend/routers/chat.py 中的业务逻辑抽离出来，实现分层架构。

服务分层:
- SessionService: 会话生命周期管理（Thread/Message CRUD）
- StreamService: SSE 流式处理（自定义智能体 + LangGraph）
- ArtifactService: Artifact 业务处理（查询、更新、权限验证）
- RecoveryService: HITL 恢复逻辑（计划审核后的继续/取消）

设计原则:
1. 单一职责: 每个服务只负责一类业务逻辑
2. 依赖注入: Service 之间通过构造函数注入，避免循环引用
3. 延迟导入: LangGraph 相关导入在方法内部进行，防止与 Node 层循环依赖
4. DRY: RecoveryService 复用 StreamService 的流式执行逻辑

使用示例:
    from services.chat import ChatSessionService, StreamService
    
    # 在 Router 中使用
    @router.post("/chat")
    async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_session)):
        session_service = ChatSessionService(db)
        stream_service = StreamService(db)
        
        # 获取或创建线程
        thread = await session_service.get_or_create_thread(...)
        
        # 执行流式处理
        return await stream_service.handle_langgraph_stream(...)
"""

from .session_service import ChatSessionService
from .stream_service import StreamService
from .artifact_service import ArtifactService
from .recovery_service import RecoveryService

__all__ = [
    "ChatSessionService",
    "StreamService",
    "ArtifactService",
    "RecoveryService",
]
