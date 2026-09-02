"""
XPouch Backend 启动脚本（Windows 兼容版 + 显式 Loop 注入）

核心修复：
1. 强制创建 SelectorEventLoop，完全绕过 Uvicorn 的 Loop 初始化逻辑
2. 将父目录添加到 sys.path，支持绝对导入（如 from backend.config import）
"""

import asyncio
import logging
import os
import pathlib
import signal
import sys

# 配置日志
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# 🔥 修复：将项目根目录添加到 sys.path，支持绝对导入
# 这样 from backend.config import ... 就能正确解析了
backend_dir = pathlib.Path(__file__).parent
project_root = backend_dir.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
    logger.info(f"[Path Setup] Added to sys.path: {project_root}")

PORT = int(os.getenv("PORT", 3002))
HOST = os.getenv("HOST", "0.0.0.0")


def kill_process_on_port(port):
    """查找并终止占用指定端口的进程"""
    import subprocess

    try:
        # 使用 netstat 查找占用端口的进程（不经 shell，输出在 Python 内过滤；
        # 中文 Windows 的 netstat 输出为 GBK，errors="ignore" 避免 UTF-8 解码炸掉读取线程）
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            errors="ignore",
        )

        if result.returncode == 0 and result.stdout:
            lines = result.stdout.strip().split("\n")
            port_marker = f":{port} "
            for line in lines:
                if "LISTENING" in line and port_marker in line:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        pid = parts[-1]
                        if not pid.isdigit():
                            continue
                        try:
                            subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True)
                            logger.info(f"[Cleanup] Killed process {pid} on port {port}")
                        except Exception:
                            pass
    except Exception as e:
        logger.warning(f"[Cleanup] {e}")


def start_server():
    """
    强制创建一个 SelectorEventLoop，并在其中运行 Uvicorn。
    """
    from uvicorn import Config, Server

    # 🔥 启动前清理端口
    logger.info(f"[Cleanup] Checking port {PORT}...")
    kill_process_on_port(PORT)

    # 稍微等待确保端口释放
    import time

    time.sleep(0.5)

    # 1. 设置策略
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        logger.info(
            f"[WinFix] Event Loop Policy: {asyncio.get_event_loop_policy().__class__.__name__}"
        )

    # 2. 显式创建 Loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    logger.info(f"[WinFix] Active Loop: {loop.__class__.__name__}")

    # 3. 配置 Uvicorn
    config = Config("main:app", host=HOST, port=PORT, reload=False, loop="asyncio")
    server = Server(config)

    # 4. 信号处理
    def handle_signal(sig, frame):
        logger.info("\n[Signal] Shutdown signal received...")
        asyncio.run_coroutine_threadsafe(server.shutdown(), loop)

    try:
        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)
    except (ValueError, OSError):
        pass  # Windows 可能不支持 SIGTERM

    # 5. 启动 Server
    logger.info(f"Starting Uvicorn on {HOST}:{PORT}...")
    logger.info("Press Ctrl+C to stop\n")

    try:
        loop.run_until_complete(server.serve())
    except KeyboardInterrupt:
        logger.info("\n[Main] KeyboardInterrupt, shutting down...")
    finally:
        try:
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.close()
            logger.info("[Main] Cleanup complete")
        except Exception as e:
            logger.error(f"[Main] Cleanup error: {e}")


if __name__ == "__main__":
    try:
        from watchfiles import run_process
    except ImportError:
        logger.error("Error: 'watchfiles' not found. Run: uv add watchfiles")
        sys.exit(1)

    logger.info("Starting XPouch Backend (Explicit Loop Mode)...\n")

    try:
        run_process(".", target=start_server)
    except ValueError as e:
        # Windows 下 watchfiles 通过环境变量传递变更列表，一次性变更文件过多会超过
        # 32767 字符上限而崩溃；退化为无热重载直启，保证服务可用
        logger.warning(f"[Watchfiles] 热重载异常（{e}），退化为无热重载模式直接启动")
        start_server()
