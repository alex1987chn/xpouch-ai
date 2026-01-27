"""
从SQLite导出数据到JSON文件
用于迁移到PostgreSQL
"""
import sqlite3
import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any


def export_table_data(conn: sqlite3.Connection, table_name: str) -> List[Dict[str, Any]]:
    """导出单个表的数据"""
    cursor = conn.cursor()

    # 获取表的列信息
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns_info = cursor.fetchall()
    columns = [col[1] for col in columns_info]

    # 获取所有数据
    cursor.execute(f"SELECT * FROM {table_name}")
    rows = cursor.fetchall()

    # 转换为字典列表
    data = []
    for row in rows:
        row_dict = {}
        for i, col_name in enumerate(columns):
            value = row[i]
            # 处理datetime类型
            if isinstance(value, str):
                try:
                    # 尝试解析ISO格式的datetime
                    datetime.fromisoformat(value.replace('Z', '+00:00'))
                except:
                    pass
            row_dict[col_name] = value
        data.append(row_dict)

    print(f"[Export] {table_name}: {len(data)} rows")
    return data


def export_sqlite_to_json(db_path: str, output_file: str):
    """导出SQLite数据库到JSON"""
    print(f"[Export] Reading database: {db_path}")

    # 连接SQLite数据库
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 获取所有表名
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [row[0] for row in cursor.fetchall()]

    print(f"[Export] Found tables: {tables}")

    # 导出所有表
    export_data = {}
    for table in tables:
        try:
            export_data[table] = export_table_data(conn, table)
        except Exception as e:
            print(f"[Export] Error exporting table {table}: {e}")
            export_data[table] = []

    conn.close()

    # 添加导出元数据
    export_data["_metadata"] = {
        "exported_at": datetime.now().isoformat(),
        "source_db": db_path,
        "tables_count": len(tables)
    }

    # 保存到JSON文件
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, ensure_ascii=False, indent=2)

    print(f"[Export] Successfully exported to: {output_file}")
    print(f"[Export] Total tables: {len(tables)}")
    print(f"[Export] Total rows: {sum(len(data) for data in export_data.values() if isinstance(data, list))}")


if __name__ == "__main__":
    # SQLite数据库路径
    sqlite_db_path = os.path.join(os.path.dirname(__file__), "..", "data", "database.db")

    # 输出JSON文件路径
    output_json_path = os.path.join(os.path.dirname(__file__), "export_data.json")

    export_sqlite_to_json(sqlite_db_path, output_json_path)
