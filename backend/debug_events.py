#!/usr/bin/env python3
"""
调试 LangGraph 事件结构
"""
import sys
sys.path.insert(0, '.')

import asyncio
from agents.graph import commander_graph
from langchain_core.messages import HumanMessage

async def debug_events():
    initial_state = {
        "messages": [HumanMessage(content="帮我写一个Python爬虫")],
        "task_list": [],
        "current_task_index": 0,
        "strategy": "",
        "expert_results": [],
        "final_response": ""
    }
    
    print("=== 开始调试事件 ===\n")
    
    event_count = 0
    planner_start = False
    planner_end = False
    
    async for event in commander_graph.astream_events(initial_state, version="v2"):
        event_count += 1
        kind = event["event"]
        name = event.get("name", "")
        tags = event.get("tags", [])
        
        # 跟踪 planner 事件
        if name == "planner":
            if kind == "on_chain_start":
                planner_start = True
                print(f"[FOUND] planner on_chain_start!")
            elif kind == "on_chain_end":
                planner_end = True
                print(f"[FOUND] planner on_chain_end!")
                # 打印 output_data
                output_data = event.get("data", {}).get("output", {})
                print(f"[FOUND] planner output keys: {list(output_data.keys())}")
        
        # 打印所有 on_chain 事件
        if kind in ["on_chain_end", "on_chain_start"]:
            print(f"[{kind}] name='{name}'")
            
        if event_count > 100:
            print(f"\n... 停止（超过100个事件）")
            break
    
    print(f"\n总共 {event_count} 个事件")
    print(f"planner_start: {planner_start}")
    print(f"planner_end: {planner_end}")

if __name__ == "__main__":
    asyncio.run(debug_events())
