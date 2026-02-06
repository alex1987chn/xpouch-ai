"""
通用专家执行节点

用于处理动态创建的自定义专家，根据 state["current_task"]["expert_type"]
从数据库加载专家配置并执行。
"""
import os
import re
import asyncio  # 🔥 新增：用于异步保存专家执行结果
from typing import Dict, Any, Optional
from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig

from agents.state import AgentState
from agents.services.expert_manager import get_expert_config_cached
from utils.llm_factory import get_effective_model, get_expert_llm
from providers_config import get_model_config
from services.memory_manager import memory_manager  # 🔥 导入记忆管理器
from tools import ALL_TOOLS  # 🔥 新增：导入工具集


def _enhance_system_prompt(system_prompt: str) -> str:
    """
    【增强版】System Prompt 注入
    原名: _inject_current_time
    功能: 注入时间 + 强制工具使用指令 + 防偷懒逻辑
    """
    now = datetime.now()
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    weekday_str = weekdays[now.weekday()]
    time_str = now.strftime(f"%Y年%m月%d日 %H:%M:%S {weekday_str}")
    date_str = now.strftime("%Y-%m-%d")

    # 🔥 核心增强：给模型洗脑，强制它使用工具，禁止脑补
    enhanced_prompt = f"""【当前系统时间】：{time_str}
【当前日期】：{date_str}

{system_prompt}

【工具使用强制指令 (Mandatory Tool Usage)】：
你拥有强大的外部工具，针对以下情况 **必须** 调用工具，**严禁** 仅凭训练数据回答：
1. **涉及具体 URL**：如果任务包含 http/https 链接（如 GitHub, 技术博客），**必须** 调用 `read_webpage` 读取全文。
2. **涉及参数对比/最新技术**：如果任务要求"研究 DeepSeek-V3"、"参数对比"，**必须** 调用 `search_web` 或 `read_webpage` 获取一手数据。

【防偷懒协议 (Anti-Laziness Protocol)】：
1. **禁止复用上下文**：即使你觉得之前的对话里好像提到过相关信息，针对当前的具体任务（特别是 GitHub 阅读任务），你依然**必须**重新执行工具调用。
2. **看到 URL 就去读**：不要盯着 URL 发呆，不要猜测 URL 里的内容。直接调用 `read_webpage`！
3. **一步一动**：不要试图在一个回合里把所有事做完。先调工具 -> 拿到结果 -> 再分析。

【执行逻辑】：
检测到任务需求 -> 决定工具 (Search 或 Read) -> **输出 Tool Call** -> (等待执行) -> 获取 Artifact -> 生成回答。
"""
    return enhanced_prompt


async def generic_worker_node(state: Dict[str, Any], llm=None) -> Dict[str, Any]:
    """
    通用专家执行节点

    根据 state["current_task"]["expert_type"] 从数据库加载专家配置并执行。
    用于处理动态创建的自定义专家。

    支持工具调用流程：
    1. 首次调用：LLM 可能返回 tool_calls
    2. 工具执行后：LLM 看到 ToolMessage，生成最终回复

    Args:
        state: AgentState，包含 task_list, current_task_index 等
        llm: 可选的 LLM 实例，如果不提供则根据专家配置创建

    Returns:
        Dict: 执行结果，包含 output_result, status, artifact 等
    """
    from langchain_core.messages import ToolMessage

    # 获取当前任务
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    existing_messages = state.get("messages", [])
    
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

        # 🔥 核心修改：增强 System Prompt (注入时间 + 工具指令)
        enhanced_system_prompt = _enhance_system_prompt(system_prompt)

        # 🔥 关键修复：构建消息列表
        # 如果有现有的 messages（包含 ToolMessage），则使用它们
        # 否则创建新的消息列表
        has_tool_message = False
        if existing_messages:
            # 工具执行后的情况：messages 包含 AIMessage(tool_calls) + ToolMessage
            # 我们需要保留这些上下文，让 LLM 看到工具结果
            # 检查最后一条是否是 ToolMessage
            if existing_messages and isinstance(existing_messages[-1], ToolMessage):
                has_tool_message = True
            messages_for_llm = [
                SystemMessage(content=enhanced_system_prompt),
                *existing_messages  # 包含 AIMessage(tool_calls) 和 ToolMessage
            ]
        else:
            # 首次调用：创建新的消息列表
            messages_for_llm = [
                SystemMessage(content=enhanced_system_prompt),
                HumanMessage(content=f"任务描述: {description}\n\n输入参数:\n{_format_input_data(input_data)}")
            ]

        # 🔥 关键修复：根据是否有 ToolMessage 决定是否绑定工具
        # 如果已经有 ToolMessage（工具执行完成），则不绑定工具，防止无限循环
        if has_tool_message:
            llm_to_use = llm_with_config
        else:
            # 🔥 新增：为所有专家绑定工具（联网搜索、时间、计算器）
            # 如果 LLM 支持工具调用，则绑定工具集
            try:
                llm_to_use = llm_with_config.bind_tools(ALL_TOOLS)
            except Exception as e:
                print(f"[GenericWorker] ⚠️ 工具绑定失败（模型可能不支持工具调用）: {e}")
                llm_to_use = llm_with_config

        # 🔥 关键优化：当 has_tool_message=True 时，在消息末尾添加明确的"任务完成"提示
        if has_tool_message:
            # 在消息列表末尾添加一个 HumanMessage，明确告诉 LLM 任务完成
            messages_for_llm.append(HumanMessage(content="[系统提示：以上是工具执行结果，请基于此结果生成最终回复，任务已完成，不要再调用任何工具]"))

        # 使用 RunnableConfig 添加标签，便于流式输出过滤
        response = await llm_to_use.ainvoke(
            messages_for_llm,
            config=RunnableConfig(
                tags=["expert", expert_type, "generic_worker"],
                metadata={"node_type": "expert", "expert_type": expert_type}
            )
        )

        # 🔥 关键修复：检查响应中是否包含工具调用
        has_tool_calls = hasattr(response, "tool_calls") and response.tool_calls

        if has_tool_calls:
            print(f"[GenericWorker] 🔧 LLM 返回了工具调用！数量: {len(response.tool_calls)}")
            for tool_call in response.tool_calls:
                print(f"[GenericWorker]   - 工具: {tool_call.get('name', 'unknown')}")
            # 🔥🔥 关键：返回 messages 让 ToolNode 处理工具调用
            # 此时不生成 task.completed 事件，因为任务还没完成
            return {
                "messages": [response],  # 包含 tool_calls 的 AIMessage
                "task_list": task_list,
                "current_task_index": current_index,  # 不增加 index，等工具执行完再说
                "event_queue": initial_event_queue,  # 只返回 started 事件
                "__expert_info": {
                    "expert_type": expert_type,
                    "expert_name": expert_name,
                    "task_id": task_id,
                    "status": "waiting_for_tool",
                    "tool_calls": response.tool_calls
                }
            }

        # 没有工具调用，正常完成任务
        print(f"[GenericWorker] ℹ️ LLM 返回了普通文本响应，未调用工具")

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        print(f"[GenericWorker] '{expert_type}' completed (耗时: {duration_ms/1000:.2f}s)")

        # -------------------------------------------------------------
        # 🔥 新增逻辑：如果是记忆专家，执行"写入数据库"操作
        # -------------------------------------------------------------
        if expert_type == "memorize_expert":
            memory_content = response.content.strip()
            # 从 state 获取 user_id，默认使用 default_user
            user_id = state.get("user_id", "default_user")
            
            if memory_content:
                print(f"[GenericWorker] 正在保存记忆: {memory_content}")
                try:
                    # 异步调用 memory_manager 保存 (内部使用了 to_thread)
                    await memory_manager.add_memory(
                        user_id=user_id,
                        content=memory_content,
                        source="conversation",
                        memory_type="fact"
                    )
                    print(f"[GenericWorker] 记忆保存成功!")
                    # 修改返回给用户的 output，让反馈更自然
                    response_content_original = response.content
                    response.content = f"已为您记录：{response_content_original}"
                except Exception as mem_err:
                    print(f"[GenericWorker] 记忆保存失败: {mem_err}")
                    response.content = f"记录时遇到问题，但我会记住：{memory_content}"
        # -------------------------------------------------------------

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

        # ✅ 异步保存专家执行结果到数据库（P0 优化：不阻塞主流程）
        # 🔥 修复：不传递 db_session，在 async_save_expert_result 中创建独立的 Session
        if task_id:
            try:
                from utils.async_task_queue import async_save_expert_result
                # 使用后台线程异步保存，不阻塞 LLM 响应返回
                asyncio.create_task(async_save_expert_result(
                    task_id=task_id,
                    expert_type=expert_type,
                    output_result=response.content,
                    artifact_data=artifact,
                    duration_ms=duration_ms
                ))
                print(f"[GenericWorker] ✅ 专家执行结果已提交后台线程池保存: {expert_type}")
            except Exception as save_err:
                print(f"[GenericWorker] ⚠️ 后台保存提交失败: {save_err}")
        else:
            print(f"[GenericWorker] ⚠️ 跳过保存: task_id={task_id}")

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
            "messages": [response],  # 🔥🔥🔥 核心修复：必须把 LLM 的最终回复更新到图状态的消息历史中！🔥🔥🔥
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
