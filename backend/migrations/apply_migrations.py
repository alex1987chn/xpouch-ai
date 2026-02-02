#!/usr/bin/env python3
"""
数据库迁移执行脚本
用于在服务器上执行所有待执行的迁移
"""

import os
import sys
import psycopg
from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 数据库连接配置
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "xpouch")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

# 迁移文件列表（按顺序执行）
MIGRATIONS = [
    ("v3_0_complex_mode_refactor.sql", "v3.0 Complex Mode Refactor - Artifact表、TaskSession/SubTask扩展"),
    ("add_message_metadata.sql", "Add extra_data column to message table"),
    ("v3_0_1_thread_fields.sql", "v3.0.1 Thread Table Fields - Thread和CustomAgent扩展"),
]


def get_db_connection():
    """获取数据库连接"""
    conn_str = f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} user={DB_USER} password={DB_PASSWORD}"
    return psycopg.connect(conn_str)


def check_migration_table_exists(cursor):
    """检查迁移记录表是否存在"""
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'migration_history'
        );
    """)
    return cursor.fetchone()[0]


def create_migration_table(cursor):
    """创建迁移记录表"""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS migration_history (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN DEFAULT TRUE
        );
    """)
    print("✓ 创建迁移记录表")


def is_migration_applied(cursor, filename):
    """检查迁移是否已执行"""
    cursor.execute(
        "SELECT EXISTS (SELECT 1 FROM migration_history WHERE filename = %s);",
        (filename,)
    )
    return cursor.fetchone()[0]


def record_migration(cursor, filename, description, success=True):
    """记录迁移执行历史"""
    cursor.execute(
        """
        INSERT INTO migration_history (filename, description, success)
        VALUES (%s, %s, %s)
        ON CONFLICT (filename) DO UPDATE SET
            description = EXCLUDED.description,
            applied_at = CURRENT_TIMESTAMP,
            success = EXCLUDED.success;
        """,
        (filename, description, success)
    )


def execute_migration(cursor, filename, description):
    """执行单个迁移文件"""
    migrations_dir = Path(__file__).parent
    file_path = migrations_dir / filename
    
    if not file_path.exists():
        print(f"✗ 迁移文件不存在: {filename}")
        return False
    
    print(f"\n正在执行: {filename}")
    print(f"描述: {description}")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            sql = f.read()
        
        # 执行 SQL
        cursor.execute(sql)
        print(f"✓ 迁移成功: {filename}")
        return True
        
    except Exception as e:
        print(f"✗ 迁移失败: {filename}")
        print(f"  错误: {e}")
        return False


def show_status(cursor):
    """显示迁移状态"""
    print("\n" + "="*60)
    print("迁移状态")
    print("="*60)
    
    for filename, description in MIGRATIONS:
        if is_migration_applied(cursor, filename):
            print(f"✓ {filename}")
        else:
            print(f"✗ {filename} (待执行)")


def apply_migrations():
    """执行所有待执行的迁移"""
    print("="*60)
    print("数据库迁移工具")
    print("="*60)
    print(f"数据库: {DB_NAME}@{DB_HOST}:{DB_PORT}")
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                # 确保迁移记录表存在
                if not check_migration_table_exists(cursor):
                    create_migration_table(cursor)
                
                # 显示当前状态
                show_status(cursor)
                
                print("\n" + "="*60)
                print("开始执行迁移")
                print("="*60)
                
                applied_count = 0
                skipped_count = 0
                failed_count = 0
                
                for filename, description in MIGRATIONS:
                    if is_migration_applied(cursor, filename):
                        print(f"\n跳过 (已执行): {filename}")
                        skipped_count += 1
                        continue
                    
                    success = execute_migration(cursor, filename, description)
                    record_migration(cursor, filename, description, success)
                    
                    if success:
                        applied_count += 1
                    else:
                        failed_count += 1
                
                conn.commit()
                
                print("\n" + "="*60)
                print("迁移完成")
                print("="*60)
                print(f"成功: {applied_count}")
                print(f"跳过: {skipped_count}")
                print(f"失败: {failed_count}")
                
                if failed_count > 0:
                    sys.exit(1)
                    
    except psycopg.OperationalError as e:
        print(f"\n✗ 数据库连接失败: {e}")
        print("请检查环境变量配置:")
        print("  - DB_HOST")
        print("  - DB_PORT")
        print("  - DB_NAME")
        print("  - DB_USER")
        print("  - DB_PASSWORD")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ 迁移过程出错: {e}")
        sys.exit(1)


def rollback_migration(filename):
    """回滚指定迁移（仅标记为未执行，不实际删除数据）"""
    print(f"\n回滚迁移: {filename}")
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM migration_history WHERE filename = %s;",
                    (filename,)
                )
                conn.commit()
                print(f"✓ 已标记为未执行: {filename}")
                print("  注意: 这只是删除迁移记录，数据表结构未自动回滚")
                
    except Exception as e:
        print(f"✗ 回滚失败: {e}")
        sys.exit(1)


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="数据库迁移工具")
    parser.add_argument(
        "action",
        choices=["apply", "status", "rollback"],
        default="apply",
        nargs="?",
        help="操作: apply(执行迁移), status(查看状态), rollback(回滚)"
    )
    parser.add_argument(
        "--file",
        help="回滚时指定迁移文件名"
    )
    
    args = parser.parse_args()
    
    if args.action == "apply":
        apply_migrations()
    elif args.action == "status":
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cursor:
                    if not check_migration_table_exists(cursor):
                        create_migration_table(cursor)
                        conn.commit()
                    show_status(cursor)
        except Exception as e:
            print(f"查看状态失败: {e}")
            sys.exit(1)
    elif args.action == "rollback":
        if not args.file:
            print("回滚操作需要指定 --file 参数")
            sys.exit(1)
        rollback_migration(args.file)


if __name__ == "__main__":
    main()
