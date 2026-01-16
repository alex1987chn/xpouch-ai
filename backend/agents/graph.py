from typing import TypedDict, Annotated, List, Union, Dict, Any, Literal
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
import os
from dotenv import load_dotenv
import pathlib

# Load .env from the backend root directory (parent of this file's directory)
env_path = pathlib.Path(__file__).parent.parent / ".env"
print(f"Graph loading .env from: {env_path}, exists: {env_path.exists()}")
load_dotenv(dotenv_path=env_path)

# 定义 Agent 状态
class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    current_agent: str
    context: Dict[str, Any]

# 初始化模型
api_key = os.getenv("OPENAI_API_KEY")
base_url = os.getenv("OPENAI_BASE_URL")
model_name = os.getenv("MODEL_NAME", "gpt-4o")

# DeepSeek fallback/override
if not api_key:
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    if deepseek_key:
        print("Using DeepSeek API Key configuration")
        api_key = deepseek_key
        # Update default base_url to include /v1 if not specified
        base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
        model_name = os.getenv("MODEL_NAME", "deepseek-chat")

if not api_key:
    print("WARNING: No API key found. Please set OPENAI_API_KEY or DEEPSEEK_API_KEY in backend/.env")

llm = ChatOpenAI(
    model=model_name,
    temperature=0.7,
    api_key=api_key,
    base_url=base_url,
    streaming=True
)

# 1. 预处理节点 (意图识别)
async def preprocess_node(state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    
    # 简单的意图识别 prompt
    system_prompt = """你是一个意图识别专家。请分析用户的输入，并将其分类为以下几类之一：
    - code_help: 寻求编程帮助、代码解释、bug修复
    - creative_writing: 寻求创意写作、故事创作、文案撰写
    - analysis: 数据分析、逻辑推理、深度思考
    - question_answering: 一般性问答、知识查询
    - chat: 闲聊或其他
    
    请只输出分类名称，不要输出其他内容。
    """
    
    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=last_message.content)
    ])
    
    intent = response.content.strip()
    
    # 验证输出是否在合法列表内，否则默认为 chat
    valid_intents = ["code_help", "creative_writing", "analysis", "question_answering", "chat"]
    if intent not in valid_intents:
        intent = "chat"
        
    return {"current_agent": intent}

# 2. 各个专门的 Agent 节点逻辑
async def chat_node(state: AgentState):
    return {"messages": [await llm.ainvoke(state["messages"])]}

async def code_help_node(state: AgentState):
    system_msg = SystemMessage(content="你是一个专业的编程助手。请提供清晰、高效且遵循最佳实践的代码解决方案。")
    messages = [system_msg] + state["messages"]
    return {"messages": [await llm.ainvoke(messages)]}

async def creative_writing_node(state: AgentState):
    system_msg = SystemMessage(content="你是一个富有创造力的作家。请用生动、优美的语言进行创作。")
    messages = [system_msg] + state["messages"]
    return {"messages": [await llm.ainvoke(messages)]}

async def analysis_node(state: AgentState):
    system_msg = SystemMessage(content="你是一个敏锐的数据分析师。请逻辑严密地分析问题，提供深度见解。")
    messages = [system_msg] + state["messages"]
    return {"messages": [await llm.ainvoke(messages)]}

async def question_answering_node(state: AgentState):
    system_msg = SystemMessage(content="你是一个知识渊博的百科全书。请准确、简洁地回答用户的问题。")
    messages = [system_msg] + state["messages"]
    return {"messages": [await llm.ainvoke(messages)]}

# 构建图
workflow = StateGraph(AgentState)

# 添加节点
workflow.add_node("preprocess", preprocess_node)
workflow.add_node("chat", chat_node)
workflow.add_node("code_help", code_help_node)
workflow.add_node("creative_writing", creative_writing_node)
workflow.add_node("analysis", analysis_node)
workflow.add_node("question_answering", question_answering_node)

# 设置入口 - 临时改为直接进入 chat，跳过 preprocess 以排查延迟问题
# workflow.add_edge(START, "preprocess")
workflow.add_edge(START, "chat")

# 条件路由逻辑
def route_based_on_intent(state: AgentState):
    return state["current_agent"]

# 添加条件边 - 暂时注释掉
# workflow.add_conditional_edges(
#     "preprocess",
#     route_based_on_intent,
#     {
#         "chat": "chat",
#         "code_help": "code_help",
#         "creative_writing": "creative_writing",
#         "analysis": "analysis",
#         "question_answering": "question_answering"
#     }
# )

# 所有节点汇聚到结束
workflow.add_edge("chat", END)
workflow.add_edge("code_help", END)
workflow.add_edge("creative_writing", END)
workflow.add_edge("analysis", END)
workflow.add_edge("question_answering", END)

# 编译
agent_graph = workflow.compile()
