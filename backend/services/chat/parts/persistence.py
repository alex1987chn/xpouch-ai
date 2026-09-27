"""StreamService 的落库与状态助手（批次 1 拆出，2026-09-27）。

职责：复杂模式结果落库、任务/产物收集、计划与运行状态写路径。
全部方法以 self（StreamService）为第一参数，经 Mixin 组合；
真实 DB 交互一律 `await`（全异步纪律见 AGENTS.md）。
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage
from sqlmodel import select

from models import AgentRun, ExecutionPlan, RunStatus, Thread
from models.enums import GraphTaskStatus, TaskStatus, to_task_status
from utils.logger import logger
from utils.time import utc_now


class PersistenceMixin:
    """落库与状态写路径（StreamService 组合件）。"""

    async def _save_langgraph_result(
        self,
        thread_id: str,
        thread: Thread,
        user_message: str,
        last_message: Any,
        router_decision: str,
        task_list: list[dict],
        expert_artifacts: dict,
        message_id: str,
        run_id: str | None = None,
        thinking_text: str | None = None,
    ):
        """保存 LangGraph 执行结果"""
        from crud.execution_plan import create_artifacts_batch, get_subtasks_by_execution_plan
        from models import SubTask, TaskStatus

        # 复杂模式：创建 ExecutionPlan 和 SubTasks
        if router_decision == "complex":
            await self.thread_service.update_thread_agent_type(thread_id, "ai")
            execution_plan = await self._get_latest_execution_plan(thread_id)
            if execution_plan is None:
                logger.warning("[StreamService] complex 结果保存时未找到 ExecutionPlan，跳过落库")
                return

            execution_plan.run_id = execution_plan.run_id or run_id
            execution_plan.user_query = execution_plan.user_query or user_message
            execution_plan.status = TaskStatus.COMPLETED
            # final_response 由 aggregator 写入（= 用户看到的聚合综述）。
            # 这里只在为空时兜底，**不得覆盖**——state 里的最后一条消息在复杂模式下
            # 是最后一个专家的原始产出，覆盖会让计划正文变成专家草稿而非综述。
            if not execution_plan.final_response:
                execution_plan.final_response = last_message.content
            execution_plan.updated_at = utc_now()
            execution_plan.completed_at = utc_now()
            self.db.add(execution_plan)
            await self.db.flush()

            # 更新 thread
            thread.execution_plan_id = execution_plan.id
            self.db.add(thread)

            existing_subtasks = {
                subtask.id: subtask
                for subtask in await get_subtasks_by_execution_plan(self.db, execution_plan.id)
            }

            # 保存 SubTasks
            for subtask in task_list:
                db_subtask = existing_subtasks.get(subtask["id"])
                if db_subtask is None:
                    db_subtask = SubTask(
                        id=subtask["id"],
                        expert_type=subtask["expert_type"],
                        description=subtask["description"],
                        input_data=subtask.get("input_data", {}),
                        execution_plan_id=execution_plan.id,
                        created_at=utc_now(),
                    )

                db_subtask.expert_type = subtask["expert_type"]
                db_subtask.description = subtask["description"]
                db_subtask.input_data = subtask.get("input_data", {})
                db_subtask.status = to_task_status(subtask.get("status", GraphTaskStatus.COMPLETED))
                db_subtask.output_result = subtask.get("output_result")
                # 时刻字段**只在这两个来源没写过时才补**（`or` 语义，不能直接赋值）：
                # 真实的 started_at/completed_at/duration_ms 由执行期写入（节点开始时的
                # async_mark_subtask_running + 收尾的 save_expert_execution_result），
                # 而这里回填的是图状态里的值——它通常根本没有这两个键，直接赋值会把
                # 已写好的时刻**清成 NULL**（这正是 started_at 长期为空的第二个原因）。
                db_subtask.started_at = subtask.get("started_at") or db_subtask.started_at
                db_subtask.completed_at = subtask.get("completed_at") or db_subtask.completed_at
                db_subtask.duration_ms = subtask.get("duration_ms") or db_subtask.duration_ms
                db_subtask.updated_at = utc_now()
                self.db.add(db_subtask)
                await self.db.flush()

                # 🔥 保存 artifacts（使用 task_id 匹配）
                task_id = subtask.get("id")
                logger.info(
                    f"[StreamService] 尝试保存 artifacts: task_id={task_id}, expert_artifacts keys={list(expert_artifacts.keys())}"
                )

                if task_id and task_id in expert_artifacts:
                    try:
                        logger.info(
                            f"[StreamService] 找到 artifacts: {len(expert_artifacts[task_id])} 个"
                        )
                        await create_artifacts_batch(
                            self.db, db_subtask.id, expert_artifacts[task_id]
                        )
                        logger.info("[StreamService] ✅ artifacts 保存成功")
                    except Exception as e:
                        # rollback 必需：create_artifacts_batch 内部会 commit，失败后
                        # 会话可能残留不可用事务态；本函数随后还要写助手消息，
                        # 不清理会以 PendingRollbackError 把局部失败放大成整轮保存失败
                        await self.db.rollback()
                        logger.error(
                            "[StreamService] 保存 artifacts 失败（该任务产物缺失，"
                            "其余保存流程继续）: %s",
                            e,
                            exc_info=True,
                        )
                else:
                    logger.warning(
                        f"[StreamService] ⚠️ task_id={task_id} 在 expert_artifacts 中未找到"
                    )

        if router_decision == "complex":
            # 复杂模式的**唯一写入者**是 aggregator 节点：它是图内最后一个节点，
            # 无条件写入助手消息（save_assistant_message_sync，带请求侧 message_id）
            # 与计划的 final_response。
            #
            # 因此这里必须提前返回、不重复保存，否则同一轮会出现**两条内容不同的
            # 助手消息**——一条是用户看到的聚合综述，一条是 state 里最后一个专家的
            # 原始产出；并且会把计划的 final_response 覆盖成专家原始产出。
            # 生产前端恒走流式 + 审批暂停，所以这条路径平时走不到；但 sync 公开
            # API 路径（handle_langgraph_sync）会走到，属真实可触发的重复写入。
            return

        # 保存 AI 消息（简单模式；思考过程优先用原生 reasoning_content，
        # 无则回退 <think> 标签解析）
        from utils.thinking_parser import build_thinking_data

        thinking_data = build_thinking_data(thinking_text) if thinking_text else None
        await self.thread_service.save_assistant_message(
            thread_id=thread_id,
            content=last_message.content,
            message_id=message_id,
            thinking_data=thinking_data,
        )

    async def _get_complex_result_persistence_error(
        self,
        *,
        thread_id: str,
        last_message: Any,
        task_list: list[dict],
    ) -> str | None:
        """在复杂模式持久化前做主流程校验，避免把半残状态误标为完成。"""
        if not isinstance(last_message, AIMessage):
            return "复杂模式未产出有效助手消息，已拒绝将当前结果落库为 completed"
        if not task_list:
            return "复杂模式未收集到任何任务结果，已拒绝将当前结果落库为 completed"
        if await self._get_latest_execution_plan(thread_id) is None:
            return "复杂模式未找到已创建的 ExecutionPlan，已拒绝写入错误兜底结果"
        return None

    async def _update_thread_mode(self, thread_id: str, mode: str, run_id: str | None = None):
        """更新线程模式和运行实例模式"""
        thread = await self.db.get(Thread, thread_id)
        if thread:
            thread.thread_mode = mode
            self.db.add(thread)

        # 🔥 同时更新 AgentRun.mode，确保前端能正确显示 simple/complex
        if run_id:
            agent_run = await self.db.get(AgentRun, run_id)
            if agent_run:
                agent_run.mode = mode
                agent_run.updated_at = utc_now()
                self.db.add(agent_run)

        await self.db.commit()

    def _collect_execution_results(
        self, token, collected_tasks: dict[str, dict], expert_artifacts: dict
    ):
        """收集 LangGraph 执行结果（从 **任务产物** 读取）。

        产物通道 `task_outcomes` 是执行分支的唯一出口（见 `agents/task_outcome.py`），
        每个任务恰好一份、键为依赖空间 key。这里的写入按 **db uuid upsert**：
        一个产物可能在两个事件里出现（执行分支节点自身、以及包着它的子图节点），
        也可能被重跑覆盖——按 key 覆盖天然幂等，不再依赖「最后一条事件赢」。
        """
        # 🔥 修复：跳过非字典类型的 token
        if not isinstance(token, dict):
            return

        event = token.get("event", "")

        if event == "on_chain_end":
            output = token.get("data", {}).get("output", {}) or {}
            if not (output and isinstance(output, dict)):
                return
            outcomes = output.get("task_outcomes")
            if not isinstance(outcomes, dict) or not outcomes:
                return

            for outcome in outcomes.values():
                if not isinstance(outcome, dict):
                    continue
                task_id = outcome.get("db_uuid") or outcome.get("task_key")
                collected_tasks[task_id] = {
                    "id": task_id,
                    "expert_type": outcome.get("expert_type"),
                    "status": outcome.get("status"),
                    "description": outcome.get("description", ""),
                    "output_result": outcome.get("output"),
                    "input_data": outcome.get("input_data", {}),
                    "started_at": outcome.get("started_at"),
                    "completed_at": outcome.get("completed_at"),
                    "artifact": outcome.get("artifact"),
                }

                # 收集 artifacts（同一 artifact_id 只收一次：产物会被两个事件携带）
                artifact_data = outcome.get("artifact")
                if task_id and artifact_data:
                    bucket = expert_artifacts.setdefault(task_id, [])
                    artifact_id = artifact_data.get("artifact_id")
                    if not any(item.get("artifact_id") == artifact_id for item in bucket):
                        bucket.append(artifact_data)
                        logger.info(
                            "[_collect_execution_results] ✅ artifacts 已收集: task_id=%s, count=%d",
                            task_id,
                            len(bucket),
                        )

    # ============================================================================
    # 公共流式方法（供 RecoveryService 复用）
    # ============================================================================

    async def _get_latest_execution_plan(self, thread_id: str) -> ExecutionPlan | None:
        """获取线程最新的 ExecutionPlan（单一实现在 crud.execution_plan）。"""
        from crud.execution_plan import get_latest_execution_plan_by_thread

        return await get_latest_execution_plan_by_thread(self.db, thread_id)

    async def _get_execution_plan_by_run(self, run_id: str) -> ExecutionPlan | None:
        """按 run_id 获取 ExecutionPlan（单一实现在 crud.execution_plan）。"""
        from crud.execution_plan import get_execution_plan_by_run

        return await get_execution_plan_by_run(self.db, run_id)

    async def _update_agent_run_status(
        self,
        run_id: str,
        status: RunStatus,
        *,
        current_node: str | None = None,
    ) -> None:
        """更新 AgentRun 状态（写路径经 to_thread；单一实现在 run_lifecycle）。"""
        from services.chat.run_lifecycle import update_run_status

        await update_run_status(
            self.db,
            run_id,
            status,
            current_node=current_node,
        )

    async def _mark_agent_run_failed(
        self,
        run_id: str,
        error_message: str,
        *,
        error_code: str | None = None,
    ) -> None:
        """将 AgentRun 标记为失败（写路径经 to_thread；单一实现在 run_lifecycle）。"""
        from services.chat.run_lifecycle import mark_run_failed

        await mark_run_failed(
            self.db,
            run_id,
            error_message,
            error_code=error_code,
        )

    async def _get_plan_version(self, thread_id: str) -> int:
        """获取当前线程的计划版本号（乐观锁）"""
        execution_plan = (
            await self.db.exec(
                select(ExecutionPlan)
                .where(ExecutionPlan.thread_id == thread_id)
                .order_by(ExecutionPlan.created_at.desc())
            )
        ).first()
        return int(execution_plan.plan_version) if execution_plan else 1

    async def _update_execution_plan_status(self, thread_id: str, status: TaskStatus) -> None:
        """
        更新 ExecutionPlan 状态（写路径经 to_thread，避免阻塞事件循环）

        Args:
            thread_id: 线程ID
            status: 新状态（TaskStatus 枚举）
        """

        async def _write() -> None:
            execution_plan = (
                await self.db.exec(
                    select(ExecutionPlan)
                    .where(ExecutionPlan.thread_id == thread_id)
                    .order_by(ExecutionPlan.created_at.desc())
                )
            ).first()

            if execution_plan:
                execution_plan.status = status
                execution_plan.updated_at = utc_now()
                self.db.add(execution_plan)
                await self.db.commit()
                logger.info(
                    f"[StreamService] ExecutionPlan {execution_plan.id} 状态更新为 {status}"
                )

        await _write()

    async def _apply_updated_plan(self, graph, config: dict, updated_plan: list[dict]):
        """把用户在审批页编辑过的计划合并进图状态。

        合并语义（业务规则，不属于脚手架）：
        - 已完成的任务：整条沿用当前状态（保留 `output_result` / Commander `task_id`）
        - 未完成/新增任务：采用前端提交的内容，但保留已有输出与 task_id
        - 依赖清理：指向已删除任务的 `depends_on` 条目剔除；空则置 None
        - 下一个该跑谁**不在这里算**：由 `agents/plan_waves.py` 按依赖判定（C2 起）

        续跑由调用方的 `Command(resume=...)` 触发，本方法只负责状态合并，
        不再伪造 `HumanMessage`（那是静态中断时代的权宜手段）。
        """
        # 合并状态，不要完全替换
        current_state = await graph.aget_state(config)
        current_values = current_state.values
        current_task_list = current_values.get("task_list", [])
        current_expert_results = current_values.get("expert_results", [])

        # 创建任务 ID 到当前任务的映射（键用 db id：前端提交的 updated_plan
        # 里 `id` 就是 db uuid，与审批卡下发的 current_plan 一致）
        current_task_map = {task.get("id"): task for task in current_task_list}

        # 清理依赖关系并合并状态
        #
        # ⚠️ 依赖集合必须用 **commander 语义 id（`task_id`）**，不能用 db id：
        # `depends_on` 里存的是 "task_1" 这类 commander id，而 `id` 是数据库主键。
        # 二者不同源（「双身份」）。且前端回传的 updated_plan（TaskInfo 形态）
        # **没有 task_id 字段**——直接 `task.get("task_id") or task.get("id")` 会
        # 全部落回 db uuid，语义依赖 ∩ uuid 集合恒为空 → 依赖被清空 → 下游任务
        # 失去上游产出注入（实测 writer 报「task_1 检索报告缺失」）。所以必须先
        # 经 current_task_map 把 uuid 映射回语义 id，映射不到（用户新增的任务）
        # 才用其自身 id。
        def _semantic_key(task: dict) -> str:
            existing = current_task_map.get(task.get("id"))
            return str((existing or {}).get("task_id") or task.get("task_id") or task.get("id"))

        kept_task_ids = {_semantic_key(task) for task in updated_plan}
        merged_plan = []

        for task in updated_plan:
            task_id = task.get("id")
            # 🔥 关键：从当前状态查找对应的任务，保留 task_id (Commander ID)
            existing_task = current_task_map.get(task_id)

            # 如果任务已完成，保留完整状态（包括 output_result 和 task_id）
            if existing_task and existing_task.get("status") == "completed":
                merged_task = dict(existing_task)
            else:
                # 新任务或待执行任务，使用前端数据但保留已有输出
                merged_task = dict(task)
                if existing_task:
                    # 🔥🔥🔥 关键修复：保留 task_id (Commander ID) 和 output_result
                    merged_task["task_id"] = existing_task.get("task_id") or task.get("task_id")
                    merged_task["output_result"] = existing_task.get("output_result")
                    merged_task["status"] = existing_task.get(
                        "status", task.get("status", "pending")
                    )

            # 🔥 兜底：确保 task_id 字段存在（如果前端没传，从现有状态复制）
            if not merged_task.get("task_id") and existing_task:
                merged_task["task_id"] = existing_task.get("task_id")

            # 清理依赖关系
            if merged_task.get("depends_on"):
                cleaned_deps = [dep for dep in merged_task["depends_on"] if dep in kept_task_ids]
                merged_task["depends_on"] = cleaned_deps if cleaned_deps else None

            merged_plan.append(merged_task)

        # 更新 LangGraph 状态（保留已完成任务的结果）
        # 计划的 approve 合并语义：按 id 保留已完成任务的 output_result / task_id、
        # 清理指向已删除任务的依赖。
        #
        # 不再伪造 HumanMessage 触发续跑：那是在静态中断（interrupt_before）下
        # 让图「动起来」的权宜手段，会把一条假用户消息写进会话历史。现在由
        # `Command(resume=...)` 触发续跑，图从断点继续，无需任何伪造输入。
        #
        # 不再重算任务游标（C2 已删除 current_task_index）：改完计划后跑哪些任务
        # 由 `plan_waves` 按依赖重新判定——「下一个该跑谁」只有一处答案。
        state_update = {
            "task_list": merged_plan,
            "expert_results": current_expert_results,  # 保留已有结果，而不是清空
        }
        await graph.aupdate_state(config, state_update)

    # ============================================================================
    # 事件转换和构建
    # ============================================================================
