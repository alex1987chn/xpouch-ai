"""
聊天会话生命周期管理服务

职责:
- 线程(Thread)的CRUD操作
- 消息(Message)的保存
- 自定义智能体验证
- LangChain消息列表构建

依赖:
- backend.crud.task_session (TaskSession相关CRUD)
- backend.models (SQLModel模型)
"""
from typing import List, Optional, Any
from datetime import datetime
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage

from models import User, Thread, Message, CustomAgent, TaskSession, SubTask
from utils.exceptions import NotFoundError, AuthorizationError
from constants import normalize_agent_id, SYSTEM_AGENT_DEFAULT_CHAT, SYSTEM_AGENT_ORCHESTRATOR


class ChatSessionService:
    """聊天会话管理服务"""
    
    def __init__(self, db_session: Session):
        self.db = db_session
    
    # ============================================================================
    # 线程管理
    # ============================================================================
    
    async def list_threads(self, user_id: str) -> List[dict]:
        """
        获取用户的所有线程列表
        
        Args:
            user_id: 用户ID
            
        Returns:
            线程列表，包含基本信息和消息预览
        """
        statement = (
            select(Thread)
            .where(Thread.user_id == user_id)
            .options(selectinload(Thread.messages))
            .order_by(Thread.updated_at.desc())
        )
        threads = self.db.exec(statement).all()
        
        result = []
        for thread in threads:
            result.append({
                "id": thread.id,
                "title": thread.title,
                "agent_id": thread.agent_id,
                "agent_type": thread.agent_type,
                "thread_mode": thread.thread_mode,
                "user_id": thread.user_id,
                "task_session_id": thread.task_session_id,
                "created_at": thread.created_at.isoformat() if thread.created_at else None,
                "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
                "messages": [
                    {
                        "id": msg.id,
                        "role": msg.role,
                        "content": msg.content,
                        "timestamp": msg.timestamp.isoformat() if msg.timestamp else None
                    }
                    for msg in thread.messages
                ]
            })
        return result
    
    async def get_thread_detail(self, thread_id: str, user_id: str) -> dict:
        """
        获取单个线程详情
        
        Args:
            thread_id: 线程ID
            user_id: 用户ID（用于权限验证）
            
        Returns:
            线程详情，包含消息、TaskSession、SubTasks、Artifacts
            
        Raises:
            NotFoundError: 线程不存在
            AuthorizationError: 无权访问此线程
        """
        statement = (
            select(Thread)
            .where(Thread.id == thread_id)
            .options(selectinload(Thread.messages))
        )
        thread = self.db.exec(statement).first()
        
        if not thread:
            raise NotFoundError(resource="会话")
        
        if thread.user_id != user_id:
            raise AuthorizationError("没有权限访问此会话")
        
        # 如果是AI助手线程（复杂模式），加载TaskSession和SubTask
        if thread.agent_type == "ai" and thread.task_session_id:
            return await self._build_complex_thread_response(thread)
        
        # 简单模式返回
        return self._build_simple_thread_response(thread)
    
    async def _build_complex_thread_response(self, thread: Thread) -> dict:
        """构建复杂模式的线程响应（包含TaskSession详情）"""
        task_session = self.db.get(TaskSession, thread.task_session_id)
        if not task_session:
            return self._build_simple_thread_response(thread)
        
        # 预加载 artifacts 关系，避免 N+1 查询
        statement = (
            select(SubTask)
            .where(SubTask.task_session_id == task_session.session_id)
            .options(selectinload(SubTask.artifacts))
            .order_by(SubTask.sort_order)
        )
        sub_tasks = self.db.exec(statement).all()
        
        base_response = self._build_simple_thread_response(thread)
        base_response["task_session"] = {
            "id": task_session.session_id,
            "session_id": task_session.session_id,
            "user_query": task_session.user_query,
            "final_response": task_session.final_response,
            "status": task_session.status,
            "sub_tasks": [
                {
                    "id": st.id,
                    "task_session_id": st.task_session_id,
                    "expert_type": st.expert_type,
                    "task_description": st.task_description,
                    "status": st.status,
                    "output_result": st.output_result,
                    "error_message": st.error_message,
                    "artifacts": [
                        {
                            "id": art.id,
                            "type": art.type,
                            "title": art.title,
                            "content": art.content,
                            "language": art.language,
                            "sort_order": art.sort_order,
                            "created_at": art.created_at.isoformat() if art.created_at else None
                        }
                        for art in (st.artifacts or [])
                    ],
                    "duration_ms": st.duration_ms,
                    "created_at": st.created_at.isoformat() if st.created_at else None
                }
                for st in sub_tasks
            ]
        }
        return base_response
    
    def _build_simple_thread_response(self, thread: Thread) -> dict:
        """构建简单模式的线程响应"""
        return {
            "id": thread.id,
            "title": thread.title,
            "agent_id": thread.agent_id,
            "agent_type": thread.agent_type,
            "user_id": thread.user_id,
            "task_session_id": thread.task_session_id,
            "created_at": thread.created_at.isoformat() if thread.created_at else None,
            "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
            "messages": [
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
                    "extra_data": msg.extra_data
                }
                for msg in thread.messages
            ]
        }
    
    async def delete_thread(self, thread_id: str, user_id: str) -> bool:
        """
        删除线程
        
        Args:
            thread_id: 线程ID
            user_id: 用户ID（用于权限验证）
            
        Returns:
            是否删除成功
            
        Raises:
            NotFoundError: 线程不存在
            AuthorizationError: 无权删除此线程
        """
        thread = self.db.get(Thread, thread_id)
        if not thread:
            raise NotFoundError(resource="会话")
        
        if thread.user_id != user_id:
            raise AuthorizationError("没有权限访问此会话")
        
        self.db.delete(thread)
        self.db.commit()
        return True
    
    async def get_or_create_thread(
        self,
        thread_id: Optional[str],
        user_id: str,
        agent_id: Optional[str],
        message: str
    ) -> Thread:
        """
        获取或创建线程
        
        Args:
            thread_id: 现有线程ID（可为None）
            user_id: 用户ID
            agent_id: 智能体ID
            message: 用户消息（用于生成标题）
            
        Returns:
            Thread实例（新建或现有）
        """
        if thread_id:
            thread = self.db.get(Thread, thread_id)
            if thread:
                if thread.user_id != user_id:
                    raise AuthorizationError("没有权限访问此会话")
                return thread
        
        # 创建新线程
        if not thread_id:
            thread_id = str(datetime.now().timestamp())  # 简化ID生成
            
        # 处理 agent_id
        if not agent_id or agent_id.strip() == "":
            frontend_agent_id = SYSTEM_AGENT_DEFAULT_CHAT
        else:
            frontend_agent_id = normalize_agent_id(agent_id)
        
        # sys-task-orchestrator 是内部实现，不应在 URL 中暴露
        if frontend_agent_id == SYSTEM_AGENT_ORCHESTRATOR:
            frontend_agent_id = SYSTEM_AGENT_DEFAULT_CHAT
        
        # 判断 agent 类型
        custom_agent_check = self.db.get(CustomAgent, frontend_agent_id)
        if custom_agent_check and custom_agent_check.user_id == user_id:
            agent_type = "custom"
            final_agent_id = frontend_agent_id
        else:
            agent_type = "default"
            final_agent_id = SYSTEM_AGENT_DEFAULT_CHAT
        
        # 初始 thread_mode 为 simple，Router 会在处理时更新它
        thread = Thread(
            id=thread_id,
            title=message[:30] + "..." if len(message) > 30 else message,
            agent_id=final_agent_id,
            agent_type=agent_type,
            thread_mode="simple",
            user_id=user_id,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        self.db.add(thread)
        self.db.commit()
        self.db.refresh(thread)
        return thread
    
    # ============================================================================
    # 消息管理
    # ============================================================================
    
    async def save_user_message(self, thread_id: str, content: str) -> Message:
        """
        保存用户消息
        
        Args:
            thread_id: 线程ID
            content: 消息内容
            
        Returns:
            保存的消息实例
        """
        message = Message(
            thread_id=thread_id,
            role="user",
            content=content,
            timestamp=datetime.now()
        )
        self.db.add(message)
        self.db.commit()
        return message
    
    async def save_assistant_message(
        self,
        thread_id: str,
        content: str,
        thinking_data: Optional[dict] = None,
        message_id: Optional[str] = None
    ) -> Message:
        """
        保存助手消息
        
        Args:
            thread_id: 线程ID
            content: 消息内容
            thinking_data: thinking过程数据（可选）
            message_id: 指定的消息ID（可选）
            
        Returns:
            保存的消息实例
        """
        from utils.thinking_parser import parse_thinking
        
        # 解析 thinking 标签
        clean_content, parsed_thinking = parse_thinking(content)
        
        # 合并传入的 thinking_data
        final_thinking = thinking_data or parsed_thinking
        
        # 🔥 修复：Message 表的 id 是 INTEGER 自增，不要传入 UUID 字符串
        # 如果传入了 message_id，放入 extra_data 中供前端关联
        extra_data = {'thinking': final_thinking} if final_thinking else {}
        if message_id:
            extra_data['frontend_message_id'] = message_id
        
        message = Message(
            thread_id=thread_id,
            role="assistant",
            content=clean_content,
            extra_data=extra_data if extra_data else None,
            timestamp=datetime.now()
        )
        self.db.add(message)
        
        # 更新线程时间
        thread = self.db.get(Thread, thread_id)
        if thread:
            thread.updated_at = datetime.now()
            self.db.add(thread)
        
        self.db.commit()
        return message
    
    async def build_langchain_messages(self, thread_id: str) -> List[BaseMessage]:
        """
        构建 LangChain 消息列表
        
        Args:
            thread_id: 线程ID
            
        Returns:
            LangChain BaseMessage 列表（用于 LLM 调用）
        """
        statement = (
            select(Message)
            .where(Message.thread_id == thread_id)
            .order_by(Message.timestamp)
        )
        db_messages = self.db.exec(statement).all()
        
        langchain_messages = []
        for msg in db_messages:
            if msg.role == "user":
                langchain_messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                langchain_messages.append(AIMessage(content=msg.content))
        
        return langchain_messages
    
    # ============================================================================
    # 自定义智能体验证
    # ============================================================================
    
    async def get_custom_agent(
        self,
        agent_id: str,
        user_id: str
    ) -> Optional[CustomAgent]:
        """
        获取并验证自定义智能体
        
        Args:
            agent_id: 智能体ID
            user_id: 用户ID（用于权限验证）
            
        Returns:
            CustomAgent实例（验证通过）或None（系统默认）
        """
        normalized_agent_id = normalize_agent_id(agent_id)
        
        # sys-task-orchestrator 转换为系统默认
        if normalized_agent_id == SYSTEM_AGENT_ORCHESTRATOR:
            normalized_agent_id = SYSTEM_AGENT_DEFAULT_CHAT
        
        # 系统默认助手
        if normalized_agent_id == SYSTEM_AGENT_DEFAULT_CHAT:
            return None
        
        custom_agent = self.db.get(CustomAgent, normalized_agent_id)
        
        if custom_agent and custom_agent.user_id == user_id:
            # 增加对话计数
            custom_agent.conversation_count += 1
            self.db.add(custom_agent)
            self.db.commit()
            return custom_agent
        
        # 未找到或无权访问，回退到系统默认
        return None
    
    # ============================================================================
    # TaskSession 管理
    # ============================================================================
    
    async def create_task_session(
        self,
        thread_id: str,
        user_query: str,
        plan_summary: Optional[str] = None,
        estimated_steps: int = 0
    ) -> TaskSession:
        """
        创建 TaskSession（复杂模式）
        
        Args:
            thread_id: 关联的线程ID
            user_query: 用户原始查询
            plan_summary: 规划摘要
            estimated_steps: 预计步骤数
            
        Returns:
            创建的 TaskSession 实例
        """
        from crud.task_session import create_task_session as crud_create_task_session
        
        return crud_create_task_session(
            db=self.db,
            thread_id=thread_id,
            user_query=user_query,
            plan_summary=plan_summary,
            estimated_steps=estimated_steps,
            execution_mode="sequential"
        )
    
    async def update_thread_agent_type(
        self,
        thread_id: str,
        agent_type: str,
        task_session_id: Optional[str] = None
    ) -> None:
        """
        更新线程的 agent_type 和 task_session_id
        
        Args:
            thread_id: 线程ID
            agent_type: agent 类型 (simple/complex/ai)
            task_session_id: 关联的 TaskSession ID（可选）
        """
        thread = self.db.get(Thread, thread_id)
        if thread:
            thread.agent_type = agent_type
            if task_session_id:
                thread.task_session_id = task_session_id
            self.db.add(thread)
            self.db.commit()
