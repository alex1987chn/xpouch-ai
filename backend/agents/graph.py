"""
超智能体指挥官工作流 - 第二步
实现任务拆解、专家路由和结果聚合的完整流程
"""
from typing import TypedDict, Annotated, List, Dict, Any, Literal
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
import os
from dotenv import load_dotenv
import pathlib
from pydantic import BaseModel, Field
from uuid import uuid4
from datetime import datetime

# 导入数据模型
import sys
sys.path.append(str(pathlib.Path(__file__).parent))
from models import ExpertType, TaskStatus, SubTask
from config import init_langchain_tracing, get_langsmith_config
from utils.json_parser import parse_llm_json
from utils.exceptions import AppError
from agents.experts import (
    run_search_expert,
    run_coder_expert,
    run_researcher_expert,
    run_analyzer_expert,
    run_writer_expert,
    run_planner_expert,
    run_image_analyzer_expert,
    EXPERT_FUNCTIONS
)


# ============================================================================
# 环境变量加载 & LangSmith 初始化
# ============================================================================


# ============================================================================
# 环境变量加载 & LangSmith 初始化
# ============================================================================

env_path = pathlib.Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
model_name = os.getenv("MODEL_NAME", "deepseek-chat")

# 初始化 LangSmith tracing
langsmith_config = get_langsmith_config()
if langsmith_config["enabled"]:
    init_langchain_tracing(langsmith_config)
    print(f"[TRACE] LangSmith tracing 已启用: {langsmith_config['project_name']}")
else:
    print("[INFO] LangSmith tracing 未启用")

llm = ChatOpenAI(
    model=model_name,
    temperature=0.7,
    api_key=api_key,
    base_url=base_url,
    streaming=True
)


# ============================================================================
# 指挥官结构化输出定义
# ============================================================================

class SubTaskOutput(BaseModel):
    """单个子任务的结构化输出"""
    expert_type: ExpertType = Field(description="执行此任务的专家类型")
    description: str = Field(description="任务的自然语言描述")
    input_data: Dict[str, Any] = Field(default={}, description="任务输入参数")
    priority: int = Field(default=0, description="任务优先级（0=最高）")


class CommanderOutput(BaseModel):
    """指挥官的结构化输出 - 子任务列表"""
    tasks: List[SubTaskOutput] = Field(description="拆解的子任务列表")
    strategy: str = Field(description="任务执行策略描述")
    estimated_steps: int = Field(description="预计执行步骤数")


# ============================================================================
# Agent 状态定义
# ============================================================================

class AgentState(TypedDict):
    """
    超智能体系统的全局状态

    包含：
    - messages: 消息历史（支持 add_messages）
    - task_list: 子任务列表（字典格式，用于专家函数）
    - current_task_index: 当前执行的任务索引
    - strategy: 执行策略
    - expert_results: 专家执行结果汇总
    - final_response: 最终整合的响应
    """
    messages: Annotated[List[BaseMessage], add_messages]
    task_list: List[Dict[str, Any]]
    current_task_index: int
    strategy: str
    expert_results: List[Dict[str, Any]]
    final_response: str


# ============================================================================
# 指挥官节点 - 任务拆解与分发
# ============================================================================

async def commander_node(state: AgentState) -> Dict[str, Any]:
    """
    指挥官节点：接收用户查询，拆解为多个子任务
    
    核心功能：
    1. 分析用户查询的复杂度
    2. 识别需要调用的专家类型
    3. 为每个专家生成具体的子任务
    4. 定义任务执行顺序和依赖关系
    
    Args:
        state: 当前工作流状态
    
    Returns:
        Dict[str, Any]: 更新后的状态（包含 task_list 和 strategy）
    """
    messages = state["messages"]
    
    # 获取用户查询（最新消息）
    if not messages:
        return {"task_list": [], "strategy": "无查询", "current_task_index": 0}
    
    last_message = messages[-1]
    user_query = last_message.content if isinstance(last_message, HumanMessage) else str(last_message.content)
    
    # 指挥官系统提示词
    system_prompt = """你是一个智能任务指挥官（Commander），负责将用户查询拆解为多个专业的子任务。

你的职责：
1. 分析用户查询的需求和复杂度
2. 识别需要哪些专家类型来完成任务
3. 为每个专家生成具体、可执行的子任务
4. 定义任务执行的优先级和依赖关系

可用的专家类型：
- search: 信息搜索专家 - 用于搜索、查询信息
- coder: 编程专家 - 用于代码编写、调试、优化
- researcher: 研究专家 - 用于深入研究、文献调研
- analyzer: 分析专家 - 用于数据分析、逻辑推理
- writer: 写作专家 - 用于文案撰写、内容创作
- planner: 规划专家 - 用于任务规划、方案设计
- image_analyzer: 图片分析专家 - 用于图片内容分析、视觉识别

任务拆解原则：
- 将复杂任务分解为多个独立的、可并行的子任务
- 每个子任务应明确指定由哪个专家执行
- 子任务之间应有清晰的逻辑关系
- 为子任务提供足够的上下文和参数

请以 JSON 格式输出子任务列表，包含以下信息：
- expert_type: 专家类型（search/coder/researcher/analyzer/writer/planner/image_analyzer）
- description: 任务描述（清晰、具体）
- input_data: 任务输入参数（字典格式）
- priority: 优先级（0=最高，数字越小越优先）
"""
    
    # 构建提示词模板
    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"用户查询：{user_query}\n\n请将此查询拆解为子任务列表。")
    ])

    # 调用 LLM 并使用通用解析器
    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"用户查询：{user_query}\n\n请将此查询拆解为子任务列表。\n\n必须以 JSON 格式输出，包含 tasks 列表、strategy 和 estimated_steps。")
        ])

        # 使用通用解析器解析 JSON（兼容所有模型）
        commander_response = parse_llm_json(
            response.content,
            CommanderOutput,
            strict=False,
            clean_markdown=True
        )

        # 将 SubTaskOutput 转换为字典列表（用于 AgentState）
        task_list = [
            {
                "id": str(uuid4()),
                "expert_type": task.expert_type,
                "description": task.description,
                "input_data": task.input_data,
                "priority": task.priority,
                "status": "pending",
                "output_result": None,
                "started_at": None,
                "completed_at": None,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            for task in commander_response.tasks
        ]

        print(f"[CMD] 指挥官拆解完成: {len(task_list)} 个子任务")
        print(f"   策略: {commander_response.strategy}")
        print(f"   预计步骤: {commander_response.estimated_steps}")

        for i, task in enumerate(task_list):
            print(f"   [{i+1}] {task['expert_type']}: {task['description']}")

        return {
            "task_list": task_list,
            "strategy": commander_response.strategy,
            "current_task_index": 0,
            "expert_results": []
        }

    except Exception as e:
        print(f"[ERROR] 指挥官节点错误: {e}")
        return {
            "task_list": [],
            "strategy": f"错误: {str(e)}",
            "current_task_index": 0,
            "expert_results": []
        }


# ============================================================================
# 专家执行节点
# ============================================================================

async def expert_dispatcher_node(state: AgentState) -> Dict[str, Any]:
    """
    专家分发器节点：根据当前任务索引，分发任务到对应专家

    Args:
        state: 当前工作流状态

    Returns:
        Dict[str, Any]: 更新后的状态（包含专家结果）
    """
    task_list = state["task_list"]
    current_index = state["current_task_index"]

    if current_index >= len(task_list):
        # 所有任务已完成
        return {"expert_results": state["expert_results"]}

    # 获取当前任务
    current_task = task_list[current_index]
    expert_type = current_task["expert_type"]
    description = current_task["description"]

    print(f"[EXEC] 正在执行 [{current_index + 1}/{len(task_list)}] - {expert_type} 专家")
    print(f"   任务: {description}")

    # 调用原子化专家节点（直接传递 State）
    try:
        # 查找对应的专家函数
        expert_func = EXPERT_FUNCTIONS.get(expert_type)

        if not expert_func:
            raise ValueError(f"未知的专家类型: {expert_type}")

        # 调用专家节点（传递完整的 state）
        result = await expert_func(state, llm)

        # 检查执行结果
        if "error" in result:
            raise AppError(
                message=result["error"],
                code="EXPERT_EXECUTION_ERROR",
                status_code=500
            )

        # 转换 SubTask 对象（更新 output_result 和 status）
        current_task["output_result"] = {"content": result.get("output_result", "")}
        current_task["status"] = result.get("status", "completed")
        current_task["started_at"] = result.get("started_at")
        current_task["completed_at"] = result.get("completed_at")
        current_task["updated_at"] = datetime.now().isoformat()

        # 记录到 expert_results
        updated_results = state["expert_results"] + [{
            "task_id": current_task["id"],
            "expert_type": expert_type,
            "description": description,
            "output": result.get("output_result", ""),
            "status": result.get("status", "unknown"),
            "started_at": result.get("started_at"),
            "completed_at": result.get("completed_at", datetime.now().isoformat()),
            "duration_ms": result.get("duration_ms", 0)
        }]

        duration = result.get('duration_ms', 0) / 1000
        print(f"   [OK] 专家执行完成 (耗时: {duration:.2f}s)")

        # 构建返回值，包含 artifact（如果有）
        return_dict = {
            "task_list": task_list,  # 更新 task_list（包含已更新的 SubTask）
            "expert_results": updated_results,
            "current_task_index": current_index + 1,
            # 添加专家信息供流式事件处理使用
            "__expert_info": {
                "expert_type": expert_type,
                "status": "completed",
                "duration_ms": result.get("duration_ms", 0),
                "output": result.get("output_result", ""),
                "error": None
            }
        }

        # 如果专家返回了 artifact，添加到返回值中
        if "artifact" in result:
            return_dict["artifact"] = result["artifact"]
            print(f"   [ARTIFACT] 检测到 artifact: {result['artifact']['type']}")

        return return_dict

    except Exception as e:
        print(f"   [ERROR] 专家执行失败: {e}")

        # 标记任务失败
        current_task["status"] = "failed"
        current_task["output_result"] = {"content": f"执行失败: {str(e)}"}
        current_task["updated_at"] = datetime.now().isoformat()

        error_result = f"执行失败: {str(e)}"
        updated_results = state["expert_results"] + [{
            "task_id": current_task["id"],
            "expert_type": expert_type,
            "description": description,
            "output": error_result,
            "completed_at": datetime.now().isoformat(),
            "error": str(e)
        }]

        return {
            "task_list": task_list,
            "expert_results": updated_results,
            "current_task_index": current_index + 1,
            # 添加专家信息供流式事件处理使用
            "__expert_info": {
                "expert_type": expert_type,
                "status": "failed",
                "duration_ms": 0,
                "output": error_result,
                "error": str(e)
            }
        }


# ============================================================================
# 专家执行节点
# ============================================================================

async def aggregator_node(state: AgentState) -> Dict[str, Any]:
    """
    聚合器节点：整合所有专家执行结果，生成最终响应

    核心功能：
    1. 收集所有专家的执行结果
    2. 识别结果之间的关系和依赖
    3. 整合为一个连贯、有用的最终响应
    4. 处理专家之间的冲突或矛盾
    5. 生成结构化的 Markdown 响应

    Args:
        state: 当前工作流状态

    Returns:
        Dict[str, Any]: 更新后的状态（包含 final_response）
    """
    expert_results = state["expert_results"]
    strategy = state["strategy"]

    if not expert_results:
        return {
            "final_response": "没有专家执行结果，无法生成响应。"
        }

    print(f"[AGG] 聚合器整合 {len(expert_results)} 个专家结果")
    print(f"   策略: {strategy}")

    # 构建结构化的 Markdown 响应
    final_response = _build_markdown_response(expert_results, strategy)

    print(f"   [OK] 聚合完成，生成 {len(final_response)} 字符的 Markdown 响应")

    return {
        "final_response": final_response
    }


def _build_markdown_response(expert_results: List[Dict[str, Any]], strategy: str) -> str:
    """
    构建结构化的 Markdown 响应

    Args:
        expert_results: 专家执行结果列表
        strategy: 执行策略

    Returns:
        str: Markdown 格式的最终响应
    """
    # 标题和引言
    markdown_parts = [
        "# 多专家协作结果\n",
        f"**执行策略**: {strategy}\n",
        "---\n"
    ]

    # 按专家类型分组结果
    expert_by_type = {}
    for result in expert_results:
        expert_type = result["expert_type"]
        if expert_type not in expert_by_type:
            expert_by_type[expert_type] = []
        expert_by_type[expert_type].append(result)

    # 每个专家的结果章节
    expert_titles = {
        "search": "## 搜索结果",
        "coder": "## 代码实现",
        "researcher": "## 研究报告",
        "analyzer": "## 分析结果",
        "writer": "## 文档内容",
        "planner": "## 执行计划"
    }

    for expert_type, results in expert_by_type.items():
        title = expert_titles.get(expert_type, f"## {expert_type.upper()} 结果")
        markdown_parts.append(f"{title}\n")

        for i, result in enumerate(results, 1):
            description = result.get("description", "")
            output = result.get("output", "")
            status = result.get("status", "")
            duration = result.get("duration_ms", 0) / 1000

            markdown_parts.append(f"### {i}. {description}\n")

            if status:
                status_emoji = "[OK]" if status == "completed" else "[FAIL]"
                markdown_parts.append(f"**状态**: {status_emoji} {status}\n")

            if duration > 0:
                markdown_parts.append(f"**耗时**: {duration:.2f} 秒\n")

            markdown_parts.append(f"\n{output}\n")

    # 汇总和结论
    markdown_parts.extend([
        "---\n",
        "## 汇总\n",
        f"本次协作共调用 {len(expert_results)} 个专家节点，",
        f"按顺序完成并生成了综合结果。\n",
        "> **提示**: 如需进一步优化或调整，请提出具体需求。"
    ])

    return "\n".join(markdown_parts)


# ============================================================================
# 路由逻辑 - 条件边
# ============================================================================

def check_direct_mode(state: AgentState) -> str:
    """
    检查是否是直接专家模式（已有任务列表）

    Args:
        state: 当前工作流状态

    Returns:
        str: "expert_dispatcher" 或 "commander"
    """
    task_list = state["task_list"]

    # 如果已经有任务列表，说明是直接专家模式
    if task_list and len(task_list) > 0:
        print(f"[CHECK] 直接专家模式：跳过指挥官，直接执行任务")
        return "expert_dispatcher"

    # 否则走指挥官模式拆解任务
    print(f"[CHECK] 指挥官模式：需要拆解任务")
    return "commander"


def route_commander(state: AgentState) -> str:
    """
    路由函数：决定下一步进入哪个节点

    路由规则：
    1. 如果 task_list 为空 → END（无任务）
    2. 如果当前索引 >= 任务列表长度 → aggregator（所有任务完成）
    3. 否则 → expert_dispatcher（执行下一个任务）

    Args:
        state: 当前工作流状态

    Returns:
        str: 目标节点名称
    """
    task_list = state["task_list"]
    current_index = state["current_task_index"]

    # 无任务
    if not task_list:
        print("[END] 无任务，流程结束")
        return END

    # 所有任务已完成
    if current_index >= len(task_list):
        print(f"[END] 所有任务完成，进入聚合器")
        return "aggregator"

    # 执行下一个任务
    print(f"[NEXT] 继续执行任务 [{current_index + 1}/{len(task_list)}]")
    return "expert_dispatcher"


# ============================================================================
# 构建工作流图
# ============================================================================

def create_commander_workflow() -> StateGraph:
    """
    构建指挥官工作流图

    工作流结构:
    1. START → check_direct_mode（检查是否直接专家模式）
    2. check_direct_mode → commander 或 expert_dispatcher
    3. commander → expert_dispatcher（通过路由）
    4. expert_dispatcher → expert_dispatcher（循环，直到所有任务完成）
    5. expert_dispatcher → aggregator（所有任务完成）
    6. aggregator → END

    Returns:
        StateGraph: 编译后的工作流图
    """
    # 初始化图
    workflow = StateGraph(AgentState)

    # 添加节点
    workflow.add_node("commander", commander_node)
    workflow.add_node("expert_dispatcher", expert_dispatcher_node)
    workflow.add_node("aggregator", aggregator_node)

    # 设置入口：先检查是否直接专家模式
    workflow.add_conditional_edges(
        START,
        check_direct_mode,
        {
            "commander": "commander",
            "expert_dispatcher": "expert_dispatcher"
        }
    )

    # 添加条件路由（从指挥官到专家分发器）
    workflow.add_conditional_edges(
        "commander",
        route_commander,
        {
            "expert_dispatcher": "expert_dispatcher",
            "aggregator": "aggregator",
            END: END
        }
    )

    # 添加条件路由（从专家分发器循环或到聚合器）
    workflow.add_conditional_edges(
        "expert_dispatcher",
        route_commander,
        {
            "expert_dispatcher": "expert_dispatcher",
            "aggregator": "aggregator",
            END: END
        }
    )

    # 聚合器到结束
    workflow.add_edge("aggregator", END)

    # 编译图（带调试信息）
    compiled_graph = workflow.compile()

    print("[OK] 指挥官工作流编译完成")
    print("   节点: commander, expert_dispatcher, aggregator")
    print("   路由: 条件路由（直接专家模式检查 + 任务状态检查）")

    return compiled_graph


# ============================================================================
# 编译并导出工作流
# ============================================================================

commander_graph = create_commander_workflow()


# ============================================================================
# 主执行函数（用于测试）
# ============================================================================

async def execute_commander_workflow(user_query: str) -> Dict[str, Any]:
    """
    执行指挥官工作流
    
    Args:
        user_query: 用户查询
    
    Returns:
        Dict[str, Any]: 执行结果
    """
    # 初始化状态
    initial_state: AgentState = {
        "messages": [HumanMessage(content=user_query)],
        "task_list": [],
        "current_task_index": 0,
        "strategy": "",
        "expert_results": [],
        "final_response": ""
    }
    
    print("="*60)
    print("[START] 开始执行指挥官工作流")
    print(f"   用户查询: {user_query}")
    print("="*60)
    
    # 执行工作流
    final_state = await commander_graph.ainvoke(initial_state)

    print("="*60)
    print("[DONE] 指挥官工作流执行完成")
    print("="*60)
    # 避免输出太长的响应可能导致编码问题，并过滤 emoji
    response_preview = final_state['final_response'][:200] + "..." if len(final_state['final_response']) > 200 else final_state['final_response']
    # 过滤非 ASCII 字符（避免 Windows GBK 编码错误）
    response_preview = ''.join(char for char in response_preview if ord(char) < 128)
    print(f"   最终响应预览: {response_preview}")
    print(f"   响应长度: {len(final_state['final_response'])} 字符")
    print(f"   执行的任务数: {len(final_state['expert_results'])}")

    return final_state


# ============================================================================
# 模块导出
# ============================================================================

__all__ = [
    "commander_graph",
    "execute_commander_workflow",
    "AgentState",
    "CommanderOutput",
    "SubTaskOutput"
]


# ============================================================================
# 测试入口
# ============================================================================

if __name__ == "__main__":
    import asyncio
    
    async def test():
        query = "帮我分析并优化这段 Python 代码，同时搜索相关的性能优化最佳实践"
        result = await execute_commander_workflow(query)
        print("\n" + "="*60)
        print("最终结果:")
        print("="*60)
        print(result['final_response'])
    
    asyncio.run(test())
