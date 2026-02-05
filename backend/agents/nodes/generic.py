"""
通用专家执行节点

用于处理动态创建的自定义专家，根据 state["current_task"]["expert_type"]
从数据库加载专家配置并执行。
"""
import os
import re
from typing import Dict, Any, Optional
from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig

from agents.state import AgentState
from agents.services.expert_manager import get_expert_config_cached
from utils.llm_factory import get_effective_model, get_expert_llm
from providers_config import get_model_config


async def generic_worker_node(state: Dict[str, Any], llm=None) -> Dict[str, Any]:
    """
    通用专家执行节点
    
    根据 state["current_task"]["expert_type"] 从数据库加载专家配置并执行。
    用于处理动态创建的自定义专家。
    
    Args:
        state: AgentState，包含 task_list, current_task_index 等
        llm: 可选的 LLM 实例，如果不提供则根据专家配置创建
    
    Returns:
        Dict: 执行结果，包含 output_result, status, artifact 等
    """
    # 获取当前任务
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    
    if current_index >= len(task_list):
        return {
            "output_result": "没有待执行的任务",
            "status": "failed",
            "error": "Task index out of range",
            "started_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat()
        }
    
    current_task = task_list[current_index]
    expert_type = current_task.get("expert_type", "")
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})
    
    if not expert_type:
        return {
            "output_result": "任务缺少 expert_type 字段",
            "status": "failed",
            "error": "Missing expert_type in task",
            "started_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat()
        }
    
    # 从缓存加载专家配置
    expert_config = get_expert_config_cached(expert_type)
    
    # 如果缓存中没有，可能是自定义专家，尝试直接查数据库
    if not expert_config:
        print(f"[GenericWorker] 缓存中未找到 '{expert_type}'，尝试从数据库加载...")
        from database import engine
        from sqlmodel import Session
        from agents.services.expert_manager import get_expert_config
        
        with Session(engine) as session:
            expert_config = get_expert_config(expert_type, session)
            if expert_config:
                print(f"[GenericWorker] 从数据库加载 '{expert_type}' 成功")
    
    if not expert_config:
        return {
            "output_result": f"专家 '{expert_type}' 未找到",
            "status": "failed",
            "error": f"Expert '{expert_type}' not found in database",
            "started_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat()
        }
    
    started_at = datetime.now()

    # ✅ 发送 task.started 事件（专家开始执行）
    from utils.event_generator import event_task_started, sse_event_to_string
    task_id = current_task.get("id", str(current_index))
    started_event = event_task_started(
        task_id=task_id,
        expert_type=expert_type,
        description=description
    )
    # 将 started 事件放入 state 的 event_queue，让 dispatcher 或其他节点处理
    initial_event_queue = state.get("event_queue", [])
    initial_event_queue.append({"type": "sse", "event": sse_event_to_string(started_event)})
    print(f"[GenericWorker] 已生成 task.started 事件: {expert_type}")

    try:
        # 获取专家配置参数
        system_prompt = expert_config["system_prompt"]
        expert_name = expert_config.get("name", expert_type)
        
        # 应用模型兜底机制
        configured_model = expert_config.get("model")
        effective_model = get_effective_model(configured_model)
        
        # 获取模型配置以确定实际的 API 模型名称和温度
        model_config = get_model_config(effective_model)
        if model_config:
            actual_model = model_config.get("model", effective_model)
            temperature = model_config.get("temperature", expert_config.get("temperature", 0.7))
        else:
            actual_model = effective_model
            temperature = expert_config.get("temperature", 0.7)
        
        print(f"[GenericWorker] Running '{expert_type}' ({expert_name}) with model={actual_model}, temp={temperature}")
        
        # 如果没有提供 LLM 实例，根据配置创建
        if llm is None:
            # 根据模型配置获取 provider
            if model_config:
                provider = model_config.get("provider")
                llm = get_expert_llm(provider=provider, model=actual_model, temperature=temperature)
            else:
                llm = get_expert_llm(model=actual_model, temperature=temperature)
        
        # 绑定模型和温度参数
        llm_with_config = llm.bind(
            model=actual_model,
            temperature=temperature
        )
        
        # 使用 RunnableConfig 添加标签，便于流式输出过滤
        response = await llm_with_config.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{_format_input_data(input_data)}")
            ],
            config=RunnableConfig(
                tags=["expert", expert_type, "generic_worker"],
                metadata={"node_type": "expert", "expert_type": expert_type}
            )
        )
        
        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)
        
        print(f"[GenericWorker] '{expert_type}' completed (耗时: {duration_ms/1000:.2f}s)")

        # 检测 artifact 类型
        artifact_type = _detect_artifact_type(response.content, expert_type)

        # ✅ v3.2 修复：增加 current_task_index 以支持循环
        # Generic Worker 执行完任务后，需要递增 index 才能执行下一个任务
        next_index = current_index + 1

        # ✅ 更新任务列表中的任务状态
        task_list[current_index]["output_result"] = {"content": response.content}
        task_list[current_index]["status"] = "completed"
        task_list[current_index]["completed_at"] = completed_at.isoformat()

        # ✅ 添加到 expert_results（用于后续任务依赖和最终聚合）
        expert_result = {
            "task_id": current_task.get("id", str(current_index)),
            "expert_type": expert_type,
            "description": description,
            "output": response.content,
            "status": "completed",
            "duration_ms": duration_ms
        }

        # 获取现有的 expert_results 并追加新结果
        expert_results = state.get("expert_results", [])
        expert_results = expert_results + [expert_result]

        # ✅ 构建 artifact 对象（符合 ArtifactCreate 模型）
        artifact = {
            "type": artifact_type,
            "title": f"{expert_name}结果",
            "content": response.content,
            "language": None,  # 可选字段，Pydantic 模型需要
            "sort_order": 0    # 默认排序
        }

        # ✅ 实时保存专家执行结果到数据库（关键修复！）
        db_session = state.get("db_session")
        if db_session and task_id:
            try:
                from agents.services.task_manager import save_expert_execution_result
                save_expert_execution_result(
                    db=db_session,
                    task_id=task_id,
                    expert_type=expert_type,
                    output_result=response.content,
                    artifact_data=artifact,
                    duration_ms=duration_ms
                )
                print(f"[GenericWorker] ✅ 专家执行结果已实时保存到数据库: {expert_type}")
            except Exception as save_err:
                print(f"[GenericWorker] ⚠️ 实时保存失败（不影响流程）: {save_err}")
        else:
            print(f"[GenericWorker] ⚠️ 跳过实时保存: db_session={db_session is not None}, task_id={task_id}")

        # ✅ 生成事件队列（用于前端展示专家和 artifact）
        from utils.event_generator import (
            event_task_completed, event_artifact_generated, sse_event_to_string
        )
        from uuid import uuid4

        event_queue = []
        task_id = current_task.get("id", str(current_index))

        # 1. 发送 task.completed 事件（专家执行完成）
        task_completed_event = event_task_completed(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            output=response.content[:500] + "..." if len(response.content) > 500 else response.content,
            duration_ms=duration_ms,
            artifact_count=1
        )
        event_queue.append({"type": "sse", "event": sse_event_to_string(task_completed_event)})
        print(f"[GenericWorker] 已生成 task.completed 事件: {expert_type}")

        # 2. 发送 artifact.generated 事件（生成产物）
        artifact_event = event_artifact_generated(
            task_id=task_id,
            expert_type=expert_type,
            artifact_id=str(uuid4()),
            artifact_type=artifact_type,
            content=response.content,
            title=f"{expert_name}结果"
        )
        event_queue.append({"type": "sse", "event": sse_event_to_string(artifact_event)})
        print(f"[GenericWorker] 已生成 artifact.generated 事件: {artifact_type}")

        # ✅ 合并 started 事件和 completed 事件
        full_event_queue = initial_event_queue + event_queue

        return {
            "task_list": task_list,
            "expert_results": expert_results,
            "current_task_index": next_index,  # ✅ 增加 index
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms,
            "artifact": artifact,
            "event_queue": full_event_queue,  # ✅ 添加完整事件队列（包含 started 和 completed）
            # ✅ 添加 __expert_info 用于 chat.py 识别和收集 artifacts
            "__expert_info": {
                "expert_type": expert_type,
                "expert_name": expert_name,
                "task_id": task_id,
                "status": "completed"
            }
        }
        
    except Exception as e:
        print(f"[GenericWorker] '{expert_type}' failed: {e}")

        # ✅ 失败时也要增加 index，否则会卡死循环
        next_index = current_index + 1

        # 更新任务状态为失败
        task_list[current_index]["status"] = "failed"

        # 获取现有的 expert_results 并添加失败记录
        expert_results = state.get("expert_results", [])
        task_id = current_task.get("id", str(current_index))
        expert_result = {
            "task_id": task_id,
            "expert_type": expert_type,
            "description": description,
            "output": f"专家执行失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "duration_ms": 0
        }
        expert_results = expert_results + [expert_result]

        # ✅ 生成 task.failed 事件
        from utils.event_generator import event_task_failed, sse_event_to_string

        event_queue = []
        failed_event = event_task_failed(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            error=str(e)
        )
        event_queue.append({"type": "sse", "event": sse_event_to_string(failed_event)})
        print(f"[GenericWorker] 已生成 task.failed 事件: {expert_type}")

        # ✅ 合并 started 事件和 failed 事件
        full_event_queue = initial_event_queue + event_queue

        return {
            "task_list": task_list,
            "expert_results": expert_results,
            "current_task_index": next_index,  # ✅ 即使失败也增加 index
            "output_result": f"专家执行失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat(),
            "event_queue": full_event_queue,  # ✅ 添加完整事件队列（包含 started 和 failed）
            # ✅ 添加 __expert_info 用于标识失败的专家
            "__expert_info": {
                "expert_type": expert_type,
                "expert_name": expert_config.get("name", expert_type) if expert_config else expert_type,
                "task_id": task_id,
                "status": "failed",
                "error": str(e)
            }
        }


def _format_input_data(data: Dict) -> str:
    """格式化输入数据为文本"""
    if not data:
        return "（无额外参数）"
    
    lines = []
    for key, value in data.items():
        if isinstance(value, (list, dict)):
            lines.append(f"- {key}: {value}")
        else:
            lines.append(f"- {key}: {value}")
    
    return "\n".join(lines)


def _detect_artifact_type(content: str, expert_key: str) -> str:
    """
    检测 artifact 类型
    
    简化版，默认返回 "text"，但会尝试检测 HTML 和 Markdown 内容。
    """
    content_lower = content.lower().strip()
    
    # 1. HTML 检测
    if (content_lower.startswith("<!doctype html") or
        content_lower.startswith("<html") or
        ("<html" in content_lower and "</html>" in content_lower)):
        return "html"
    
    # 检测 HTML 代码块
    html_code_block = re.search(r'```html\n([\s\S]*?)```', content, re.IGNORECASE)
    if html_code_block:
        return "html"
    
    # 2. Markdown 检测
    has_markdown = any(marker in content for marker in ['# ', '## ', '### ', '> ', '- ', '* '])
    has_code_block = '```' in content
    
    if has_markdown or has_code_block:
        return "markdown"
    
    # 3. 默认返回 text
    return "text"
