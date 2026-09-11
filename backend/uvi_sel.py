"""最小对照启动器：仅设置 Windows Selector 策略，交给 uvicorn 标准路径管理事件循环。

用于诊断 run.py 手动 new_event_loop/run_until_complete 注入方式与
某库（疑 langchain/langgraph 的异步回调调度）在 Py3.13+Windows 下的
兼容性问题。若此启动器下异步 LLM 调用恢复正常，则根因为 loop 注入
方式，应改造 run.py 而不是把节点改同步。
"""

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=3002, loop="asyncio", access_log=False)
