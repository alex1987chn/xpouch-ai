"""数据库表初始化脚本

使用方法（从 backend 目录运行）:
    python scripts/init_db.py

或设置 PYTHONPATH:
    PYTHONPATH=/path/to/backend:$PYTHONPATH python scripts/init_db.py
"""
from database import create_db_and_tables

if __name__ == "__main__":
    print("[InitDB] 正在检查和创建数据库表...")
    create_db_and_tables()
    print("[InitDB] 数据库表初始化完成！")
