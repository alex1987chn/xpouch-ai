"""检查指定对话的详情"""
from sqlmodel import Session, select
from database import engine
from models import Thread, Message

thread_id = "b7a37aff-a2e3-4bf6-9ecc-86bbbe01fd48"

with Session(engine) as session:
    # 查询对话
    thread = session.get(Thread, thread_id)
    if not thread:
        print(f'对话 {thread_id} 不存在')
    else:
        print(f'对话信息：')
        print(f'  Title: {thread.title}')
        print(f'  Agent Type: {thread.agent_type}')
        print(f'  Agent ID: {thread.agent_id}')
        print(f'  Created: {thread.created_at}')
        print()
        
        # 查询消息
        statement = select(Message).where(Message.thread_id == thread_id).order_by(Message.timestamp)
        messages = session.exec(statement).all()
        
        print(f'消息记录 ({len(messages)} 条)：')
        print('-' * 60)
        for m in messages:
            role = m.role.upper()
            content = m.content[:100] + '...' if len(m.content) > 100 else m.content
            # 移除可能导致编码问题的字符
            content = content.encode('ascii', 'ignore').decode('ascii')
            print(f'[{role}] {content}')
            print()
