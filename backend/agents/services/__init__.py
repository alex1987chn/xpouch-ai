"""
Agents Services 模块

提供专家管理、任务管理等核心服务
"""

from .expert_manager import (
    get_expert_config,
    get_expert_prompt,
    load_all_experts,
    get_expert_prompt_cached,
    get_expert_config_cached,
    refresh_cache,
    force_refresh_all,
    get_all_expert_list,
    format_expert_list_for_prompt,
)

from .task_manager import (
    get_or_create_task_session,
    complete_task_session,
    save_aggregator_message,
    update_subtask_status,
    get_subtask_by_id,
)

__all__ = [
    # Expert Manager
    "get_expert_config",
    "get_expert_prompt",
    "load_all_experts",
    "get_expert_prompt_cached",
    "get_expert_config_cached",
    "refresh_cache",
    "force_refresh_all",
    "get_all_expert_list",
    "format_expert_list_for_prompt",
    # Task Manager
    "get_or_create_task_session",
    "complete_task_session",
    "save_aggregator_message",
    "update_subtask_status",
    "get_subtask_by_id",
]
