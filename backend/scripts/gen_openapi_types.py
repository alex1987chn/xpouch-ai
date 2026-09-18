"""REST API 契约类型生成：FastAPI app → openapi.json → TypeScript。

真相源 = FastAPI 路由上声明的 response_model（T2 阶段一已全量补齐）；
生成物 = frontend/src/types/api.generated.ts。与 gen_enums_ts /
gen_event_types_ts 同构：generate()/check()/--check + 新鲜度 pytest 闸门。

工具链说明：openapi-typescript 需要 typescript 作 peer 才能运行。本机或 CI
若设置 `legacy-peer-deps=true`（常见的历史 workaround），npx 不会自动安装
peer，直接 npx 会以 ERR_MODULE_NOT_FOUND 失败。因此这里把两个包作为
**直接依赖**装进系统临时目录下的隔离工具目录（目录名含版本指纹，装过即
复用；升级版本自动换新目录重装），再用 node 直调其 CLI——不依赖任何
npm 配置，也不进 package.json。
"""

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
OUTPUT_PATH = BACKEND_DIR.parent / "frontend" / "src" / "types" / "api.generated.ts"

# 生成器与其 peer 的钉版：任一升级都可能改变输出，须显式重生成
OPENAPI_TYPESCRIPT_VERSION = "7.13.0"
TYPESCRIPT_VERSION = "6.0.3"

_TOOL_NAME = "xpouch-openapi-types"
_TOOL_KEY = f"{OPENAPI_TYPESCRIPT_VERSION}-{TYPESCRIPT_VERSION}"
_TOOL_DIR = (
    Path(tempfile.gettempdir())
    / f"{_TOOL_NAME}-{hashlib.sha1(_TOOL_KEY.encode()).hexdigest()[:10]}"
)


def _which(executable: str) -> str:
    path = shutil.which(executable)
    if not path:
        print(f"需要 {executable}（GitHub runner 自带；本机请安装 Node.js）", file=sys.stderr)
        raise SystemExit(1)
    return path


def _ensure_cli() -> Path:
    """返回 openapi-typescript 的 CLI 入口；工具目录缺失时以直接依赖方式安装。"""
    cli = _TOOL_DIR / "node_modules" / "openapi-typescript" / "bin" / "cli.js"
    if cli.exists():
        return cli

    _TOOL_DIR.mkdir(parents=True, exist_ok=True)
    package_json = _TOOL_DIR / "package.json"
    package_json.write_text(
        json.dumps(
            {
                "name": _TOOL_NAME,
                "private": True,
                "dependencies": {
                    "openapi-typescript": OPENAPI_TYPESCRIPT_VERSION,
                    "typescript": TYPESCRIPT_VERSION,
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    result = subprocess.run(
        [_which("npm"), "install", "--prefix", str(_TOOL_DIR), "--no-audit", "--no-fund"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        raise SystemExit(f"工具目录安装失败（{_TOOL_DIR}）")
    return cli


def generate() -> str:
    """导出当前 app 的 OpenAPI schema 并生成 TS 文本（行尾统一为 LF）。"""
    from main import app  # 延迟导入：带出全量路由与 response_model 契约

    cli = _ensure_cli()
    spec = app.openapi()
    with tempfile.TemporaryDirectory() as tmp:
        spec_path = Path(tmp) / "openapi.json"
        spec_path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
        out_path = Path(tmp) / "api.generated.ts"
        result = subprocess.run(
            [_which("node"), str(cli), str(spec_path), "-o", str(out_path)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(result.stdout, file=sys.stderr)
            print(result.stderr, file=sys.stderr)
            raise SystemExit(f"openapi-typescript 生成失败（exit {result.returncode}）")
        return out_path.read_text(encoding="utf-8").replace("\r\n", "\n")


def check() -> int:
    """生成物与仓库文件比对：一致返回 0，否则打印修复提示返回 1。"""
    current = ""
    if OUTPUT_PATH.exists():
        current = OUTPUT_PATH.read_text(encoding="utf-8").replace("\r\n", "\n")
    generated = generate()
    if generated == current:
        return 0
    print(f"{OUTPUT_PATH} 已过期：API 契约变更后未重新生成。", file=sys.stderr)
    print("修复：just gen-openapi-types", file=sys.stderr)
    return 1


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="只校验不写盘（CI/pytest 用）")
    args = parser.parse_args(argv)

    if args.check:
        return check()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(generate(), encoding="utf-8", newline="\n")
    print(f"已生成 {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
