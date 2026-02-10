"""数据库表初始化脚本

使用方法（从项目根目录运行）:
    python -m backend.scripts.init_db

或设置 PYTHONPATH:
    PYTHONPATH=/path/to/project:$PYTHONPATH python backend/scripts/init_db.py
"""
from backend.database import create_db_and_tables

if __name__ == "__main__":
    print("[InitDB] 正在检查和创建数据库表...")
    create_db_and_tables()
    print("[InitDB] 数据库表初始化完成！")
