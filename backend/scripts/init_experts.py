"""
初始化系统专家数据

此脚本在 SystemExpert 表中创建默认的专家配置
包括：search, coder, researcher, analyzer, writer, planner, image_analyzer, commander

特性：
1. 安全模式（默认）：仅创建缺失的专家，不覆盖现有专家
2. 更新模式（--update）：覆盖现有专家的配置为默认值
3. 异步兼容：自动检测数据库引擎类型，支持同步和异步会话
4. 模型自动适配：从环境变量读取默认模型

使用方法（从项目根目录运行）：
  python -m backend.scripts.init_experts [options]

选项：
  list                   列出数据库中的所有专家
  --update               更新模式：覆盖现有专家配置
  --safe                 安全模式：仅创建缺失专家（默认）
  --help                 显示帮助信息

示例：
  # 安全模式初始化（默认）
  python -m backend.scripts.init_experts

  # 更新模式初始化（覆盖现有专家）
  python -m backend.scripts.init_experts --update

  # 列出所有专家
  python -m backend.scripts.init_experts list
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine
from sqlmodel import Session, select
from expert_config import EXPERT_DEFAULTS, DEFAULT_EXPERT_MODEL
from backend.database import engine
from backend.constants import COMMANDER_SYSTEM_PROMPT


def get_session_class_and_engine():
    """返回适当的会话类和引擎实例"""
    # 检查引擎是否为异步引擎
    try:
        from sqlalchemy.ext.asyncio import AsyncEngine
        if isinstance(engine, AsyncEngine):
            print("[Info] Using AsyncSession (async engine detected)")
            return AsyncSession, engine
    except ImportError:
        pass
    
    # 回退到同步会话
    print("[Info] Using Session (sync engine)")
    return Session, engine







# EXPERT_DEFAULTS 已移至 config/experts.py，避免重复导入数据库模型




async def init_experts_async(update_existing=False, update_commander=False):
    """异步初始化系统专家数据
    
    Args:
        update_existing: 是否更新所有现有专家（覆盖自定义配置）
        update_commander: 是否只更新 commander（用于启用思维链功能）
    """
    SessionClass, engine = get_session_class_and_engine()
    
    # 选择上下文管理器
    if SessionClass == AsyncSession:
        async with SessionClass(engine) as session:
            await process_experts(session, update_existing, update_commander)
    else:
        with SessionClass(engine) as session:
            # 同步会话，但我们仍可以调用异步函数
            await process_experts(session, update_existing, update_commander)

async def process_experts(session, update_existing=False, update_commander=False):
    """处理专家插入/更新逻辑
    
    Args:
        update_existing: 是否更新所有现有专家（覆盖自定义配置）
        update_commander: 是否只更新 commander（用于启用思维链功能）
    """
    from sqlmodel import select
    from models import SystemExpert
    
    # 检查现有专家
    if isinstance(session, AsyncSession):
        result = await session.execute(select(SystemExpert))
        existing_experts = result.scalars().all()
    else:
        existing_experts = session.exec(select(SystemExpert)).all()
    
    existing_keys = {e.expert_key for e in existing_experts}
    print(f"Found {len(existing_experts)} existing experts in database")
    
    updated_count = 0
    created_count = 0
    commander_updated = False
    
    for expert_config in EXPERT_DEFAULTS:
        expert_key = expert_config["expert_key"]
        
        if expert_key in existing_keys:
            # 情况1：强制更新所有专家
            if update_existing:
                await _update_expert(session, expert_config)
                updated_count += 1
            # 情况2：只更新 commander（用于启用思维链）
            elif update_commander and expert_key == "commander":
                await _update_expert(session, expert_config)
                updated_count += 1
                commander_updated = True
                print(f"✓ Commander updated to enable thinking chain!")
            else:
                print(f"⚠ Skipping existing expert: {expert_key}")
        else:
            # 创建新专家
            expert = SystemExpert(**expert_config)
            session.add(expert)
            created_count += 1
            print(f"✓ Created expert: {expert_key}")
    
    # 提交事务
    if isinstance(session, AsyncSession):
        await session.commit()
    else:
        session.commit()
    
    print(f"\nInitialization complete:")
    print(f"  - Created: {created_count} experts")
    print(f"  - Updated: {updated_count} experts")
    print(f"  - Total: {len(EXPERT_DEFAULTS)} experts")
    
    if update_commander and not commander_updated:
        print("\n⚠️  Warning: Commander not found in database, cannot update.")


async def _update_expert(session, expert_config):
    """更新单个专家的辅助函数"""
    from sqlmodel import select
    from models import SystemExpert
    
    expert_key = expert_config["expert_key"]
    
    if isinstance(session, AsyncSession):
        result = await session.execute(
            select(SystemExpert).where(SystemExpert.expert_key == expert_key)
        )
        expert = result.scalar_one_or_none()
    else:
        expert = session.exec(
            select(SystemExpert).where(SystemExpert.expert_key == expert_key)
        ).first()
    
    if expert:
        expert.name = expert_config["name"]
        expert.system_prompt = expert_config["system_prompt"]
        expert.model = expert_config["model"]
        expert.temperature = expert_config["temperature"]
        session.add(expert)
        print(f"✓ Updated expert: {expert_key}")

def init_experts(update_existing=False, update_commander=False):
    """同步包装器，向后兼容"""
    asyncio.run(init_experts_async(update_existing, update_commander))


async def list_experts_async():
    """异步列出所有专家"""
    SessionClass, engine = get_session_class_and_engine()
    
    if SessionClass == AsyncSession:
        async with SessionClass(engine) as session:
            await list_experts_process(session)
    else:
        with SessionClass(engine) as session:
            await list_experts_process(session)

async def list_experts_process(session):
    """处理列出专家逻辑"""
    from sqlmodel import select
    from models import SystemExpert
    
    if isinstance(session, AsyncSession):
        result = await session.execute(select(SystemExpert))
        experts = result.scalars().all()
    else:
        experts = session.exec(select(SystemExpert)).all()
    
    print(f"\nTotal experts in database: {len(experts)}\n")
    
    for expert in experts:
        print(f"Expert Key: {expert.expert_key}")
        print(f"  Name: {expert.name}")
        print(f"  Model: {expert.model}")
        print(f"  Temperature: {expert.temperature}")
        print(f"  Updated: {expert.updated_at}")
        print(f"  Prompt Length: {len(expert.system_prompt)} characters")
        print()

def list_experts():
    """同步包装器，向后兼容"""
    asyncio.run(list_experts_async())


if __name__ == "__main__":
    import sys
    
    # 默认安全模式（不覆盖现有专家）
    update_existing = False
    update_commander = False
    
    # 解析命令行参数
    args = sys.argv[1:]
    if not args:
        # 无参数：安全模式初始化（只创建缺失的专家，包括 memorize_expert）
        print("Initializing system experts (safe mode, no overwrite)...")
        init_experts(update_existing=False, update_commander=False)
        list_experts()
    elif args[0] == "list":
        list_experts()
    else:
        # 解析标志
        for arg in args:
            if arg == "--update":
                update_existing = True
                print("⚠ Update mode enabled: existing experts will be overwritten!")
            elif arg == "--update-commander":
                update_commander = True
                print("📝 Commander update mode: only commander prompt will be updated for thinking chain!")
            elif arg == "--safe":
                update_existing = False
                print("Safe mode: skipping existing experts (no overwrite)")
            elif arg == "--help":
                print("Usage: python init_experts.py [options]")
                print("\nModes:")
                print("  (no args)               Safe mode: only create missing experts (RECOMMENDED for upgrade)")
                print("  list                    List all experts in database")
                print("\nOptions:")
                print("  --update                Update ALL existing experts (overwrite with defaults)")
                print("  --update-commander      Only update commander prompt (enable thinking chain)")
                print("  --safe                  Safe mode: only create missing experts (default)")
                print("  --help                  Show this help message")
                print("\nExamples:")
                print("  # Upgrade: add missing experts (memorize_expert) without overwriting custom prompts")
                print("  python init_experts.py")
                print("")
                print("  # Enable thinking chain for commander (update only commander prompt)")
                print("  python init_experts.py --update-commander")
                print("")
                print("  # Force update all experts to defaults (DANGER: overwrites custom prompts)")
                print("  python init_experts.py --update")
                sys.exit(0)
            else:
                print(f"Warning: Unknown argument '{arg}'")
        
        print("Initializing system experts...")
        init_experts(update_existing=update_existing, update_commander=update_commander)
        list_experts()
