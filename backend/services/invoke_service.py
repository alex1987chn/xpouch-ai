"""
双模调用服务 (Auto/Direct)

将 main.py 中的 chat_invoke_endpoint 业务逻辑迁移到 Service 层，
支持依赖注入和独立单元测试。
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import json
import hashlib
import asyncio

from sqlmodel import Session, select
from langchain_core.messages import HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient

from database import engine, SQLModelSession
from models import TaskSession, SubTask, User
from models.mcp import MCPServer
from agents.graph import create_smart_router_workflow
from agents.nodes.generic import generic_worker_node
from agents.services.expert_manager import get_expert_config_cached
from utils.llm_factory import get_llm_instance
from utils.logger import logger
from utils.exceptions import ValidationError


class InvokeService:
    """
    双模调用服务：支持 Auto 和 Direct 两种执行模式
    
    Responsibilities:
    - 模式验证（auto/direct）
    - TaskSession 生命周期管理
    - MCP 工具获取
    - LangGraph 工作流执行（Auto 模式）
    - 单专家直接调用（Direct 模式）
    - SubTask 批量保存
    - 错误处理和状态回滚
    """
    
    def __init__(self, session: Session):
        self.session = session
        self._mcp_tools: List[Any] = []
    
    async def invoke(
        self,
        message: str,
        mode: str,
        agent_id: Optional[str] = None,
        thread_id: Optional[str] = None,
        user: Optional[User] = None
    ) -> Dict[str, Any]:
        """
        执行双模调用
        
        Args:
            message: 用户消息
            mode: "auto" 或 "direct"
            agent_id: Direct 模式必需
            thread_id: LangSmith 线程 ID
            user: 当前用户
        
        Returns:
            执行结果字典
        
        Raises:
            ValidationError: 参数验证失败
            AppError: 执行过程中的业务错误
        """
        # 1. 验证模式
        self._validate_mode(mode, agent_id)
        
        # 2. 创建 TaskSession
        task_session = self._create_task_session(message, thread_id)
        
        try:
            # 3. 获取 MCP 工具
            self._mcp_tools = await self._get_mcp_tools()
            
            # 4. 执行对应模式
            if mode == "auto":
                result = await self._execute_auto_mode(message, task_session)
            else:
                result = await self._execute_direct_mode(message, agent_id, task_session)
            
            # 5. 更新状态为完成
            self._update_session_completed(task_session, result["final_response"])
            
            return result
            
        except Exception as e:
            # 6. 错误处理：更新状态为失败
            self._update_session_failed(task_session, str(e))
            raise
    
    def _validate_mode(self, mode: str, agent_id: Optional[str]) -> None:
        """验证执行模式"""
        if mode not in ["auto", "direct"]:
            raise ValidationError(
                f"无效的执行模式: {mode}，必须是 'auto' 或 'direct'",
                details={"mode": mode}
            )
        
        if mode == "direct":
            if not agent_id:
                raise ValidationError(
                    "Direct 模式需要指定 agent_id",
                    details={"mode": mode}
                )
            
            expert = get_expert_config_cached(agent_id)
            if not expert:
                raise ValidationError(
                    f"未知的专家类型: {agent_id}",
                    details={"agent_id": agent_id}
                )
    
    def _create_task_session(
        self, 
        message: str, 
        thread_id: Optional[str]
    ) -> TaskSession:
        """创建 TaskSession 记录"""
        session_id = thread_id or str(uuid.uuid4())
        task_session = TaskSession(
            session_id=session_id,
            user_query=message,
            status="running",
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        self.session.add(task_session)
        self.session.commit()
        self.session.refresh(task_session)
        
        logger.info(f"[InvokeService] 创建 TaskSession: {session_id}")
        return task_session
    
    async def _get_mcp_tools(self) -> List[Any]:
        """
        获取 MCP 动态工具
        
        注意: langchain-mcp-adapters 0.2.1 采用无状态设计，
        每次调用自动创建和清理会话，无需显式关闭。
        """
        tools: List[Any] = []
        
        try:
            with SQLModelSession(engine) as db_session:
                active_servers = db_session.exec(
                    select(MCPServer).where(MCPServer.is_active == True)
                ).all()
                
                if not active_servers:
                    return tools
                
                # 构建 MCP 配置
                mcp_config = {}
                for server in active_servers:
                    transport = getattr(server, 'transport', None) or "sse"
                    mcp_config[server.name] = {
                        "url": str(server.sse_url),
                        "transport": transport
                    }
                
                # 根据传输协议设置超时
                timeout_seconds = 30 if any(
                    cfg.get("transport") == "streamable_http" 
                    for cfg in mcp_config.values()
                ) else 15
                
                # 获取工具（0.2.1 不支持 async with，直接实例化）
                async with asyncio.timeout(timeout_seconds):
                    client = MultiServerMCPClient(mcp_config)
                    tools = await client.get_tools()
                    
                logger.info(
                    f"[InvokeService] 已加载 {len(tools)} 个 MCP 工具 "
                    f"from {len(active_servers)} 个服务器"
                )
                
        except asyncio.TimeoutError:
            logger.error("[InvokeService] 获取 MCP 工具超时")
        except Exception as e:
            logger.warning(f"[InvokeService] 获取 MCP 工具失败: {e}")
            # MCP 工具加载失败不影响主流程
        
        return tools
    
    async def _execute_auto_mode(
        self, 
        message: str, 
        task_session: TaskSession
    ) -> Dict[str, Any]:
        """
        执行 Auto 模式（完整多专家协作）
        
        使用 LangGraph 智能路由工作流，自动规划任务、
        调用多个专家协作完成复杂请求。
        """
        logger.info("[InvokeService] Auto 模式：启动完整工作流")
        
        initial_state = {
            "messages": [HumanMessage(content=message)],
            "task_list": [],
            "current_task_index": 0,
            "strategy": "",
            "expert_results": [],
            "final_response": ""
        }
        
        # 创建工作流实例
        graph = create_smart_router_workflow()
        
        # 执行工作流
        final_state = await graph.ainvoke(
            initial_state,
            config={
                "recursion_limit": 100,
                "configurable": {
                    "thread_id": task_session.session_id,
                    "mcp_tools": self._mcp_tools
                }
            }
        )
        
        # 保存 SubTask 到数据库
        self._save_subtasks(task_session.session_id, final_state["task_list"])
        
        logger.info(
            f"[InvokeService] Auto 模式完成，"
            f"执行了 {len(final_state['expert_results'])} 个专家"
        )
        
        return {
            "mode": "auto",
            "thread_id": task_session.session_id,
            "session_id": task_session.session_id,
            "strategy": final_state["strategy"],
            "final_response": final_state["final_response"],
            "expert_results": final_state["expert_results"],
            "sub_tasks_count": len(final_state["task_list"]),
        }
    
    async def _execute_direct_mode(
        self,
        message: str,
        agent_id: str,
        task_session: TaskSession
    ) -> Dict[str, Any]:
        """
        执行 Direct 模式（单专家直接调用）
        
        直接调用指定专家，适用于简单任务或特定专家场景。
        """
        logger.info(f"[InvokeService] Direct 模式：调用专家 {agent_id}")
        
        # 创建子任务
        subtask_dict = {
            "id": str(uuid.uuid4()),
            "expert_type": agent_id,
            "description": message,
            "input_data": {},
            "status": "pending",
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        initial_state = {
            "messages": [HumanMessage(content=message)],
            "task_list": [subtask_dict],
            "current_task_index": 0,
            "strategy": f"直接模式: {agent_id} 专家",
            "expert_results": [],
            "final_response": ""
        }
        
        # 使用 generic_worker_node 执行
        result = await generic_worker_node(initial_state)
        
        # 保存 SubTask
        self._save_direct_subtask(task_session.session_id, subtask_dict, result)
        
        # 构建专家结果
        expert_result = {
            "task_id": subtask_dict["id"],
            "expert_type": agent_id,
            "description": message,
            "output": result.get("output_result", ""),
            "status": result.get("status", "unknown"),
            "started_at": result.get("started_at"),
            "completed_at": result.get("completed_at"),
            "duration_ms": result.get("duration_ms", 0)
        }
        
        logger.info(f"[InvokeService] Direct 模式完成，专家: {agent_id}")
        
        return {
            "mode": "direct",
            "thread_id": task_session.session_id,
            "session_id": task_session.session_id,
            "expert_type": agent_id,
            "final_response": result.get("output_result", ""),
            "expert_results": [expert_result],
            "sub_tasks_count": 1,
        }
    
    def _save_subtasks(
        self, 
        session_id: str, 
        task_list: List[Dict[str, Any]]
    ) -> None:
        """批量保存 SubTask"""
        for subtask in task_list:
            # 处理 artifacts
            artifacts = subtask.get("artifact")
            if artifacts:
                artifacts = [artifacts] if isinstance(artifacts, dict) else artifacts
            
            db_subtask = SubTask(
                id=subtask["id"],
                expert_type=subtask["expert_type"],
                task_description=subtask["description"],
                input_data=subtask.get("input_data", {}),
                status=subtask["status"],
                output_result=subtask.get("output_result"),
                artifacts=artifacts,
                started_at=subtask.get("started_at"),
                completed_at=subtask.get("completed_at"),
                created_at=subtask.get("created_at"),
                updated_at=subtask.get("updated_at"),
                task_session_id=session_id
            )
            self.session.add(db_subtask)
        
        self.session.commit()
    
    def _save_direct_subtask(
        self, 
        session_id: str,
        subtask_dict: Dict[str, Any],
        result: Dict[str, Any]
    ) -> None:
        """保存 Direct 模式的单个 SubTask"""
        db_subtask = SubTask(
            id=subtask_dict["id"],
            expert_type=subtask_dict["expert_type"],
            task_description=subtask_dict["description"],
            input_data=subtask_dict.get("input_data", {}),
            status=result.get("status", "completed"),
            output_result={"content": result.get("output_result", "")},
            started_at=result.get("started_at"),
            completed_at=result.get("completed_at"),
            created_at=subtask_dict["created_at"],
            updated_at=subtask_dict["updated_at"],
            task_session_id=session_id
        )
        self.session.add(db_subtask)
        self.session.commit()
    
    def _update_session_completed(
        self, 
        task_session: TaskSession, 
        response: str
    ) -> None:
        """更新 TaskSession 为完成状态"""
        task_session.final_response = response
        task_session.status = "completed"
        task_session.completed_at = datetime.now()
        task_session.updated_at = datetime.now()
        self.session.commit()
        
        logger.info(f"[InvokeService] TaskSession {task_session.session_id} 完成")
    
    def _update_session_failed(
        self, 
        task_session: TaskSession, 
        error: str
    ) -> None:
        """更新 TaskSession 为失败状态"""
        task_session.status = "failed"
        task_session.final_response = f"执行失败: {error}"
        task_session.updated_at = datetime.now()
        self.session.commit()
        
        logger.error(f"[InvokeService] TaskSession {task_session.session_id} 失败: {error}")


# ============================================================================
# FastAPI 依赖注入
# ============================================================================

from fastapi import Depends
from database import get_session


def get_invoke_service(session: Session = Depends(get_session)) -> InvokeService:
    """获取 InvokeService 实例（FastAPI Depends）"""
    return InvokeService(session)
