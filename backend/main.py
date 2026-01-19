import pathlib
from dotenv import load_dotenv
import os

# >>> RELOADED main.py: Starting initialization...

# Load .env from the same directory as this file
env_path = pathlib.Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

from fastapi import FastAPI, Request, Response, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import json
import uvicorn
import os
from langchain_core.messages import HumanMessage, AIMessage
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload # Import selectinload
from contextlib import asynccontextmanager
from datetime import datetime
import uuid

from agents.graph import commander_graph
from agents.experts import EXPERT_FUNCTIONS
from models import Conversation, Message, User, TaskSession, SubTask
from database import create_db_and_tables, get_session

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

# 添加请求日志中间件
@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"[MIDDLEWARE] 收到请求: {request.method} {request.url.path}")
    print(f"[MIDDLEWARE] Headers: {dict(request.headers)}")
    response = await call_next(request)
    return response

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Temporarily allow all for debugging
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessageDTO(BaseModel):
    role: str
    content: str
    id: Optional[str] = None
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessageDTO]
    conversationId: Optional[str] = None
    agentId: Optional[str] = "assistant"
    stream: Optional[bool] = True


class ChatInvokeRequest(BaseModel):
    """双模路由请求模型"""
    message: str
    mode: str = "auto"  # "auto" 或 "direct"
    agent_id: Optional[str] = None  # direct 模式下必填
    thread_id: Optional[str] = None  # LangSmith 线程 ID

class UpdateUserRequest(BaseModel):
    username: Optional[str] = None
    avatar: Optional[str] = None
    plan: Optional[str] = None

# --- Dependency: Current User ---
async def get_current_user(request: Request, session: Session = Depends(get_session)):
    user_id = request.headers.get("X-User-ID")
    if not user_id:
        # Fallback for dev/testing without header
        user_id = "default-user"
    
    user = session.get(User, user_id)
    if not user:
        # Auto-register new user
        user = User(id=user_id, username=f"User-{user_id[:4]}")
        session.add(user)
        session.commit()
        session.refresh(user)
    
    return user

# --- API Endpoints ---

@app.get("/")
async def root():
    return {"status": "ok", "message": "XPouch AI Backend (Python + SQLModel) is running"}

# 用户信息接口
@app.get("/api/user/me")
async def get_user_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.put("/api/user/me")
async def update_user_me(request: UpdateUserRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if request.username is not None:
        current_user.username = request.username
    if request.avatar is not None:
        current_user.avatar = request.avatar
    if request.plan is not None:
        current_user.plan = request.plan
        
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user

# 获取所有会话列表 (Filtered by User)
@app.get("/api/conversations")
async def get_conversations(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    statement = select(Conversation).where(Conversation.user_id == current_user.id).order_by(Conversation.updated_at.desc())
    conversations = session.exec(statement).all()
    return conversations

# 获取单个会话详情 (Filtered by User)
@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    statement = select(Conversation).where(Conversation.id == conversation_id).options(selectinload(Conversation.messages))
    conversation = session.exec(statement).first()

    if not conversation or conversation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation

# 删除会话 (Filtered by User)
@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    conversation = session.get(Conversation, conversation_id)
    if not conversation or conversation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    session.delete(conversation)
    session.commit()
    return {"ok": True}

# 聊天接口
@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    # 1. 确定 Conversation ID
    conversation_id = request.conversationId
    conversation = None
    
    if conversation_id:
        conversation = session.get(Conversation, conversation_id)
        if conversation and conversation.user_id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized")
        
    if not conversation:
        # 如果没有ID或找不到，创建新会话
        conversation_id = str(uuid.uuid4())
        conversation = Conversation(
            id=conversation_id,
            title=request.message[:30] + "..." if len(request.message) > 30 else request.message,
            agent_id=request.agentId,
            user_id=current_user.id, # 绑定当前用户
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        session.add(conversation)
        session.commit()
        session.refresh(conversation)

    # 2. 保存用户消息到数据库
    user_msg_db = Message(
        conversation_id=conversation_id,
        role="user",
        content=request.message,
        timestamp=datetime.now()
    )
    session.add(user_msg_db)
    session.commit()

    # 3. 准备 LangGraph 上下文
    statement = select(Message).where(Message.conversation_id == conversation_id).order_by(Message.timestamp)
    db_messages = session.exec(statement).all()
    
    langchain_messages = []
    for msg in db_messages:
        if msg.role == "user":
            langchain_messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            langchain_messages.append(AIMessage(content=msg.content))
            
    # 构建状态
    # 直接专家模式：如果 agentId 是专家类型，直接创建任务
    expert_types = ["search", "coder", "researcher", "analyzer", "writer", "planner", "image_analyzer"]
    print(f"[MAIN] 检查 agentId: {request.agentId}, expert_types: {expert_types}")
    if request.agentId in expert_types:
        print(f"[MAIN] 检测到直接专家模式: {request.agentId}")
        # 直接创建单个任务列表
        task_list = [{
            "id": str(uuid.uuid4()),
            "expert_type": request.agentId,
            "description": request.message,
            "input_data": {},
            "priority": 0,
            "status": "pending",
            "output_result": None,
            "started_at": None,
            "completed_at": None,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }]
        print(f"[MAIN] 创建任务列表: {len(task_list)} 个任务")
        print(f"[MAIN] 任务详情: {task_list[0]['description']}")

        initial_state = {
            "messages": langchain_messages,
            "current_agent": request.agentId,
            "task_list": task_list,
            "current_task_index": 0,
            "strategy": f"直接专家模式 - {request.agentId}",
            "expert_results": [],
            "final_response": ""
        }
        print(f"[MAIN] initial_state task_list 长度: {len(initial_state['task_list'])}")
    else:
        # 指挥官模式：通过 LLM 拆解任务
        initial_state = {
            "messages": langchain_messages,
            "current_agent": request.agentId,
            "task_list": [],
            "current_task_index": 0,
            "strategy": "",
            "expert_results": [],
            "final_response": "",
            "context": {}
        }

    # 4. 流式响应处理
    if request.stream:
        async def event_generator():
            full_response = ""
            event_count = 0
            try:
                print(f"[STREAM] 开始流式处理...")
                async for event in commander_graph.astream_events(
                    initial_state,
                    version="v2"
                ):
                    event_count += 1
                    kind = event["event"]
                    name = event.get("name", "")

                    # 每收到100个事件打印一次进度
                    if event_count % 100 == 0:
                        print(f"[STREAM] 已处理 {event_count} 个事件，当前: {kind} - {name}")

                    # 捕获专家节点开始执行（expert_type: expert_name）
                    if kind == "on_chain_start" and name in ["search", "coder", "researcher", "analyzer", "writer", "planner", "image_analyzer"]:
                        yield f"data: {json.dumps({'activeExpert': name, 'conversationId': conversation_id})}\n\n"
                        print(f"[STREAM] 专家 {name} 开始执行")

                    # 捕获专家节点执行结束
                    if kind == "on_chain_end" and name in ["search", "coder", "researcher", "analyzer", "writer", "planner", "image_analyzer"]:
                        print(f"[STREAM] 专家 {name} 结束执行，检查 output_data...")
                        # 检查是否生成了 artifact
                        output_data = event["data"]["output"]
                        print(f"[STREAM] output_data 类型: {type(output_data)}, 包含 artifact: {isinstance(output_data, dict) and 'artifact' in output_data}")

                        if isinstance(output_data, dict) and "artifact" in output_data:
                            artifact = output_data["artifact"]
                            print(f"[STREAM] 检测到 artifact: {artifact['type']}")
                            print(f"[STREAM] artifact content 长度: {len(artifact.get('content', ''))}")

                            # 推送 artifact_update 事件
                            yield f"data: {json.dumps({'artifact': artifact, 'conversationId': conversation_id})}\n\n"
                        yield f"data: {json.dumps({'expertCompleted': name, 'conversationId': conversation_id})}\n\n"
                        print(f"[STREAM] 专家 {name} 执行完成")

                    # 捕获 expert_dispatcher 节点执行结束（用于直接专家模式）
                    if kind == "on_chain_end" and name == "expert_dispatcher":
                        print(f"[STREAM] expert_dispatcher 结束执行，检查 output_data...")
                        # 检查是否生成了 artifact
                        output_data = event["data"]["output"]
                        print(f"[STREAM] output_data 类型: {type(output_data)}, 包含 artifact: {isinstance(output_data, dict) and 'artifact' in output_data}")

                        if isinstance(output_data, dict) and "artifact" in output_data:
                            artifact = output_data["artifact"]
                            print(f"[STREAM] 从 expert_dispatcher 检测到 artifact: {artifact['type']}")
                            print(f"[STREAM] artifact content 长度: {len(artifact.get('content', ''))}")

                            # 推送 artifact_update 事件
                            yield f"data: {json.dumps({'artifact': artifact, 'conversationId': conversation_id})}\n\n"
                        print(f"[STREAM] expert_dispatcher 执行完成")

                    # 捕获 LLM 流式输出
                    if kind == "on_chat_model_stream":
                        content = event["data"]["chunk"].content
                        if content:
                            full_response += content
                            yield f"data: {json.dumps({'content': content, 'conversationId': conversation_id})}\n\n"

                print(f"[STREAM] 流式处理完成，共处理 {event_count} 个事件")
                print(f"[STREAM] total_response 长度: {len(full_response)}")

            except Exception as e:
                print(f"[STREAM] 错误: {e}")
                import traceback
                traceback.print_exc()
                error_msg = json.dumps({"error": str(e)})
                yield f"data: {error_msg}\n\n"

            # 5. 流式结束后，保存 AI 回复到数据库
            if full_response:
                ai_msg_db = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                    timestamp=datetime.now()
                )
                from database import engine
                with Session(engine) as inner_session:
                    inner_session.add(ai_msg_db)
                    # 更新会话时间
                    conv = inner_session.get(Conversation, conversation_id)
                    if conv:
                        conv.updated_at = datetime.now()
                        inner_session.add(conv)
                    inner_session.commit()

            yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    else:
        # 非流式
        result = await commander_graph.ainvoke(initial_state)
        last_message = result["messages"][-1]
        
        # 保存 AI 回复
        ai_msg_db = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=last_message.content,
            timestamp=datetime.now()
        )
        session.add(ai_msg_db)
        conversation.updated_at = datetime.now()
        session.add(conversation)
        session.commit()
        
        return {
            "role": "assistant",
            "content": last_message.content,
            "conversationId": conversation_id
        }


# ============================================================================
# 双模路由：Auto 模式（完整工作流）vs Direct 模式（单专家执行）
# ============================================================================

@app.post("/api/v1/chat/invoke")
async def chat_invoke_endpoint(
    request: ChatInvokeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    双模路由端点：支持 Auto 和 Direct 两种执行模式

    Auto 模式：完整的多专家协作流程（commander_graph）
    - 指挥官拆解任务
    - 多专家顺序执行
    - 结果聚合

    Direct 模式：直接调用单个专家
    - 跳过指挥官和聚合器
    - 直接执行指定专家
    - 适用于简单任务

    两种模式都会：
    - 保存结果到 TaskSession 数据库
    - 生成 thread_id 用于 LangSmith 追踪
    """
    print(f"[INVOKE] 模式: {request.mode}, Agent: {request.agent_id}")

    # 1. 模式验证
    if request.mode not in ["auto", "direct"]:
        raise HTTPException(
            status_code=400,
            detail=f"无效的执行模式: {request.mode}，必须是 'auto' 或 'direct'"
        )

    # 2. Direct 模式需要 agent_id
    if request.mode == "direct" and not request.agent_id:
        raise HTTPException(
            status_code=400,
            detail="Direct 模式需要指定 agent_id"
        )

    # 3. 验证 agent_id 是否在 EXPERT_FUNCTIONS 中
    if request.mode == "direct":
        if request.agent_id not in EXPERT_FUNCTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"未知的专家类型: {request.agent_id}，可用专家: {list(EXPERT_FUNCTIONS.keys())}"
            )

    # 4. 创建 TaskSession 记录（用于数据库持久化）
    thread_id = request.thread_id or str(uuid.uuid4())
    task_session = TaskSession(
        session_id=thread_id,
        user_query=request.message,
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    session.add(task_session)
    session.commit()
    session.refresh(task_session)

    # 5. 导入 LLM（需要从 agents.graph 重新导入）
    import os
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage, AIMessage

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    model_name = os.getenv("MODEL_NAME", "deepseek-chat")

    llm = ChatOpenAI(
        model=model_name,
        temperature=0.7,
        api_key=api_key,
        base_url=base_url,
        streaming=True
    )

    # 6. 根据模式执行
    try:
        if request.mode == "auto":
            # ========================================================
            # Auto 模式：完整的多专家协作流程
            # ========================================================
            print("[AUTO MODE] 启动完整工作流")

            # 构建初始状态
            initial_state = {
                "messages": [HumanMessage(content=request.message)],
                "task_list": [],
                "current_task_index": 0,
                "strategy": "",
                "expert_results": [],
                "final_response": ""
            }

            # 执行指挥官工作流
            final_state = await commander_graph.ainvoke(
                initial_state,
                config={"configurable": {"thread_id": thread_id}}
            )

            # 保存 SubTask 到数据库
            for subtask in final_state["task_list"]:
                # task_list 现在是字典列表，直接使用字典字段
                db_subtask = SubTask(
                    id=subtask["id"],
                    expert_type=subtask["expert_type"],
                    description=subtask["description"],
                    input_data=subtask["input_data"],
                    status=subtask["status"],
                    output_result=subtask["output_result"],
                    started_at=subtask.get("started_at"),
                    completed_at=subtask.get("completed_at"),
                    created_at=subtask["created_at"],
                    updated_at=subtask["updated_at"],
                    task_session_id=task_session.session_id
                )
                session.add(db_subtask)

            # 更新 TaskSession
            task_session.final_response = final_state["final_response"]
            task_session.status = "completed"
            task_session.completed_at = datetime.now()
            task_session.updated_at = datetime.now()

            session.commit()

            print(f"[AUTO MODE] 完成，执行了 {len(final_state['expert_results'])} 个专家")

            return {
                "mode": "auto",
                "thread_id": thread_id,
                "session_id": task_session.session_id,
                "user_query": request.message,
                "strategy": final_state["strategy"],
                "final_response": final_state["final_response"],
                "expert_results": final_state["expert_results"],
                "sub_tasks_count": len(final_state["task_list"]),
                "status": "completed"
            }

        else:
            # ========================================================
            # Direct 模式：直接调用单个专家
            # ========================================================
            print(f"[DIRECT MODE] 直接调用专家: {request.agent_id}")

            # 构建状态（模拟单个任务）
            subtask_dict = {
                "id": str(uuid.uuid4()),
                "expert_type": request.agent_id,
                "description": request.message,
                "input_data": {},
                "status": "pending",
                "created_at": datetime.now(),
                "updated_at": datetime.now()
            }

            initial_state = {
                "messages": [HumanMessage(content=request.message)],
                "task_list": [subtask_dict],
                "current_task_index": 0,
                "strategy": f"直接模式: {request.agent_id} 专家",
                "expert_results": [],
                "final_response": ""
            }

            # 调用原子化专家函数
            expert_func = EXPERT_FUNCTIONS[request.agent_id]
            result = await expert_func(initial_state, llm)

            # 保存 SubTask 到数据库
            db_subtask = SubTask(
                id=subtask_dict["id"],
                expert_type=subtask_dict["expert_type"],
                description=subtask_dict["description"],
                input_data=subtask_dict["input_data"],
                status=result.get("status", "completed"),
                output_result={"content": result.get("output_result", "")},
                started_at=result.get("started_at"),
                completed_at=result.get("completed_at"),
                created_at=subtask_dict["created_at"],
                updated_at=subtask_dict["updated_at"],
                task_session_id=task_session.session_id
            )
            session.add(db_subtask)

            # 构建专家结果
            expert_result = {
                "task_id": subtask_dict["id"],
                "expert_type": request.agent_id,
                "description": request.message,
                "output": result.get("output_result", ""),
                "status": result.get("status", "unknown"),
                "started_at": result.get("started_at"),
                "completed_at": result.get("completed_at"),
                "duration_ms": result.get("duration_ms", 0)
            }

            # 更新 TaskSession
            task_session.final_response = result.get("output_result", "")
            task_session.status = "completed"
            task_session.completed_at = datetime.now()
            task_session.updated_at = datetime.now()

            session.commit()

            print(f"[DIRECT MODE] 完成，专家: {request.agent_id}")

            return {
                "mode": "direct",
                "thread_id": thread_id,
                "session_id": task_session.session_id,
                "user_query": request.message,
                "expert_type": request.agent_id,
                "final_response": result.get("output_result", ""),
                "expert_results": [expert_result],
                "sub_tasks_count": 1,
                "status": "completed"
            }

    except Exception as e:
        # 错误处理：更新 TaskSession 状态
        task_session.status = "failed"
        task_session.final_response = f"执行失败: {str(e)}"
        task_session.updated_at = datetime.now()
        session.commit()

        print(f"[ERROR] 执行失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"执行失败: {str(e)}"
        )


if __name__ == "__main__":
    # Local dev defaults to 3002, Docker uses PORT env var (e.g. 3000)
    port = int(os.getenv("PORT", 3002))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
