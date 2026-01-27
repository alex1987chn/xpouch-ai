"""
数据库初始化脚本
用于 PostgreSQL 数据库初始化，包括表创建、默认用户和默认专家数据
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import bcrypt

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent
os.chdir(project_root)
sys.path.insert(0, str(project_root))

from sqlmodel import SQLModel, Session, select
from models import User, CustomAgent, SystemExpert, UserRole

# 加载环境变量
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)


def hash_password(password: str) -> str:
    """使用 bcrypt 哈希密码"""
    # bcrypt 密码限制 72 字节，确保符合要求
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def create_tables(engine):
    """创建所有数据库表"""
    print("[Init] Creating all tables...")
    SQLModel.metadata.create_all(engine)
    print("[Init] Tables created successfully")


def create_default_admin(session: Session):
    """创建默认管理员账号"""
    print("[Init] Checking for default admin user...")

    # 检查是否已存在 admin 用户
    existing_admin = session.exec(
        select(User).where(User.username == "admin")
    ).first()

    if existing_admin:
        print("[Init] Admin user already exists, skipping...")
        return

    # 创建默认管理员
    default_admin = User(
        id="00000000-0000-0000-0000-000000000000",
        username="admin",
        plan="Maestro",
        password_hash=hash_password("admin123"),
        auth_provider="system",
        is_verified=True,
    )

    session.add(default_admin)
    session.commit()
    print("[Init] Default admin user created (username: admin, password: admin123)")


def create_default_assistant(session: Session):
    """创建默认助手"""
    print("[Init] Checking for default assistant...")

    # 检查是否已存在默认助手
    existing_assistant = session.exec(
        select(CustomAgent).where(CustomAgent.name == "通用助手")
    ).first()

    if existing_assistant:
        print("[Init] Default assistant already exists, skipping...")
        return

    # 创建默认助手
    default_assistant = CustomAgent(
        id="assistant",
        name="通用助手",
        description="我是你的全能AI助手，可以回答问题、提供建议和帮助解决问题。",
        system_prompt="你是一个友好、专业、乐于助人的AI助手。请用清晰、简洁、有逻辑的方式回答用户的问题。如果不确定，请诚实地说不知道。",
        model_id="deepseek-chat",
        is_default=True,
        is_public=True,
        user_id="00000000-0000-0000-0000-000000000000",  # 系统账号
    )

    session.add(default_assistant)
    session.commit()
    print("[Init] Default assistant created successfully")


def init_system_experts(session: Session):
    """初始化系统专家数据（从硬编码 Prompt 写入数据库）"""
    from agents.experts import EXPERT_PROMPTS

    print("[Init] Checking for system experts...")

    # 检查是否已有专家数据
    existing_experts = session.exec(select(SystemExpert)).all()

    if existing_experts:
        print(f"[Init] {len(existing_experts)} system experts already exist, skipping initialization...")
        return

    # 定义专家配置
    expert_configs = [
        {
            "expert_key": "search",
            "name": "搜索专家",
            "system_prompt": EXPERT_PROMPTS["search"],
            "model": "gpt-4o",
            "temperature": 0.3
        },
        {
            "expert_key": "coder",
            "name": "编程专家",
            "system_prompt": EXPERT_PROMPTS["coder"],
            "model": "gpt-4o",
            "temperature": 0.2
        },
        {
            "expert_key": "researcher",
            "name": "研究专家",
            "system_prompt": EXPERT_PROMPTS["researcher"],
            "model": "gpt-4o",
            "temperature": 0.4
        },
        {
            "expert_key": "analyzer",
            "name": "分析专家",
            "system_prompt": EXPERT_PROMPTS["analyzer"],
            "model": "gpt-4o",
            "temperature": 0.3
        },
        {
            "expert_key": "writer",
            "name": "写作专家",
            "system_prompt": EXPERT_PROMPTS["writer"],
            "model": "gpt-4o",
            "temperature": 0.7
        },
        {
            "expert_key": "planner",
            "name": "规划专家",
            "system_prompt": EXPERT_PROMPTS["planner"],
            "model": "gpt-4o",
            "temperature": 0.5
        },
        {
            "expert_key": "image_analyzer",
            "name": "图片分析专家",
            "system_prompt": EXPERT_PROMPTS["image_analyzer"],
            "model": "gpt-4o",
            "temperature": 0.3
        }
    ]

    # 创建专家记录
    for config in expert_configs:
        expert = SystemExpert(**config)
        session.add(expert)
        print(f"[Init] Created expert: {config['name']}")

    session.commit()
    print(f"[Init] Initialized {len(expert_configs)} system experts")


def promote_user_to_admin(email: str):
    """
    将指定用户升级为管理员

    Args:
        email: 用户邮箱地址

    使用示例：
        from scripts.init_db import promote_user_to_admin
        promote_user_to_admin("admin@example.com")
    """
    from database import get_session

    session_gen = get_session()
    session = next(session_gen)

    try:
        # 查找用户
        user = session.exec(
            select(User).where(User.email == email)
        ).first()

        if not user:
            print(f"[Promote] User with email '{email}' not found!")
            return False

        # 升级为管理员
        user.role = UserRole.ADMIN
        session.add(user)
        session.commit()

        print(f"[Promote] Successfully promoted user '{user.username}' to admin!")
        return True

    except Exception as e:
        print(f"[Promote] Error: {e}")
        session.rollback()
        return False

    finally:
        session.close()



def init_database():
    """主初始化函数"""
    from database import engine, get_session

    print("[Init] Starting database initialization...")
    print(f"[Init] DATABASE_URL: {os.getenv('DATABASE_URL', 'Not set')}")

    # 创建表
    create_tables(engine)

    # 创建会话
    session_gen = get_session()
    session = next(session_gen)

    try:
        # 创建默认管理员
        create_default_admin(session)

        # 创建默认助手
        create_default_assistant(session)

        # 初始化系统专家数据
        init_system_experts(session)

        print("[Init] Database initialization completed successfully!")
        print("[Init]")
        print("[Init] ======================================")
        print("[Init] Default Credentials:")
        print("[Init]   Username: admin")
        print("[Init]   Password: admin123")
        print("[Init]   (Please change in production!)")
        print("[Init]")
        print("[Init] To promote a user to admin, run:")
        print("[Init]   python -c \"from scripts.init_db import promote_user_to_admin; promote_user_to_admin('your-email@example.com')\"")
        print("[Init] ======================================")

    except Exception as e:
        print(f"[Init] Error during initialization: {e}")
        session.rollback()
        raise

    finally:
        session.close()


if __name__ == "__main__":
    init_database()


