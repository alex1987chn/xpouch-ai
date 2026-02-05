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

        return {
            "task_list": task_list,
            "expert_results": expert_results,
            "current_task_index": next_index,  # ✅ 增加 index
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms,
            "artifact": {
                "type": artifact_type,
                "title": f"{expert_name}结果",
                "content": response.content,
                "source": f"{expert_type}_expert"
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
        expert_result = {
            "task_id": current_task.get("id", str(current_index)),
            "expert_type": expert_type,
            "description": description,
            "output": f"专家执行失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "duration_ms": 0
        }
        expert_results = expert_results + [expert_result]

        return {
            "task_list": task_list,
            "expert_results": expert_results,
            "current_task_index": next_index,  # ✅ 即使失败也增加 index
            "output_result": f"专家执行失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat()
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
