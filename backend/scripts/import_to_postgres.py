"""
从JSON导入数据到PostgreSQL
用于从SQLite迁移数据到PostgreSQL
"""
import json
import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
import sys

# 添加项目根目录到Python路径
project_root = Path(__file__).parent.parent.parent
os.chdir(project_root)
sys.path.insert(0, str(project_root / "backend"))

from sqlmodel import SQLModel, Session, create_engine, select, text
from models import User, CustomAgent, Conversation, Message


def import_data_to_postgres(json_file: str, database_url: str):
    """从JSON导入数据到PostgreSQL"""
    print(f"[Import] Reading data from: {json_file}")
    print(f"[Import] Database URL: {database_url}")

    # 读取JSON数据
    with open(json_file, 'r', encoding='utf-8') as f:
        export_data = json.load(f)

    # 显示元数据
    metadata = export_data.get("_metadata", {})
    print(f"[Import] Exported at: {metadata.get('exported_at', 'N/A')}")
    print(f"[Import] Source DB: {metadata.get('source_db', 'N/A')}")
    print(f"[Import] Tables count: {metadata.get('tables_count', 0)}")

    # 创建PostgreSQL引擎
    engine = create_engine(database_url)
    session = Session(engine)

    try:
        # 导入users表
        if "user" in export_data:
            print(f"[Import] Importing users...")
            users_data = export_data["user"]

            # 先删除所有现有用户（除了系统admin）
            existing_admins = session.exec(
                select(User).where(User.username == "admin")
            ).all()
            admin_ids = {admin.id for admin in existing_admins}

            # 删除非admin用户
            if admin_ids:
                # 使用ANY语法处理IN子句
                admin_list = list(admin_ids)
                placeholders = ','.join([f"'{uid}'" for uid in admin_list])
                session.execute(
                    text(f'DELETE FROM "user" WHERE id NOT IN ({placeholders})')
                )
            session.commit()

            # 导入用户数据
            imported_count = 0
            for user_data in users_data:
                try:
                    user = User(**user_data)
                    session.add(user)
                    imported_count += 1
                except Exception as e:
                    print(f"[Import] Error importing user {user_data.get('id')}: {e}")

            session.commit()
            print(f"[Import] Users imported: {imported_count}")

        # 导入customagent表
        if "customagent" in export_data:
            print(f"[Import] Importing custom agents...")
            agents_data = export_data["customagent"]

            # 删除所有现有agent（除了默认助手）
            existing_default = session.exec(
                select(CustomAgent).where(CustomAgent.is_default == True)
            ).all()
            default_ids = {agent.id for agent in existing_default}

            # 删除非默认agent
            if default_ids:
                default_list = list(default_ids)
                placeholders = ','.join([f"'{aid}'" for aid in default_list])
                session.execute(
                    text(f'DELETE FROM customagent WHERE id NOT IN ({placeholders})')
                )
            session.commit()

            # 导入agent数据
            imported_count = 0
            for agent_data in agents_data:
                try:
                    # 处理日期字段
                    for field in ['created_at', 'updated_at']:
                        if field in agent_data and agent_data[field]:
                            try:
                                agent_data[field] = datetime.fromisoformat(agent_data[field].replace('Z', '+00:00'))
                            except:
                                pass

                    agent = CustomAgent(**agent_data)
                    session.add(agent)
                    imported_count += 1
                except Exception as e:
                    print(f"[Import] Error importing agent {agent_data.get('id')}: {e}")

            session.commit()
            print(f"[Import] Custom agents imported: {imported_count}")

        # 导入conversation表
        if "conversation" in export_data:
            print(f"[Import] Importing conversations...")
            convs_data = export_data["conversation"]

            # 删除所有现有对话
            session.execute(text("DELETE FROM conversation"))
            session.commit()

            # 导入对话数据
            imported_count = 0
            for conv_data in convs_data:
                try:
                    # 处理日期字段
                    for field in ['created_at', 'updated_at']:
                        if field in conv_data and conv_data[field]:
                            try:
                                conv_data[field] = datetime.fromisoformat(conv_data[field].replace('Z', '+00:00'))
                            except:
                                pass

                    conversation = Conversation(**conv_data)
                    session.add(conversation)
                    imported_count += 1
                except Exception as e:
                    print(f"[Import] Error importing conversation {conv_data.get('id')}: {e}")

            session.commit()
            print(f"[Import] Conversations imported: {imported_count}")

        # 导入message表
        if "message" in export_data:
            print(f"[Import] Importing messages...")
            msgs_data = export_data["message"]

            # 删除所有现有消息
            session.execute(text("DELETE FROM message"))
            session.commit()

            # 导入消息数据
            imported_count = 0
            for msg_data in msgs_data:
                try:
                    # 处理日期字段
                    for field in ['created_at']:
                        if field in msg_data and msg_data[field]:
                            try:
                                msg_data[field] = datetime.fromisoformat(msg_data[field].replace('Z', '+00:00'))
                            except:
                                pass

                    message = Message(**msg_data)
                    session.add(message)
                    imported_count += 1
                except Exception as e:
                    print(f"[Import] Error importing message {msg_data.get('id')}: {e}")

            session.commit()
            print(f"[Import] Messages imported: {imported_count}")

        session.commit()
        print(f"[Import] Data import completed successfully!")

    except Exception as e:
        print(f"[Import] Error during import: {e}")
        session.rollback()
        raise

    finally:
        session.close()


if __name__ == "__main__":
    # 加载环境变量
    env_path = Path(__file__).parent.parent / ".env"
    load_dotenv(dotenv_path=env_path, override=True)

    # 数据库URL
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("[Import] Error: DATABASE_URL not found in .env file")
        sys.exit(1)

    # JSON文件路径
    json_file_path = os.path.join(os.path.dirname(__file__), "export_data.json")

    import_data_to_postgres(json_file_path, database_url)
