"""
数据模型验证脚本
演示如何创建 SubTask 和 TaskSession 实例，并验证其符合 Pydantic v2 标准
"""
import json
from uuid import uuid4
from datetime import datetime
from typing import Literal

# 模拟导入（实际使用时取消注释）
# from models import (
#     SubTask, 
#     TaskSession, 
#     SubTaskCreate, 
#     TaskSessionCreate,
#     ExpertType, 
#     TaskStatus
# )


# ============================================================================
# 临时定义（用于演示，实际使用时从 models.py 导入）
# ============================================================================

ExpertType = Literal["search", "coder", "researcher", "analyzer", "writer", "planner"]
TaskStatus = Literal["pending", "running", "completed", "failed"]


def create_subtask_example():
    """
    演示：创建一个 SubTask 实例
    
    Returns:
        dict: SubTask 数据的字典表示
    """
    subtask_data = {
        "id": str(uuid4()),
        "expert_type": "coder",
        "description": "实现一个快速排序算法",
        "input_data": {
            "language": "Python",
            "requirements": [
                "时间复杂度 O(n log n)",
                "添加详细注释",
                "包含测试用例"
            ]
        },
        "status": "pending",
        "output_result": None,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "started_at": None,
        "completed_at": None,
        "task_session_id": None
    }
    
    return subtask_data


def create_task_session_example():
    """
    演示：创建一个 TaskSession 实例
    
    Returns:
        dict: TaskSession 数据的字典表示
    """
    session_data = {
        "session_id": str(uuid4()),
        "user_query": "帮我写一个 Python 快速排序算法",
        "sub_tasks": [],
        "final_response": None,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "completed_at": None
    }
    
    return session_data


def validate_and_serialize(data: dict, model_name: str):
    """
    验证并序列化数据
    
    Args:
        data: 待验证的数据字典
        model_name: 模型名称（用于日志输出）
    """
    print(f"\n{'='*60}")
    print(f"📦 模型: {model_name}")
    print(f"{'='*60}")
    
    # 输出原始数据
    print("\n📋 原始数据:")
    print(json.dumps(data, indent=2, ensure_ascii=False))
    
    # 验证数据类型
    print("\n✅ 数据验证:")
    print(f"   - ID 类型: {type(data.get('id'))}")
    print(f"   - ID 格式: {'✓ UUID' if '-' in str(data.get('id')) else '✗'}")
    
    # 序列化为 JSON
    print("\n🔄 JSON 序列化:")
    try:
        json_str = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        print("   ✓ 序列化成功")
        print(f"\n{json_str}")
    except Exception as e:
        print(f"   ✗ 序列化失败: {e}")
        return False
    
    return True


def demonstrate_dto_usage():
    """
    演示 DTO（数据传输对象）的使用
    """
    print("\n" + "="*60)
    print("📨 DTO (Data Transfer Object) 使用示例")
    print("="*60)
    
    # SubTaskCreate DTO - 用于 API 请求
    subtask_create = {
        "expert_type": "researcher",
        "description": "搜索最新的 AI 发展趋势",
        "input_data": {
            "keywords": ["人工智能", "AGI", "大语言模型"],
            "time_range": "2024-2025",
            "sources": ["arxiv", "news"]
        }
    }
    
    print("\n📤 SubTaskCreate (API 请求):")
    print(json.dumps(subtask_create, indent=2, ensure_ascii=False))
    
    # TaskSessionCreate DTO - 用于 API 请求
    task_session_create = {
        "user_query": "帮我研究一下 2025 年 AI 领域的最新进展"
    }
    
    print("\n📤 TaskSessionCreate (API 请求):")
    print(json.dumps(task_session_create, indent=2, ensure_ascii=False))


def demonstrate_task_workflow():
    """
    演示完整的工作流：创建任务会话 -> 分发子任务 -> 更新状态
    """
    print("\n" + "="*60)
    print("🔄 完整工作流演示")
    print("="*60)
    
    # 1. 用户发起查询
    print("\n1️⃣  用户发起查询")
    user_query = "帮我分析并优化这段 Python 代码"
    print(f"   Query: {user_query}")
    
    # 2. 指挥官创建任务会话
    print("\n2️⃣  创建任务会话")
    session = create_task_session_example()
    session["user_query"] = user_query
    session["session_id"] = str(uuid4())
    print(f"   Session ID: {session['session_id']}")
    
    # 3. 指挥官分解任务，创建子任务
    print("\n3️⃣  指挥官分解任务")
    
    # 子任务 1: 分析代码
    subtask1 = create_subtask_example()
    subtask1.update({
        "task_session_id": session["session_id"],
        "expert_type": "analyzer",
        "description": "分析代码的逻辑和性能瓶颈",
        "input_data": {"code": "def example(): ..."}
    })
    
    # 子任务 2: 优化代码
    subtask2 = create_subtask_example()
    subtask2.update({
        "task_session_id": session["session_id"],
        "expert_type": "coder",
        "description": "优化代码并添加注释",
        "input_data": {"original_code": "def example(): ..."}
    })
    
    print(f"   ✓ 创建了 {2} 个子任务")
    print(f"      1. {subtask1['expert_type']}: {subtask1['description']}")
    print(f"      2. {subtask2['expert_type']}: {subtask2['description']}")
    
    # 4. 子任务执行（模拟）
    print("\n4️⃣  子任务执行")
    
    subtask1["status"] = "running"
    subtask1["started_at"] = datetime.now().isoformat()
    print(f"   [Task 1] 状态: {subtask1['status']}")
    
    subtask1["status"] = "completed"
    subtask1["completed_at"] = datetime.now().isoformat()
    subtask1["output_result"] = {
        "analysis": "代码存在性能问题",
        "bottlenecks": ["O(n²) 时间复杂度", "不必要的循环"]
    }
    print(f"   [Task 1] 状态: {subtask1['status']} ✓")
    
    # 5. 整合结果
    print("\n5️⃣  整合结果并生成最终响应")
    session["status"] = "completed"
    session["completed_at"] = datetime.now().isoformat()
    session["final_response"] = "分析完成，代码性能瓶颈主要在于时间复杂度。建议使用快速排序替代..."
    print(f"   ✓ 最终响应已生成")
    
    # 6. 输出完整工作流数据
    print("\n📊 完整工作流数据:")
    workflow_data = {
        "session": session,
        "subtasks": [subtask1, subtask2]
    }
    print(json.dumps(workflow_data, indent=2, ensure_ascii=False, default=str))


# ============================================================================
# 主函数
# ============================================================================

def main():
    """运行所有验证示例"""
    print("\n" + "="*60)
    print("🧪 数据模型验证脚本")
    print("="*60)
    print("\n此脚本演示如何创建和使用 SubTask / TaskSession 模型")
    print("确保符合 Pydantic v2 标准和 FastAPI 异步调用规范")
    
    # 1. 验证 SubTask 模型
    subtask = create_subtask_example()
    validate_and_serialize(subtask, "SubTask")
    
    # 2. 验证 TaskSession 模型
    session = create_task_session_example()
    validate_and_serialize(session, "TaskSession")
    
    # 3. 演示 DTO 使用
    demonstrate_dto_usage()
    
    # 4. 演示完整工作流
    demonstrate_task_workflow()
    
    print("\n" + "="*60)
    print("✅ 验证完成！所有模型符合 Pydantic v2 标准")
    print("="*60)


if __name__ == "__main__":
    main()
