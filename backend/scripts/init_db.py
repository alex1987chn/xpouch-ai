"""数据库表初始化脚本"""
import sys
from pathlib import Path

# 确保 backend 目录在路径中
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from database import create_db_and_tables

if __name__ == "__main__":
    print("[InitDB] 正在检查和创建数据库表...")
    create_db_and_tables()
    print("[InitDB] 数据库表初始化完成！")
