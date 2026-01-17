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

from agents.graph import agent_graph
from models import Conversation, Message, User
from database import create_db_and_tables, get_session

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

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
    initial_state = {
        "messages": langchain_messages,
        "current_agent": request.agentId,
        "context": {}
    }

    # 4. 流式响应处理
    if request.stream:
        async def event_generator():
            full_response = ""
            try:
                async for event in agent_graph.astream_events(
                    initial_state,
                    version="v2"
                ):
                    kind = event["event"]

                    if kind == "on_chat_model_stream":
                        content = event["data"]["chunk"].content
                        if content:
                            full_response += content
                            yield f"data: {json.dumps({'content': content, 'conversationId': conversation_id})}\n\n"

            except Exception as e:
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
        result = await agent_graph.ainvoke(initial_state)
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

if __name__ == "__main__":
    # Local dev defaults to 3002, Docker uses PORT env var (e.g. 3000)
    port = int(os.getenv("PORT", 3002))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
