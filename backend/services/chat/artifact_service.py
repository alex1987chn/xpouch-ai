"""
Artifact 业务处理服务

职责:
- Artifact 的查询和更新
- 权限验证（Artifact -> SubTask -> TaskSession -> Thread -> User）
- 复用 utils.artifacts 进行解析

依赖:
- backend.crud.task_session (Artifact CRUD)
- backend.utils.artifacts (Artifact 解析)
"""
from typing import List, Optional, Dict, Any
from sqlmodel import Session

from models import Artifact, SubTask, TaskSession, Thread
from crud.task_session import get_artifact, update_artifact_content
from utils.exceptions import NotFoundError, AuthorizationError
from utils.artifacts import parse_artifacts_from_response
from utils.logger import logger


class ArtifactService:
    """Artifact 业务服务"""
    
    def __init__(self, db_session: Session):
        self.db = db_session
    
    # ============================================================================
    # Artifact 查询
    # ============================================================================
    
    async def get_artifact_detail(
        self,
        artifact_id: str,
        user_id: str,
        include_content: bool = True
    ) -> Dict[str, Any]:
        """
        获取 Artifact 详情（含权限验证）
        
        Args:
            artifact_id: Artifact ID
            user_id: 用户ID（用于权限验证）
            include_content: 是否包含完整内容（调试时可能只需要摘要）
            
        Returns:
            Artifact 详情字典
            
        Raises:
            NotFoundError: Artifact 不存在
            AuthorizationError: 无权访问此产物
        """
        artifact = get_artifact(self.db, artifact_id)
        if not artifact:
            raise NotFoundError(f"Artifact not found: {artifact_id}")
        
        # 验证权限
        await self._verify_artifact_permission(artifact, user_id)
        
        content = artifact.content
        if not include_content and len(content) > 100:
            content = content[:100] + "..."
        
        return {
            "id": artifact.id,
            "type": artifact.type,
            "title": artifact.title,
            "content": content,
            "language": artifact.language,
            "sort_order": artifact.sort_order,
            "sub_task_id": artifact.sub_task_id,
            "created_at": artifact.created_at.isoformat() if artifact.created_at else None
        }
    
    async def get_artifacts_by_subtask(
        self,
        subtask_id: str,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """
        获取 SubTask 的所有 Artifacts
        
        Args:
            subtask_id: SubTask ID
            user_id: 用户ID（用于权限验证）
            
        Returns:
            Artifact 列表
        """
        from crud.task_session import get_artifacts_by_subtask as crud_get_artifacts
        
        # 验证 SubTask 权限
        subtask = self.db.get(SubTask, subtask_id)
        if not subtask:
            raise NotFoundError(f"SubTask not found: {subtask_id}")
        
        task_session = self.db.get(TaskSession, subtask.task_session_id)
        if task_session:
            thread = self.db.get(Thread, task_session.thread_id)
            if thread and thread.user_id != user_id:
                raise AuthorizationError("无权访问此产物的产物")
        
        artifacts = crud_get_artifacts(self.db, subtask_id)
        return [
            {
                "id": art.id,
                "type": art.type,
                "title": art.title,
                "content": art.content,
                "language": art.language,
                "sort_order": art.sort_order,
                "created_at": art.created_at.isoformat() if art.created_at else None
            }
            for art in artifacts
        ]
    
    # ============================================================================
    # Artifact 更新
    # ============================================================================
    
    async def update_artifact(
        self,
        artifact_id: str,
        content: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        更新 Artifact 内容
        
        此端点实现 Artifact 编辑的持久化，确保用户修改后的内容：
        1. 保存到数据库
        2. 后续任务执行时读取的是修改后的版本
        3. 页面刷新后修改不会丢失
        
        Args:
            artifact_id: Artifact ID
            content: 新内容
            user_id: 用户ID（用于权限验证）
            
        Returns:
            更新后的 Artifact 详情
            
        Raises:
            NotFoundError: Artifact 或关联资源不存在
            AuthorizationError: 无权修改此产物
            AppError: 更新失败
        """
        # 1. 查找 Artifact
        artifact = get_artifact(self.db, artifact_id)
        if not artifact:
            raise NotFoundError(f"Artifact not found: {artifact_id}")
        
        # 2. 验证完整权限链
        await self._verify_full_permission_chain(artifact, user_id)
        
        # 3. 更新内容
        updated_artifact = update_artifact_content(self.db, artifact_id, content)
        
        if not updated_artifact:
            from utils.exceptions import AppError
            raise AppError("更新失败，请重试")
        
        logger.info(f"[ARTIFACT UPDATE] 用户 {user_id} 更新了 Artifact {artifact_id}")
        
        return {
            "id": updated_artifact.id,
            "type": updated_artifact.type,
            "title": updated_artifact.title,
            "content": updated_artifact.content,
            "language": updated_artifact.language,
            "sort_order": updated_artifact.sort_order,
            "updated": True
        }
    
    async def _verify_artifact_permission(
        self,
        artifact: Artifact,
        user_id: str
    ) -> bool:
        """
        验证用户对 Artifact 的访问权限
        
        验证链：Artifact -> SubTask -> TaskSession -> Thread -> User
        
        Args:
            artifact: Artifact 实例
            user_id: 用户ID
            
        Returns:
            是否有权限
            
        Raises:
            NotFoundError: 关联资源不存在
            AuthorizationError: 无权访问
        """
        subtask = self.db.get(SubTask, artifact.sub_task_id)
        if not subtask:
            raise NotFoundError("Associated task not found")
        
        task_session = self.db.get(TaskSession, subtask.task_session_id)
        if not task_session:
            raise NotFoundError("Associated session not found")
        
        thread = self.db.get(Thread, task_session.thread_id)
        if not thread:
            raise NotFoundError("Associated thread not found")
        
        if thread.user_id != user_id:
            raise AuthorizationError("无权访问此产物")
        
        return True
    
    async def _verify_full_permission_chain(
        self,
        artifact: Artifact,
        user_id: str
    ) -> bool:
        """
        验证完整的权限链（用于修改操作，更严格的检查）
        
        与 _verify_artifact_permission 相同，但语义上强调修改权限
        """
        return await self._verify_artifact_permission(artifact, user_id)
    
    # ============================================================================
    # Artifact 解析（包装 utils.artifacts）
    # ============================================================================
    
    def parse_artifacts_from_llm_response(self, response: str) -> List[Dict[str, Any]]:
        """
        从 LLM 响应中解析 Artifacts
        
        包装 backend.utils.artifacts.parse_artifacts_from_response
        
        Args:
            response: LLM 响应文本
            
        Returns:
            Artifacts 列表
        """
        return parse_artifacts_from_response(response)
    
    def extract_code_blocks(
        self,
        response: str,
        language_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        提取代码块
        
        Args:
            response: LLM 响应文本
            language_filter: 语言过滤（如 'python', 'javascript'）
            
        Returns:
            代码块列表
        """
        artifacts = parse_artifacts_from_response(response)
        code_artifacts = [a for a in artifacts if a.get("type") == "code"]
        
        if language_filter:
            code_artifacts = [
                a for a in code_artifacts
                if a.get("language") == language_filter
            ]
        
        return code_artifacts
    
    # ============================================================================
    # 批量操作
    # ============================================================================
    
    async def batch_update_artifacts(
        self,
        updates: List[Dict[str, str]],
        user_id: str
    ) -> List[Dict[str, Any]]:
        """
        批量更新 Artifacts
        
        Args:
            updates: 更新列表，每项包含 artifact_id 和 content
            user_id: 用户ID
            
        Returns:
            更新结果列表
        """
        results = []
        for update in updates:
            try:
                result = await self.update_artifact(
                    artifact_id=update["artifact_id"],
                    content=update["content"],
                    user_id=user_id
                )
                results.append({"success": True, "data": result})
            except Exception as e:
                results.append({"success": False, "error": str(e)})
        
        return results
