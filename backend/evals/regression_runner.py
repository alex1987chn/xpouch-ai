"""
轻量回归资产运行器。

目标：
- 不引入复杂评测平台
- 让仓库内存在可执行、可比较的最小回归资产
- 优先覆盖 Router、Commander 结构、run timeline 三类高价值对象
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ASSETS_PATH = Path(__file__).resolve().parent / "assets" / "regression_cases.json"


def load_regression_cases(asset_path: Path | None = None) -> dict[str, Any]:
    """加载回归样例文件。"""
    path = asset_path or ASSETS_PATH
    return json.loads(path.read_text(encoding="utf-8"))


def validate_router_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
    """验证 Router 确定性 complex 兜底样例。"""
    from agents.nodes.router import _get_forced_complex_reason

    failures: list[dict[str, Any]] = []
    for case in cases:
        actual_reason = _get_forced_complex_reason(case["query"])
        expected_reason = case["expected_forced_reason"]
        if actual_reason != expected_reason:
            failures.append(
                {
                    "case_id": case["id"],
                    "expected_forced_reason": expected_reason,
                    "actual_forced_reason": actual_reason,
                }
            )

    return {"name": "router", "total": len(cases), "failed": len(failures), "failures": failures}


def _validate_commander_dependencies(task_ids: set[str], tasks: list[Any]) -> list[str]:
    errors: list[str] = []
    for task in tasks:
        for dependency in task.dependencies:
            if dependency not in task_ids:
                errors.append(f"task {task.id} 依赖了不存在的任务 {dependency}")
    return errors


def validate_commander_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
    """验证 Commander 输出结构样例。"""
    from agents.nodes.commander import ExecutionPlan

    failures: list[dict[str, Any]] = []
    for case in cases:
        case_errors: list[str] = []
        plan = ExecutionPlan.model_validate(case["output"])
        task_ids = [task.id for task in plan.tasks]

        if len(plan.tasks) < case["expected"]["min_tasks"]:
            case_errors.append("任务数少于预期最小值")
        if plan.estimated_steps < case["expected"]["min_estimated_steps"]:
            case_errors.append("estimated_steps 少于预期最小值")
        if len(set(task_ids)) != len(task_ids):
            case_errors.append("任务 ID 存在重复")
        if case["expected"].get("require_non_empty_strategy") and not plan.strategy.strip():
            case_errors.append("strategy 为空")

        case_errors.extend(_validate_commander_dependencies(set(task_ids), plan.tasks))

        if case_errors:
            failures.append({"case_id": case["id"], "errors": case_errors})

    return {"name": "commander", "total": len(cases), "failed": len(failures), "failures": failures}


def _contains_subsequence(sequence: list[str], subsequence: list[str]) -> bool:
    if not subsequence:
        return True
    seq_index = 0
    for item in subsequence:
        while seq_index < len(sequence) and sequence[seq_index] != item:
            seq_index += 1
        if seq_index >= len(sequence):
            return False
        seq_index += 1
    return True


def validate_timeline_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
    """验证关键运行事件顺序样例。"""
    failures: list[dict[str, Any]] = []
    for case in cases:
        event_types = case["event_types"]
        required_order = case["must_include_in_order"]
        if not _contains_subsequence(event_types, required_order):
            failures.append(
                {
                    "case_id": case["id"],
                    "required_order": required_order,
                    "event_types": event_types,
                }
            )

    return {"name": "timeline", "total": len(cases), "failed": len(failures), "failures": failures}


def run_all_regression_checks(asset_path: Path | None = None) -> dict[str, Any]:
    """执行所有回归样例校验。"""
    cases = load_regression_cases(asset_path)
    checks = [
        validate_router_cases(cases.get("router_cases", [])),
        validate_commander_cases(cases.get("commander_cases", [])),
        validate_timeline_cases(cases.get("timeline_cases", [])),
    ]
    return {
        "checks": checks,
        "summary": {
            "total_checks": len(checks),
            "total_cases": sum(check["total"] for check in checks),
            "total_failed": sum(check["failed"] for check in checks),
        },
    }


if __name__ == "__main__":
    result = run_all_regression_checks()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(1 if result["summary"]["total_failed"] else 0)
