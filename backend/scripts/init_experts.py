"""
初始化系统专家数据

此脚本在 SystemExpert 表中创建默认的专家配置
包括：search, coder, researcher, analyzer, writer, planner, image_analyzer, commander

特性：
1. 安全模式（默认）：仅创建缺失的专家，不覆盖现有专家
2. 更新模式（--update）：覆盖现有专家的配置为默认值
3. 模型自动适配：从环境变量读取默认模型

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

from sqlmodel import select

from database import SessionFactory
from expert_config import EXPERT_DEFAULTS
from models import SystemExpert
from utils.logger import logger


async def init_experts_async(update_existing=False, update_commander=False):
    """初始化系统专家数据

    Args:
        update_existing: 是否更新所有现有专家（覆盖自定义配置）
        update_commander: 是否只更新 commander（用于启用思维链功能）
    """
    async with SessionFactory() as session:
        existing_experts = (await session.exec(select(SystemExpert))).all()
        existing_keys = {e.expert_type for e in existing_experts}
        logger.info(f"Found {len(existing_experts)} existing experts in database")

        updated_count = 0
        created_count = 0
        commander_updated = False

        for expert_config in EXPERT_DEFAULTS:
            expert_type = expert_config["expert_type"]

            if expert_type in existing_keys:
                # 情况1：强制更新所有专家
                if update_existing:
                    await _update_expert(session, expert_config)
                    updated_count += 1
                # 情况2：只更新 commander（用于启用思维链）
                elif update_commander and expert_type == "commander":
                    await _update_expert(session, expert_config)
                    updated_count += 1
                    commander_updated = True
                    logger.info("✓ Commander updated to enable thinking chain!")
                else:
                    logger.warning(f"⚠ Skipping existing expert: {expert_type}")
            else:
                # 创建新专家
                expert = SystemExpert(**expert_config)
                session.add(expert)
                created_count += 1
                logger.info(f"✓ Created expert: {expert_type}")

        await session.commit()

    logger.info("\nInitialization complete:")
    logger.info(f"  - Created: {created_count} experts")
    logger.info(f"  - Updated: {updated_count} experts")
    logger.info(f"  - Total: {len(EXPERT_DEFAULTS)} experts")

    if update_commander and not commander_updated:
        logger.warning("\n⚠️  Warning: Commander not found in database, cannot update.")


async def _update_expert(session, expert_config):
    """更新单个专家的辅助函数"""
    expert_type = expert_config["expert_type"]

    expert = (
        await session.exec(select(SystemExpert).where(SystemExpert.expert_type == expert_type))
    ).first()

    if expert:
        expert.name = expert_config["name"]
        expert.system_prompt = expert_config["system_prompt"]
        expert.model = expert_config["model"]
        expert.temperature = expert_config["temperature"]
        session.add(expert)
        logger.info(f"✓ Updated expert: {expert_type}")


def init_experts(update_existing=False, update_commander=False):
    """CLI 同步入口"""
    asyncio.run(init_experts_async(update_existing, update_commander))


async def list_experts_async():
    """列出所有专家"""
    async with SessionFactory() as session:
        experts = (await session.exec(select(SystemExpert))).all()

    logger.info(f"\nTotal experts in database: {len(experts)}\n")

    for expert in experts:
        logger.info(f"Expert Key: {expert.expert_type}")
        logger.info(f"  Name: {expert.name}")
        logger.info(f"  Model: {expert.model}")
        logger.info(f"  Temperature: {expert.temperature}")
        logger.info(f"  Updated: {expert.updated_at}")
        logger.info(f"  Prompt Length: {len(expert.system_prompt)} characters")
        logger.info("")


def list_experts():
    """CLI 同步入口"""
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
        logger.info("Initializing system experts (safe mode, no overwrite)...")
        init_experts(update_existing=False, update_commander=False)
        list_experts()
    elif args[0] == "list":
        list_experts()
    else:
        # 解析标志
        for arg in args:
            if arg == "--update":
                update_existing = True
                logger.warning("⚠ Update mode enabled: existing experts will be overwritten!")
            elif arg == "--update-commander":
                update_commander = True
                logger.info(
                    "📝 Commander update mode: only commander prompt will be updated for thinking chain!"
                )
            elif arg == "--safe":
                update_existing = False
                logger.info("Safe mode: skipping existing experts (no overwrite)")
            elif arg == "--help":
                print("Usage: python init_experts.py [options]")
                print("\nModes:")
                print(
                    "  (no args)               Safe mode: only create missing experts (RECOMMENDED for upgrade)"
                )
                print("  list                    List all experts in database")
                print("\nOptions:")
                print(
                    "  --update                Update ALL existing experts (overwrite with defaults)"
                )
                print(
                    "  --update-commander      Only update commander prompt (enable thinking chain)"
                )
                print("  --safe                  Safe mode: only create missing experts (default)")
                print("  --help                  Show this help message")
                print("\nExamples:")
                print(
                    "  # Upgrade: add missing experts (memorize_expert) without overwriting custom prompts"
                )
                print("  python init_experts.py")
                print("")
                print("  # Enable thinking chain for commander (update only commander prompt)")
                print("  python init_experts.py --update-commander")
                print("")
                print(
                    "  # Force update all experts to defaults (DANGER: overwrites custom prompts)"
                )
                print("  python init_experts.py --update")
                sys.exit(0)
            else:
                logger.warning(f"Warning: Unknown argument '{arg}'")

        logger.info("Initializing system experts...")
        init_experts(update_existing=update_existing, update_commander=update_commander)
        list_experts()
