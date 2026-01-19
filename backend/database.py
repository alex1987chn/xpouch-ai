from sqlmodel import SQLModel, create_engine, Session
from models import Conversation, Message, User, CustomAgent
import os

# 确保 data 目录存在
os.makedirs("data", exist_ok=True)

# 生产环境建议使用 Docker 挂载目录
sqlite_file_name = "data/database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
