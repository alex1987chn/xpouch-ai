"""
日志工具模块

统一日志配置与请求/运行上下文贯穿：

- setup_logging()：幂等配置 root logger。LOG_FORMAT=text（默认，人类可读）
  或 json（生产/机器解析友好，每行一个 JSON 对象）；LOG_LEVEL 控制级别，
  默认 INFO。容器内由 uvicorn 直启（没有 basicConfig），不显式配置的话
  root 无 handler，应用的 INFO 日志会被整体丢弃——启动路径必须调用。
- request_id / run_id 通过 contextvars 贯穿：请求上下文中间件负责
  request_id，run 流式生成器负责 run_id；所有日志行自动携带
  [rid=..] [run=..]，无需各处手工传参。
"""

import contextvars
import json as _json
import logging
import os
import sys
import uuid

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
run_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("run_id", default="-")


def new_request_id() -> str:
    """短请求 ID：12 位 hex 足够关联一次请求，且不破坏日志可读性。"""
    return uuid.uuid4().hex[:12]


def set_request_id(rid: str):
    return request_id_var.set(rid)


def reset_request_id(token) -> None:
    request_id_var.reset(token)


def set_run_id(run_id: str):
    return run_id_var.set(str(run_id))


class _ContextFilter(logging.Filter):
    """把 contextvar 中的请求/运行 ID 注入每条日志记录。"""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.run_id = run_id_var.get()
        return True


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "rid": record.request_id,
            "run": record.run_id,
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return _json.dumps(payload, ensure_ascii=False)


def setup_logging() -> None:
    """幂等配置 root logger；多次调用（测试 / 多入口）只生效一次。"""
    root = logging.getLogger()
    if getattr(root, "_xpouch_logging_configured", False):
        return

    level = os.getenv("LOG_LEVEL", "INFO").upper()
    log_format = os.getenv("LOG_FORMAT", "text").lower()

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(_ContextFilter())
    if log_format == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-7s [rid=%(request_id)s run=%(run_id)s] %(name)s: %(message)s"
            )
        )

    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    root._xpouch_logging_configured = True  # type: ignore[attr-defined]


def get_logger(name: str) -> logging.Logger:
    """
    获取一个日志记录器

    Args:
        name: 记录器名称，通常使用 __name__

    Returns:
        Logger 实例
    """
    return logging.getLogger(name)


# 兼容旧代码的导出方式
logger = get_logger(__name__)
