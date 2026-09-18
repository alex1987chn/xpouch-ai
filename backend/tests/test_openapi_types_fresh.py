"""api.generated.ts 新鲜度闸门（与 test_enums_ts_fresh / test_event_types_ts_fresh 同构）。

REST 响应的真相源是路由上的 response_model；本测试锁住「生成物必须与
当前 app 的 OpenAPI schema 一致」。改了任何响应模型而没重新生成，这里红。

实现说明：检查以**子进程**方式运行（python -m scripts.gen_openapi_types
--check）。该检查需要 import main（重导入）并拉起 node 子进程生成——
隔离在子进程里做，避免重导入与进程派生扰动同进程内其它对时序敏感的
asyncio 测试（实测全量跑时曾把 producer 断连回归挤挂）。

注意：首次运行会由脚本下载钉版工具（openapi-typescript 7.13.0 +
typescript 6.0.3，装进系统临时目录的隔离目录），之后走缓存离线可用。
"""

import subprocess
import sys
from pathlib import Path


def test_api_types_fresh():
    result = subprocess.run(
        [sys.executable, "-m", "scripts.gen_openapi_types", "--check"],
        cwd=Path(__file__).resolve().parent.parent,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        "frontend/src/types/api.generated.ts 已过期："
        "改了 response_model / 路由后须跑 just gen-openapi-types 重新生成。\n"
        f"{result.stdout}{result.stderr}"
    )
