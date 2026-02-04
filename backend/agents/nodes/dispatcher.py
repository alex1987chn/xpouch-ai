"""
Expert Dispatcher 节点 - 专家分发器

支持显式依赖关系（DAG），自动注入前置任务输出到上下文
"""
from typing import Dict, Any, List
from datetime import datetime

from agents.state import AgentState
from agents.dynamic_experts import DYNAMIC_EXPERT_FUNCTIONS, get_expert_function, get_expert_config_cached
from utils.llm_factory import get_expert_llm
from utils.event_generator import (
    event_task_started, event_task_completed, event_task_failed,
    event_artifact_generated, sse_event_to_string
)
from crud.task_session import update_subtask_status, create_artifacts_batch
from utils.exceptions import AppError
from models import ArtifactCreate


async def expert_dispatcher_node(state: AgentState) -> Dict[str, Any]:
    """
    专家分发器节点
    v3.1 更新：支持显式依赖关系（DAG），自动注入前置任务输出到上下文
    """
    task_list = state["task_list"]
    current_index = state["current_task_index"]
    expert_results = state.get("expert_results", [])
    
    # 获取数据库会话
    db_session = state.get("db_session")
    task_session_id = state.get("task_session_id")
    
    # 收集事件队列
    event_queue = state.get("event_queue", [])

    if current_index >= len(task_list):
        return {"expert_results": expert_results, "event_queue": event_queue}

    current_task = task_list[current_index]
    task_id = current_task["id"]
    task_short_id = current_task.get("task_id", f"task_{current_index}")  # Commander 生成的短ID
    expert_type = current_task["expert_type"]
    description = current_task["description"]
    depends_on = current_task.get("depends_on", [])

    print(f"[EXEC] 执行任务 [{current_index + 1}/{len(task_list)}] - {expert_type}: {description}")
    
    # v3.1: 依赖检查和上下文注入
    dependency_context = ""
    dependency_outputs = []
    if depends_on:
        # 构建 task_short_id -> result 的映射
        task_result_map = {}
        for result in expert_results:
            short_id = result.get("task_short_id")
            if short_id:
                task_result_map[short_id] = result
        
        # 调试日志
        print(f"[DEBUG] depends_on: {depends_on}")
        print(f"[DEBUG] task_result_map keys: {list(task_result_map.keys())}")
        print(f"[DEBUG] expert_results count: {len(expert_results)}")
        
        # 收集依赖任务的输出
        for dep_task_id in depends_on:
            if dep_task_id in task_result_map:
                dep_result = task_result_map[dep_task_id]
                dependency_outputs.append({
                    "task_id": dep_task_id,
                    "expert_type": dep_result["expert_type"],
                    "description": dep_result["description"],
                    "output": dep_result["output"]
                })
                print(f"[DEBUG] 找到依赖任务 {dep_task_id}: {dep_result['expert_type']}")
            else:
                print(f"[WARN] 依赖任务 {dep_task_id} 的输出尚未就绪")
        
        if dependency_outputs:
            # 格式化依赖上下文
            dependency_parts = []
            for dep in dependency_outputs:
                output_preview = dep['output'][:500] + "..." if len(dep['output']) > 500 else dep['output']
                dep_str = f"【前置任务: {dep['task_id']} ({dep['expert_type']})】\n描述: {dep['description']}\n输出:\n{output_preview}"
                dependency_parts.append(dep_str)
            
            dependency_context = "\n\n".join(dependency_parts)
            print(f"[DEP] 已注入 {len(dependency_outputs)} 个依赖任务的上下文")
    
    # v3.0: 更新数据库状态为 running
    if db_session:
        update_subtask_status(db_session, task_id, "running")
    
    # v3.0: 发送 task.started 事件
    started_event = event_task_started(
        task_id=task_id,
        expert_type=expert_type,
        description=description
    )
    event_queue.append({"type": "sse", "event": sse_event_to_string(started_event)})

    try:
        # 使用 get_expert_function 获取专家执行函数
        expert_func = get_expert_function(expert_type)

        # v3.1: 准备带依赖上下文的 state
        # 将依赖上下文注入到 current_task 的 input_data 中
        enhanced_input_data = current_task.get("input_data", {}).copy()
        if dependency_context:
            enhanced_input_data["__dependency_context"] = dependency_context
            # 同时保存结构化的依赖数据供专家使用
            enhanced_input_data["__dependencies"] = [
                {
                    "task_id": dep["task_id"],
                    "expert_type": dep["expert_type"],
                    "output": dep["output"]
                }
                for dep in dependency_outputs
            ]
        
        # 创建增强的 state，注入依赖上下文
        enhanced_task = current_task.copy()
        enhanced_task["input_data"] = enhanced_input_data
        
        # 临时替换 state 中的 current_task
        original_task_list = task_list.copy()
        task_list[current_index] = enhanced_task
        
        # v3.2: 创建增强的 state，确保专家能获取到依赖上下文
        enhanced_state = state.copy()
        enhanced_state["task_list"] = task_list.copy()

        if expert_type in DYNAMIC_EXPERT_FUNCTIONS:
            # 系统内置专家，使用原有逻辑（预先创建 LLM）
            expert_config = get_expert_config_cached(expert_type)
            if expert_config and 'provider' in expert_config:
                expert_llm = get_expert_llm(provider=expert_config['provider'])
            else:
                expert_llm = get_expert_llm()
            result = await expert_func(enhanced_state, expert_llm)
        else:
            # 自定义专家，使用通用节点（generic_worker_node 自己会创建 LLM）
            result = await expert_func(enhanced_state)
        
        # 恢复原 task_list（避免污染 state）
        task_list[current_index] = original_task_list[current_index]

        if "error" in result:
             raise AppError(message=result["error"], code="EXPERT_EXECUTION_ERROR")

        # 更新任务状态
        current_task["output_result"] = {"content": result.get("output_result", "")}
        current_task["status"] = result.get("status", "completed")
        current_task["completed_at"] = result.get("completed_at")
        
        # 添加到结果集（v3.1: 包含 task_short_id 用于依赖查找）
        updated_results = state["expert_results"] + [{
            "task_id": current_task["id"],  # 数据库 UUID
            "task_short_id": task_short_id,  # Commander 生成的短 ID (如 task_search)
            "expert_type": expert_type,
            "description": description,
            "output": result.get("output_result", ""),
            "status": result.get("status", "unknown"),
            "duration_ms": result.get("duration_ms", 0)
        }]

        duration_ms = result.get('duration_ms', 0)
        duration = duration_ms / 1000
        print(f"   [OK] 耗时 {duration:.2f}s")
        
        # v3.0: 处理产物（Artifact）
        artifacts_data = result.get("artifacts", [])
        if not artifacts_data and result.get("artifact"):
            # 兼容旧格式
            artifacts_data = [result.get("artifact")]
        
        # v3.0: 保存产物到数据库
        artifact_count = 0
        if db_session and artifacts_data:
            artifact_creates = [
                ArtifactCreate(
                    type=art.get("type", "text"),
                    title=art.get("title"),
                    content=art.get("content", ""),
                    language=art.get("language"),
                    sort_order=idx
                )
                for idx, art in enumerate(artifacts_data)
            ]
            created_artifacts = create_artifacts_batch(db_session, task_id, artifact_creates)
            artifact_count = len(created_artifacts)
            
            # 发送 artifact.generated 事件
            for art, created in zip(artifacts_data, created_artifacts):
                artifact_event = event_artifact_generated(
                    task_id=task_id,
                    expert_type=expert_type,
                    artifact_id=created.id,
                    artifact_type=created.type,
                    content=created.content,
                    title=created.title,
                    language=created.language,
                    sort_order=created.sort_order
                )
                event_queue.append({"type": "sse", "event": sse_event_to_string(artifact_event)})
        
        # v3.0: 更新数据库状态为 completed
        if db_session:
            update_subtask_status(
                db_session, 
                task_id, 
                "completed",
                output_result={"content": result.get("output_result", "")},
                duration_ms=duration_ms
            )
        
        # v3.0: 发送 task.completed 事件
        completed_event = event_task_completed(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            output=result.get("output_result", ""),
            duration_ms=duration_ms,
            artifact_count=artifact_count
        )
        event_queue.append({"type": "sse", "event": sse_event_to_string(completed_event)})

        return_dict = {
            "task_list": task_list,
            "expert_results": updated_results,
            "current_task_index": current_index + 1,
            "event_queue": event_queue,
            "__expert_info": { # 保留前端兼容
                "expert_type": expert_type,
                "description": description,
                "status": "completed",
                "output": result.get("output_result", ""),
                "duration_ms": duration_ms,
            }
        }
        if "artifact" in result:
            return_dict["artifact"] = result["artifact"]

        return return_dict

    except Exception as e:
        print(f"   [ERROR] 专家执行失败: {e}")
        current_task["status"] = "failed"
        
        # v3.0: 更新数据库状态为 failed
        if db_session:
            update_subtask_status(
                db_session,
                task_id,
                "failed",
                error_message=str(e)
            )
        
        # v3.0: 发送 task.failed 事件
        failed_event = event_task_failed(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            error=str(e)
        )
        event_queue.append({"type": "sse", "event": sse_event_to_string(failed_event)})
        
        return {
            "task_list": task_list,
            "current_task_index": current_index + 1,
            "event_queue": event_queue,
            "__expert_info": {
                "expert_type": expert_type,
                "description": description,
                "status": "failed",
                "error": str(e),
                "duration_ms": 0,
            }
        }
