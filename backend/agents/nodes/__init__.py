"""
LangGraph 节点模块

包含所有工作流节点的实现：
- router: 意图识别节点
- commander: 任务规划节点
- plan_approval: 计划审批节点（HITL 人机分界点，interrupt 原生暂停）
- wave_scheduler: 波次调度（wave_dispatch 扇出 + task_join 落状态；C2 起取代 dispatcher）
- aggregator: 结果聚合节点
- generic: 专家执行节点（跑在 expert_worker 子图内，一个分支一个任务）

v3.1 重构：从 graph.py 拆分节点到独立模块
C2（2026-09-13）：dispatcher 随 current_task_index 游标一并删除——「专家是否存在」
的检查并入执行子图（它本来就要加载专家配置），「下一个跑哪个」由波次判定接管
"""

# 从各节点模块导入
from agents.nodes.aggregator import aggregator_node
from agents.nodes.commander import commander_node
from agents.nodes.generic import expert_worker_node
from agents.nodes.plan_approval import plan_approval_node
from agents.nodes.router import direct_reply_node, router_node
from agents.nodes.wave_scheduler import task_join_node, wave_dispatch_node

__all__ = [
    "router_node",
    "direct_reply_node",
    "commander_node",
    "plan_approval_node",
    "wave_dispatch_node",
    "task_join_node",
    "aggregator_node",
    "expert_worker_node",
]
