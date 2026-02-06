"""
初始化记忆专家到数据库
运行此脚本注册 memorize_expert 专家
"""
import asyncio
import sys
from pathlib import Path

# 确保 backend 目录在路径中
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlmodel import Session, select
from database import engine
from models import SystemExpert


async def init_memory_expert():
    """注册记忆专家到数据库"""
    
    # 定义记忆专家的 System Prompt
    # 核心任务：从用户的话里提取关键事实，并只输出事实内容
    system_prompt = """你是一个专业的记忆提取专家。

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

请只输出提取后的事实内容，不要加任何解释。"""

    expert_key = "memorize_expert"
    
    with Session(engine) as session:
        # 检查是否已存在
        statement = select(SystemExpert).where(SystemExpert.expert_key == expert_key)
        existing = session.exec(statement).first()
        
        if not existing:
            expert = SystemExpert(
                expert_key=expert_key,
                name="记忆助理",
                description="用于提取并保存用户的关键信息和偏好",
                system_prompt=system_prompt,
                model="deepseek-chat",  # 使用默认模型
                temperature=0.1,  # 低温度，保证提取准确
                is_dynamic=True
            )
            session.add(expert)
            session.commit()
            print(f"[Init] 记忆专家 ({expert_key}) 已注册到数据库！")
        else:
            print(f"[Init] 记忆专家 ({expert_key}) 已存在，跳过。")


if __name__ == "__main__":
    asyncio.run(init_memory_expert())
