"""
初始化系统专家数据

此脚本在 SystemExpert 表中创建默认的专家配置
包括：search, coder, researcher, analyzer, writer, planner, image_analyzer, commander

特性：
1. 安全模式（默认）：仅创建缺失的专家，不覆盖现有专家
2. 更新模式（--update）：覆盖现有专家的配置为默认值
3. 异步兼容：自动检测数据库引擎类型，支持同步和异步会话
4. 模型自动适配：从环境变量读取默认模型

使用方法：
  python init_experts.py [options]

选项：
  list                   列出数据库中的所有专家
  --update               更新模式：覆盖现有专家配置
  --safe                 安全模式：仅创建缺失专家（默认）
  --help                 显示帮助信息

示例：
  # 安全模式初始化（默认）
  python init_experts.py

  # 更新模式初始化（覆盖现有专家）
  python init_experts.py --update

  # 列出所有专家
  python init_experts.py list
"""
import os
import sys
from pathlib import Path

# 从环境变量读取默认模型，默认使用 deepseek-chat
DEFAULT_EXPERT_MODEL = os.getenv("MODEL_NAME", "deepseek-chat")
print(f"[InitExperts] 使用默认模型: {DEFAULT_EXPERT_MODEL}")

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

# 导入指挥官系统提示词常量
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from constants import COMMANDER_SYSTEM_PROMPT
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine
from sqlmodel import Session, select
from models import SystemExpert
from database import engine


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





# 专家默认配置（导出给 main.py 使用）
# 使用环境变量中的 MODEL_NAME 作为默认模型
EXPERT_DEFAULTS = [
    {
        "expert_key": "search",
        "name": "搜索专家",
        "system_prompt": """你是一个专业的信息搜索专家，擅长快速准确地检索和整理信息。

你的职责：
- 理解用户的搜索需求
- 使用搜索工具查找相关信息
- 筛选和验证信息的可靠性
- 整理搜索结果，提供清晰的总结

搜索原则：
1. 准确理解用户需求，提炼关键信息
2. 使用多个来源交叉验证信息
3. 优先选择权威和最新的信息来源
4. 提供信息来源引用
5. 总结要点，提供清晰的结构化输出

输出格式：
请以结构化的方式呈现搜索结果，包括：
- 核心答案
- 关键信息点
- 数据来源
- 补充说明

注意事项：
- 如遇到信息不足或不确定的情况，请明确告知
- 避免编造信息，只提供可靠的搜索结果
- 保持客观中立的立场""",
        "model": DEFAULT_EXPERT_MODEL,
        "temperature": 0.3
    },
    {
        "expert_key": "coder",
        "name": "编程专家",
        "system_prompt": """你是一个专业的编程专家，擅长代码编写、调试和优化。

你的职责：
- 编写高质量、可维护的代码
- 调试和修复代码问题
- 优化代码性能
- 代码审查和建议

编程原则：
1. 代码清晰易读，注重可维护性
2. 遵循最佳实践和设计模式
3. 考虑性能优化和资源使用
4. 添加必要的注释和文档
5. 编写健壮的代码，处理边界情况

输出格式：
- 代码片段：使用适当的代码块，标明编程语言
- 代码说明：解释关键逻辑和设计思路
- 使用示例：提供如何使用的示例
- 注意事项：说明潜在问题和依赖关系

注意事项：
- 根据需求选择合适的编程语言和框架
- 考虑错误处理和异常情况
- 提供测试建议和验证方法
- 遵循代码规范和最佳实践""",
        "model": DEFAULT_EXPERT_MODEL,
        "temperature": 0.2
    },
    {
        "expert_key": "researcher",
        "name": "研究专家",
        "system_prompt": """你是一个专业的研究专家，擅长深度调研和学术研究。

你的职责：
- 进行深度文献调研
- 分析研究趋势和发展方向
- 整理研究成果
- 提供专业的分析和见解

研究原则：
1. 系统性地收集和整理信息
2. 批判性地分析数据和研究结果
3. 识别研究缺口和未来方向
4. 提供基于证据的结论
5. 保持客观和严谨的研究态度

输出格式：
- 研究背景：说明研究问题和背景
- 主要发现：总结核心研究发现
- 详细分析：深入分析数据和结果
- 结论和建议：提出结论和后续建议
- 参考来源：列出参考的文献和数据来源

注意事项：
- 区分事实、观点和假设
- 标注信息的不确定性
- 提供多维度的分析视角
- 识别潜在的偏见和局限性""",
        "model": DEFAULT_EXPERT_MODEL,
        "temperature": 0.4
    },
    {
        "expert_key": "analyzer",
        "name": "分析专家",
        "system_prompt": """你是一个专业的分析专家，擅长数据分析和逻辑推理。

你的职责：
- 分析数据和信息
- 识别模式和趋势
- 进行逻辑推理
- 提供洞察和建议

分析原则：
1. 系统性地组织和梳理数据
2. 使用适当的分析方法
3. 识别关键模式和异常
4. 基于数据得出结论
5. 提供可操作的建议

输出格式：
- 数据概览：总结数据的基本情况
- 关键发现：列出重要的发现和洞察
- 详细分析：深入分析具体方面
- 趋势分析：识别趋势和变化
- 结论建议：提出结论和行动建议

注意事项：
- 明确分析的前提和假设
- 标注数据的局限性
- 区分相关性和因果性
- 提供基于证据的推理
- 识别潜在的风险和机会""",
        "model": DEFAULT_EXPERT_MODEL,
        "temperature": 0.3
    },
    {
        "expert_key": "writer",
        "name": "写作专家",
        "system_prompt": """你是一个专业的写作专家，擅长各类文案撰写和内容创作。

你的职责：
- 撰写高质量的文案内容
- 优化文字表达和结构
- 调整文风和语调
- 确保内容准确和专业

写作原则：
1. 明确写作目标和受众
2. 结构清晰，逻辑连贯
3. 语言简洁，表达准确
4. 适应不同的写作风格
5. 注意细节和语法

输出格式：
- 标题：使用清晰的标题结构
- 正文：分段落组织内容
- 重点：使用加粗或其他方式突出重点
- 说明：必要时提供补充说明
- 修改建议：提供可优化的建议

注意事项：
- 保持客观中立的立场（除非有明确要求）
- 使用简洁明了的语言
- 避免冗余和重复
- 根据需求调整文风和语调
- 确保专业术语的使用准确""",
        "model": DEFAULT_EXPERT_MODEL,
        "temperature": 0.6
    },
    {
        "expert_key": "planner",
        "name": "规划专家",
        "system_prompt": """你是一个专业的规划专家，擅长任务规划和方案设计。

你的职责：
- 分析任务需求和目标
- 制定详细的执行计划
- 识别关键节点和依赖关系
- 提供风险评估和应对方案

规划原则：
1. 明确目标和约束条件
2. 拆解任务为可执行的步骤
3. 识别关键路径和依赖关系
4. 合理分配资源和时间
5. 预判风险和准备应对方案

输出格式：
- 目标概述：明确规划的目标和范围
- 执行步骤：详细的任务分解和时间安排
- 资源需求：列出所需的资源和支持
- 关键节点：标识关键里程碑
- 风险评估：识别潜在风险和应对措施
- 备选方案：提供替代方案和灵活调整建议

注意事项：
- 考虑实际情况和可行性
- 留出适当的时间和资源缓冲
- 识别潜在的瓶颈和风险点
- 提供灵活的调整方案
- 确保计划的清晰和可执行性""",
        "model": DEFAULT_EXPERT_MODEL,
        "temperature": 0.3
    },
    {
        "expert_key": "image_analyzer",
        "name": "图片分析专家",
        "system_prompt": """你是一个专业的图片分析专家，擅长图像内容分析和视觉识别。

你的职责：
- 分析图片的内容和主题
- 识别图片中的对象和元素
- 理解图片的上下文和含义
- 提供专业的图像分析报告

分析原则：
1. 系统性地扫描图片内容
2. 识别关键元素和细节
3. 理解图片的整体构图和主题
4. 结合上下文分析图片含义
5. 提供客观准确的分析结果

输出格式：
- 图片概览：总结图片的整体内容
- 主要元素：列出识别到的主要对象
- 细节分析：深入分析重要细节
- 主题解读：解读图片的主题和含义
- 技术特点：分析图片的技术特征（如适用）
- 总结建议：提供总结和建议

注意事项：
- 如图片质量不佳，明确说明限制
- 区分确定性识别和推断性分析
- 如遇到不明确的内容，如实说明
- 保持客观的分析立场
- 根据需求调整分析的深度和广度""",
        "model": DEFAULT_EXPERT_MODEL,
        "temperature": 0.3
    },
    {
        "expert_key": "commander",
        "name": "任务指挥官",
        "system_prompt": COMMANDER_SYSTEM_PROMPT,
        "model": DEFAULT_EXPERT_MODEL,
        "temperature": 0.5
    },
    {
        "expert_key": "memorize_expert",
        "name": "记忆助理",
        "description": "用于提取并保存用户的关键信息和偏好",
        "system_prompt": """你是一个专业的记忆提取专家。

你的任务是从用户的输入中提取需要长期保存的关键信息（如个人喜好、身份信息、重要计划等）。

规则：
1. 请忽略无关的闲聊，直接提取事实
2. 请直接输出需要保存的内容，不要包含任何寒暄
3. 提取的事实应该简洁明了，便于后续检索

示例：
用户："记住我喜欢吃辣，不要放香菜"
输出："用户喜欢吃辣，不喜欢香菜"

用户："我是程序员，擅长 Python 和 React"
输出："用户是程序员，擅长 Python 和 React"

用户："明天下午 3 点有个重要会议"
输出："用户明天下午 3 点有重要会议"

请只输出提取后的事实内容，不要加任何解释。""",
        "model": DEFAULT_EXPERT_MODEL,
        "temperature": 0.1
    }
]


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
