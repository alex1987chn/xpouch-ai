"""
指挥官（Commander） - 任务分解和协调专家
"""
from typing import Dict, Any, List
from langchain_core.messages import SystemMessage, HumanMessage
from datetime import datetime


# ============================================================================
# 指挥官提示词模板
# ============================================================================

COMMANDER_PROMPT = """你是一个任务指挥官，负责分析用户需求并将其分解为多个专家子任务。

你的职责：
1. 分析用户的完整需求
2. 判断需要哪些专家参与
3. 将任务分解为清晰的子任务序列
4. 为每个子任务指定最合适的专家

可选的专家类型：
- search: 信息搜索专家（搜索相关信息、整理结果）
- coder: 编程专家（编写代码、代码解释、bug修复）
- researcher: 研究专家（深入调研、文献分析、技术对比）
- analyzer: 分析专家（逻辑分析、数据推理、问题诊断）
- writer: 写作专家（创意写作、文案撰写、内容创作）
- planner: 规划专家（制定计划、步骤分解、风险评估）
- image_analyzer: 图片分析专家（图片内容分析、视觉识别）

输出格式要求：
必须输出纯 JSON 格式，不要任何额外文字说明。

JSON 格式示例：
{
    "task_list": [
        {
            "expert_type": "search",
            "description": "搜索Python快速排序算法的实现方法",
            "input_data": {"keywords": ["快速排序", "Python", "算法"]}
        },
        {
            "expert_type": "coder",
            "description": "实现一个Python快速排序算法",
            "input_data": {"language": "Python", "requirements": ["时间复杂度O(n log n)", "添加注释"]}
        }
    ]
}

注意事项：
1. task_list 是一个数组，包含所有子任务
2. 每个任务必须包含：expert_type, description, input_data
3. 任务顺序应该合理，例如先搜索后编写，先分析后实施
4. 如果任务简单且只需要一个专家，可以只返回一个任务
5. input_data 应该提供足够的上下文信息给专家
"""


# ============================================================================
# 指挥官节点
# ============================================================================

async def commander_node(state: Dict[str, Any], llm) -> Dict[str, Any]:
    """
    指挥官节点：分析用户需求并分解任务

    Args:
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 更新后的 AgentState，包含 task_list
    """
    # 获取用户消息
    messages = state.get("messages", [])
    if not messages:
        return {"error": "没有用户消息"}

    user_message = messages[-1]
    user_content = user_message.content if hasattr(user_message, 'content') else str(user_message)

    started_at = datetime.now()

    try:
        print(f"[COMMANDER] 开始分析用户需求: {user_content[:50]}...")

        # 调用 LLM 分解任务
        response = await llm.ainvoke([
            SystemMessage(content=COMMANDER_PROMPT),
            HumanMessage(content=user_content)
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        # 解析 LLM 返回的 JSON
        from utils.json_parser import _extract_json, _clean_json_format, _clean_markdown_blocks
        import json

        try:
            # 清理 markdown 代码块
            cleaned_content = _clean_markdown_blocks(response.content)
            # 提取 JSON
            json_str = _extract_json(cleaned_content)
            # 清理 JSON 格式
            json_str = _clean_json_format(json_str)
            # 解析 JSON
            parsed = json.loads(json_str)

            if isinstance(parsed, dict) and "task_list" in parsed:
                task_list = parsed["task_list"]
            elif isinstance(parsed, list):
                # 如果直接返回数组
                task_list = parsed
            else:
                # 解析失败，创建默认任务
                print(f"[COMMANDER] JSON 格式不正确，使用默认任务")
                task_list = [{
                    "expert_type": "analyzer",
                    "description": user_content,
                    "input_data": {}
                }]
        except Exception as parse_error:
            print(f"[COMMANDER] JSON 解析失败: {parse_error}")
            # 解析失败，创建默认任务
            task_list = [{
                "expert_type": "analyzer",
                "description": user_content,
                "input_data": {}
            }]

        print(f"[COMMANDER] 任务分解完成 (耗时: {duration_ms/1000:.2f}s)")
        print(f"[COMMANDER] 生成 {len(task_list)} 个子任务:")
        for i, task in enumerate(task_list):
            print(f"  [{i+1}] {task['expert_type']}: {task['description'][:50]}...")

        return {
            "task_list": task_list,
            "current_task_index": 0,
            "all_tasks_completed": False,
            "task_list_duration_ms": duration_ms
        }

    except Exception as e:
        print(f"[COMMANDER] 指挥官失败: {e}")
        # 失败时使用默认任务
        return {
            "task_list": [{
                "expert_type": "analyzer",
                "description": user_content,
                "input_data": {}
            }],
            "current_task_index": 0,
            "all_tasks_completed": False,
            "error": str(e)
        }


# ============================================================================
# 任务汇总节点
# ============================================================================

async def aggregator_node(state: Dict[str, Any], llm) -> Dict[str, Any]:
    """
    汇总节点：整合所有子任务的结果

    Args:
        state: 完整的 AgentState
        llm: LLM 实例

    Returns:
        Dict: 最终响应
    """
    task_list = state.get("task_list", [])
    task_results = state.get("task_results", [])

    if not task_results:
        return {"error": "没有子任务结果"}

    user_message = state.get("messages", [])[-1]
    user_content = user_message.content if hasattr(user_message, 'content') else str(user_message)

    started_at = datetime.now()

    try:
        print(f"[AGGREGATOR] 开始汇总 {len(task_results)} 个子任务结果")

        # 构建汇总 prompt
        results_summary = "\n\n".join([
            f"任务 {i+1} ({task.get('expert_type', 'unknown')}):\n"
            f"描述: {task.get('description', '')}\n"
            f"结果: {task.get('output_result', '')}"
            for i, task in enumerate(task_results)
        ])

        aggregator_prompt = f"""你是一个结果汇总专家。

原始用户需求: {user_content}

以下是多个专家子任务的执行结果：

{results_summary}

请整合以上结果，生成一个完整、连贯、友好的最终回复。
要求：
1. 回复应该直接回答用户的原始需求
2. 整合各个专家的关键发现和成果
3. 使用清晰的结构和适当的格式（如代码块、列表等）
4. 语言自然流畅，避免机械拼接
"""

        response = await llm.ainvoke([
            SystemMessage(content="你是一个结果汇总专家"),
            HumanMessage(content=aggregator_prompt)
        ])

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        print(f"[AGGREGATOR] 汇总完成 (耗时: {duration_ms/1000:.2f}s)")

        return {
            "final_response": response.content,
            "aggregator_duration_ms": duration_ms,
            "all_tasks_completed": True
        }

    except Exception as e:
        print(f"[AGGREGATOR] 汇总失败: {e}")
        # 失败时使用最后一个结果
        last_result = task_results[-1] if task_results else {}
        return {
            "final_response": last_result.get("output_result", "汇总失败，请重试"),
            "error": str(e)
        }


# ============================================================================
# 路由函数
# ============================================================================

def route_to_expert(state: Dict[str, Any]) -> str:
    """
    根据当前任务路由到对应的专家节点

    Args:
        state: AgentState

    Returns:
        str: 专家节点名称
    """
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        print(f"[ROUTE] 所有任务已完成，跳转到汇总")
        return "aggregator"

    current_task = task_list[current_index]
    expert_type = current_task.get("expert_type", "analyzer")

    print(f"[ROUTE] 路由到专家: {expert_type} (任务 {current_index + 1}/{len(task_list)})")

    # 映射专家类型到节点名称
    expert_mapping = {
        "search": "search_expert",
        "coder": "coder_expert",
        "researcher": "researcher_expert",
        "analyzer": "analyzer_expert",
        "writer": "writer_expert",
        "planner": "planner_expert",
        "image_analyzer": "image_analyzer_expert"
    }

    return expert_mapping.get(expert_type, "analyzer_expert")


def should_continue(state: Dict[str, Any]) -> str:
    """
    判断是否继续执行下一个任务

    Args:
        state: AgentState

    Returns:
        str: "continue" 或 "aggregate"
    """
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    if current_index >= len(task_list):
        return "aggregate"

    return "continue"


# ============================================================================
# 导出
# ============================================================================

__all__ = [
    "commander_node",
    "aggregator_node",
    "route_to_expert",
    "should_continue"
]
