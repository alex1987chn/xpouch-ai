#!/usr/bin/env python3
"""
直接测试 planner 节点
"""
import sys
sys.path.insert(0, '.')

import asyncio
from agents.graph import commander_graph
from langchain_core.messages import HumanMessage

async def test_planner():
    initial_state = {
        "messages": [HumanMessage(content="帮我写一个Python爬虫")],
        "task_list": [],
        "current_task_index": 0,
        "strategy": "",
        "expert_results": [],
        "final_response": ""
    }
    
    print("=== 开始测试 ===\n")
    
    # 执行并获取最终结果
    result = await commander_graph.ainvoke(initial_state)
    
    print(f"\n=== 最终结果 ===")
    print(f"task_list: {result.get('task_list', [])}")
    print(f"strategy: {result.get('strategy', '')[:100]}...")
    print(f"router_decision: {result.get('router_decision', '')}")

if __name__ == "__main__":
    asyncio.run(test_planner())
