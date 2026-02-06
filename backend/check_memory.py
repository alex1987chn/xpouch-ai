"""检查数据库中的记忆记录"""
from sqlmodel import Session, select
from database import engine
from models.memory import UserMemory

with Session(engine) as session:
    # 查询所有记忆
    statement = select(UserMemory).order_by(UserMemory.created_at.desc()).limit(10)
    results = session.exec(statement).all()
    
    if not results:
        print('数据库中没有记忆记录')
    else:
        print(f'找到 {len(results)} 条记忆记录：\n')
        for m in results:
            print(f'ID: {m.id}')
            print(f'User: {m.user_id}')
            print(f'Content: {m.content}')
            print(f'Type: {m.memory_type}')
            print(f'Created: {m.created_at}')
            print('-' * 50)
