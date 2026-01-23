"""
数据库 Conversation 记录验证脚本

此脚本用于验证数据库中的 Conversation 记录是否与新的语义化 ID 系统一致。
"""

from sqlmodel import Session, select
from models import Conversation
from database import get_session
from constants import SYSTEM_AGENT_DEFAULT_CHAT, SYSTEM_AGENT_ORCHESTRATOR


def verify_conversations():
    """验证数据库中的 Conversation 记录"""
    
    with get_session() as session:
        # 查询所有 Conversation 记录
        statement = select(Conversation)
        conversations = session.exec(statement).all()
        
        print(f"\n总共有 {len(conversations)} 条会话记录\n")
        print("=" * 80)
        
        issues = []
        
        for conv in conversations:
            print(f"\n会话 ID: {conv.id}")
            print(f"  agent_id: {conv.agent_id}")
            print(f"  agent_type: {conv.agent_type}")
            
            # 验证 agent_id 和 agent_type 的一致性
            if conv.agent_id == SYSTEM_AGENT_ORCHESTRATOR:
                expected_type = "ai"
            elif conv.agent_id == SYSTEM_AGENT_DEFAULT_CHAT:
                expected_type = "default"
            elif conv.agent_type == "custom":
                expected_type = "custom"
            else:
                expected_type = "default"  # 兜底
            
            if conv.agent_type != expected_type:
                issues.append({
                    "id": conv.id,
                    "agent_id": conv.agent_id,
                    "current_type": conv.agent_type,
                    "expected_type": expected_type
                })
                print(f"  ❌ 不一致！期望类型: {expected_type}，实际类型: {conv.agent_type}")
            else:
                print(f"  ✅ 一致")
        
        print("\n" + "=" * 80)
        print(f"\n发现 {len(issues)} 条不一致记录\n")
        
        if issues:
            print("\n问题详情：")
            for idx, issue in enumerate(issues, 1):
                print(f"{idx}. 会话 {issue['id']}")
                print(f"   agent_id: {issue['agent_id']}")
                print(f"   当前类型: {issue['current_type']}")
                print(f"   期望类型: {issue['expected_type']}")
                print()
            
            # 询问是否修复
            choice = input("\n是否修复这些不一致的记录？(y/n): ")
            if choice.lower() == 'y':
                for issue in issues:
                    conv = session.get(Conversation, issue['id'])
                    if conv:
                        conv.agent_type = issue['expected_type']
                        session.add(conv)
                session.commit()
                print(f"\n✅ 已修复 {len(issues)} 条记录")
        else:
            print("\n✅ 所有记录验证通过！")


if __name__ == "__main__":
    verify_conversations()
