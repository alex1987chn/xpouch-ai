# xpouch 目标架构与路线（指导文档）

> 最后更新：2026-09-13
> 读者：未来的维护者（含换模型后的 AI 助手）。**动手前先读完第 0、1、5 节。**
> 作用：方向锚 + 决策记录。**记录被否决的选项与理由，是为了避免重复讨论**——第 5 节列出的方案都已被否决过，不要再提议。

---

## 0. 这份文档解决什么问题

项目从 2026-01 开始，早期依赖版本能力不足，很多机制只能自研。半年后框架补齐了能力，同时产品方向也在演进。这带来两类风险：

1. **在偏离方向上继续偏离**：知道要改，但只换 API 不动布局，产出「用了新 API 但分层照旧」的混合体，比改之前更难懂。
2. **换模型/换人后重复讨论**：每个新助手都会重新提议「用 Temporal 吧」「迁 create_agent 吧」，消耗大量时间。

这份文档固定三件事：**方向（要去哪）、边界（什么必须改/什么坚决不动）、批次（按什么顺序做）**。

---

## 1. 产品与技术形状

**产品**：多用户 AI 工作台。用户在会话里提需求，系统判定 `simple`（直接回复）或 `complex`（拆解成计划 → **人工审批** → 逐任务执行 → 聚合产出），产物落库、可浏览、可分享。

**方向决定（2026-09-13 讨论）**：产品要走 **「多子 agent 并行协作」**——典型场景是「5 步任务里，其中一步是多源检索」：一个步骤内部扇出 N 个来源同时调研，再合并。这不是优化项，是产品主线。因此架构必须支撑**宽计划**（计划里出现可并行的层）。

**现状技术栈**：单实例 uvicorn + PostgreSQL + React SPA（Vite / Tailwind / zustand / TanStack Query），编排用 LangGraph（手写 StateGraph，非 `create_agent`）。

---

## 2. 问题诊断：不是 LangGraph 用法，是三处职责渗透

疼痛的根源集中在三条缝上，与具体框架无关：

1. **编排与生命周期纠缠**：图节点直接写库（`commander_node` 创建 ExecutionPlan/SubTasks）；反过来，run 的存活状态靠 `last_heartbeat_at` + 清理循环 + 活跃互斥 + in-flight 去重四处启发式拼出来。
2. **计划的三重真相**：同一个「任务」有四套形状（`commander.Task` / `SubTaskCreate` / `TaskInfo` / 图状态 dict），同一字段三个名字（`dependencies` ↔ `depends_on` ↔ `task_id`），两处手工互转。历史上已因此静默丢过数据。
3. **事件传输独立于事件账本**：`RunEvent` 账本与 `stream_hub` 环形缓冲是两份独立记录 → 续传依赖进程内缓冲、重启即丢、被锁死单实例。

---

## 3. 目标架构：五层，边界画死

```
① 领域层 Domain          Plan/PlanStep · Thread/Message · Artifact · Memory · Quota
                         纯数据 + 不变量校验，不含 IO 编排语义
② 运行层 Run Lifecycle    Run 作为持久作业（租约 / 重试 / 取消 / deadline）
                          唯一真相 = 追加式运行日志（journal）
③ 编排层 Orchestration    LangGraph 图：节点是纯函数，只做 state → state delta
                          持久化由「提交步」统一落库
④ 传输层 Transport        SSE 是 journal 的投影（不是独立环形缓冲）
⑤ 配置层 Config           Expert / Tool / MCP 定义 + 带版本失效的缓存
```

**边界铁律**：

- ③ 的节点**不许**直接写库。所有持久化在提交步完成，且必须幂等（确定性 id + upsert）。
- ② 的 run 状态**不许**靠心跳/清理循环猜测。用租约。
- ④ 的事件流**不许**自建缓冲。读 journal。

---

## 4. 八条决定

每条给出：现状 → 目标 → 理由 → 代价。

### 决定 1 · 运行日志是真相，SSE 是投影

- **现状**：`RunEvent`（账本）与 `stream_hub`（环形缓冲 + seq）各自记录，续传靠进程内缓冲，重启即丢，被约束在单实例。
- **目标**：SSE 端点 = 「从 seq N 之后读 journal 并 tail」。多实例靠 `LISTEN/NOTIFY` 自然工作。
- **理由**：续传变精确；`stream_hub` 的单实例约束与 410 降级路径一起消失；将来要扩不再是重写。
- **代价**：~~需拍板 token 级 delta 是否进 journal~~ → **已拍板（2026-09-13）：delta 进 journal，但用「合并写 + 独立表」**。
  - 原因：`stream_hub` 现在缓冲 2000 条事件，生成中断线重连**能重放已生成的文字**；若 delta 不进 journal，重连会丢半截文本——聊天产品里这是看得见的退化。原先"不进"的判断会造成行为回归。
  - 做法：**两张表、同一 seq 空间**。`run_event`（永久、里程碑、审计）**不动**；新增 `run_stream_frame`（瞬态、delta 帧、run 终态即清理）。写入**合并**（~200ms 一帧，而非每 token 一行）→ 写放大从约 50 行/秒降到约 5 行/秒。SSE 端点按 seq 合并读两表。
  - 收益：重启/跨实例精确重放；审计账本不被 delta 撑爆。

### 决定 2 · Run 是带租约的持久作业，不是 HTTP 请求

- **现状**：「run 还活着吗」由 `last_heartbeat_at` + `session_cleanup_service` 轮询 + 活跃 run 互斥 + in-flight 去重 dict 四处拼出。
- **目标**：`run_lease(run_id, owner, lease_expires_at, attempt)` + 一个 supervisor 循环续租/回收。崩溃恢复、重复投递、僵尸回收全由这一个机制表达。
- **理由**：把四处启发式收敛成一个更小的自研。**注意：这是自研收敛，不是引入 Temporal。**
- **代价**：要迁移现有 deadline/heartbeat 语义；`pause_deadline`（审批等待期不消耗预算）必须保留。

### 决定 3 · 节点是纯函数，持久化在提交步（**降级：非 B3 阻塞项**）

- **现状**：`commander_node` 在图里直接创建 ExecutionPlan + SubTasks（经 `get_or_create_execution_plan`）。
- **目标**：节点只返回 state delta（含 `plan_id` + 计划草案），提交步统一落库并保证幂等。
- **理由**：
  - `RetryPolicy` 重试会重跑节点；并行分支会重跑；健壮性要求节点可重入。
  - 现实现藏着一个**破坏性**语义（见第 8 节「get_or_create_execution_plan 删除重建」），迟早要拆。
- **⚠️ 2026-09-13 修正**：本节原写「这是 B3 的硬前提，因为 `interrupt()` 恢复时节点会重跑、commander 会双写」——**该表述不准确**。LangGraph 恢复时只从头重跑**含中断的那个节点**，上游节点不会重跑。B3 把 `interrupt()` 放进独立的 `plan_approval` 节点后，`commander_node` 不会重跑，**不存在恢复导致的双写**。
  → 因此决定 3 的性质是「拆雷 + 重试/并行的前提」，**不是 B3 的阻塞项**；B3 不必等 B1。

### 决定 4 · Plan 是领域聚合，不是图状态（**预埋 `execution_mode`**）

- **现状**：四套形状 + 两处手工互转（见第 2 节）。
- **目标**：一个 `Plan` + `PlanStep` 领域模型，只在边界做显式转换（LLM 输出 schema / API schema / 事件 schema）。图状态只持 `plan_id` + `revision`。
- **理由**：整类消灭漂移。
- **关键预埋**：canonical 模型**必须带 `execution_mode`**。现状是：`SubTask.execution_mode` 与 `ExecutionMode.PARALLEL` 已在 DB/枚举层定义，但 **LLM 计划 schema（`commander.Task`）没有该字段**，执行器也不消费 → 并行表达从源头就断。不预埋，决定 4 做完要再做一遍。

### 决定 5 · 计划即执行图（`Send` 分波扇出）

- **现状**：`task_list` 数组 + `current_task_index` 游标 + dispatcher 节点 + 外层 while。`current_task_index` 与列表强耦合，正是它让列表**不能**换成 reducer（换了重跑就索引错位）。
- **目标**：依赖 DAG 分层（拓扑波），同层用 `Send` 并行扇出，聚合节点 join。`current_task_index`、dispatcher、外层 while、自研循环守卫一起消失（原生 `recursion_limit` 接管）。
- **理由**：计划既是数据也是图结构，不再需要两套东西互相翻译。
- **已实测**：6 个 IO-bound 分支，`max_concurrency=1/3/6 → 1.87s/0.61s/0.30s`。**`max_concurrency` 是原生限流旋钮，不需要手搓 semaphore**；结果靠 reducer 聚合。
- **扇出层级的判据**：
  - **L1 计划级**（摊平到计划，`execution_mode=parallel` + `depends_on`）：子 agent 产出**语义不同、用户想看**的结果（多源检索）。白拿审批可见性 + per-source `Artifact` 归因（`Artifact.sub_task_id` 已支持）+ 单源重试 + 复用配额与事件机制。**本产品大多数场景应走 L1。**
  - **L2 步骤内**（节点内子图，需 `parent_sub_task_id`）：扇出**机械且同质**（搜索工具内部查 5 个引擎合并），或**运行时才知道宽度**（搜索返回 12 条逐条分析）。
- **代价**：见第 6 节「并行的五个新问题」。

### 决定 6 · 事件 schema 单一真相源 + 生成 TS 类型

- **现状**：Python `event_types/events.py` 与前端 TS 类型各自手写。
- **目标**：Pydantic 为源 → 生成 TS + 校验 + 协议版本号。
- **理由**：这是「漂移」这类问题最便宜的根治（原 T2 OpenAPI 计划的延伸，优先级应上调）。

### 决定 7 · 配置缓存去全局化

- **现状**：5 个模块各自持 TTLCache + 一个注册表点名失效。`expert_repository.py` 明确记录了事故：新增缓存忘记注册 → aggregator 用旧 prompt 最长 5 分钟。
- **目标**：单一配置存储 + 版本/epoch 失效 + 依赖注入，而非模块级可变态。

### 决定 8 · 计划生成端要能产出宽计划（**并行的真正瓶颈**）

- **现状**：`commander.Task` schema 无 `execution_mode`；`ExecutionPlan.strategy` 里的「并行执行」只是自由文本；commander 的依赖推断偏保守（默认每步依赖上一步）。
- **目标**：① 提示词/schema 引导「哪些步骤互相独立、可同时做」；② 审批页**分层可视化**——人要能看懂「这 3 步会同时跑」再决定批准。
- **理由**：**建了扇出但 commander 只输出链式计划，扇子永远扇不开。** 这是决定 5 能否生效的前提，工作量与执行器改造相当。
- **代价**：提示词改动会影响计划质量，需要回归对比；审批页从线性步骤列表改为分层视图。

---

## 5. 明确不做（这些都已讨论并否决，不要再提议）

| 被否决的方案 | 理由 |
|---|---|
| 引入 Temporal / DBOS 等持久执行引擎 | 规模用不上，调试成本远高于收益。决定 1+2 用 Postgres 就够。 |
| 迁移到 `create_agent` + middleware | 心智模型是「一个 ReAct agent」，装不下多阶段业务管线（计划持久化/审批语义/逐任务产物归属），会持续对抗框架。`langchain.agents.middleware` 全家桶只在 `create_agent` 生效，本项目挂不上。 |
| 全量事件溯源 | journal 只服务运行层。Thread/Message/Artifact/Memory 保持普通表 + CRUD，不建投影。 |
| 上微服务 | 单实例 + 单库是对的。决定 1 让「将来要扩」不再是重写。 |
| 删除 deadline / 协作取消 / 心跳 / RunEvent 账本 / `stream_hub` / ToolPolicy | 经核实为**官方真没有**的能力（见第 7 节），保留理直气壮。 |
| 迁移 `stream_mode` 三通道 | 实测后否决：`langgraph_node` 不穿透到节点内 LLM 的 token 事件，`node_type` 删不掉；custom 通道要换发射端（`adispatch_custom_event` → `stream_writer`）；而 `sse_event` 通道已验证工作正常。收益低、风险高。 |
| 按「节点类别」一刀切推理 | **这是已经犯过的错**（见第 8 节复盘）。必须逐节点核实事件出口与状态读写。 |
| 用 `operator.add` 替换 `task_list` 的整值重建 | 会破坏节点重跑的幂等性，而 `current_task_index` 与列表耦合 → 索引错位。**决定 5 落地后此约束才解除。** |

---

## 6. 路线与任务清单

### 批次 A · 稳定现有（push 前）

**目的**：把已完成的改动安全送到 origin，并确认没有同类漏网。

- [ ] **手验 Batch 0-3 的运行时行为**——`utils/db.py` 的 psycopg URL bug 说明「配置收编」这类改动可能改了语义而没验证运行时。同类改动共 14 处（`os.getenv` 收编 Settings），需整体手验。
- [ ] 本地实机验证：发简单消息（验流式）、跑复杂任务到审批页（验 checkpointer 与 HITL）。
- [ ] push 9 个本地 commit（**需用户明确授权**）+ 决定是否补 tag/release。
- [ ] 用生产运维助手跑 SQL 确认生产计划形状（验证「计划偏链式」是现状而非产品本质）：

  ```sql
  WITH per_plan AS (
    SELECT execution_plan_id, count(*) AS n,
           count(*) FILTER (WHERE depends_on IS NULL OR depends_on::text IN ('null','[]','')) AS free
    FROM subtask GROUP BY 1
  )
  SELECT count(*) AS 计划总数,
         count(*) FILTER (WHERE free = n AND n > 1) AS 可完全并行,
         count(*) FILTER (WHERE free < n) AS 含链式依赖,
         count(*) FILTER (WHERE n = 1) AS 单任务计划
  FROM per_plan;
  ```

**验收**：`pytest` 全绿（当前 159）+ `tsc` 全绿 + 上述两条实机路径通过。

### 批次 B · Tier 2（**朝目标架构走的第一步，不只是还债**）

**拆成三个子批执行，不打包。** 耦合的只有 B3 内部的四件事；B1/B2 是行为不变的纯重构，可独立落地、独立 revert。这样 B3 的爆炸半径从「节点写库 + 计划模型 + 中断恢复」缩到「只改中断恢复」。

| 子批 | 内容 | 行为变更 | 风险 |
|---|---|---|---|
| **B1** | 决定 3：`commander_node` 的 DB 写入移到提交步，幂等化 | 无（纯重构） | 低 |
| **B2** | 决定 4：Plan canonical 模型收敛，携带 `execution_mode` | 无（纯增量，新字段默认 sequential） | 低 |
| **B3** | `interrupt()` + `Command(resume=)` 原生化 + thread 对齐 | **有**（暂停/恢复语义换实现） | **高** |

**⚠️ 2026-09-13 顺序修正**：B1 原被标为 B3 的硬前提，经核代码后**降级**——`interrupt()` 只重跑含中断的节点，B3 把中断放进独立 `plan_approval` 节点后 `commander_node` 不会重跑。故 **B3 不阻塞于 B1**。B1/B2 仍应按序先做（风险低、独立可 revert、拆掉破坏性语义），但若 B3 需要先行，不必等待。

- [ ] **B0 · 前置特征测试（零行为变更，可最先做）**：为 resume / revise / cancel-during-wait / 幂等重放 / 审批期超时五条路写测试，锁住「迁移不该改变的东西」。当前只有 `transform_langgraph_event` 的 delta 门控 10 条。
- [ ] **B1 · 决定 3 节点纯化**：`commander_node` 的 ExecutionPlan/SubTask 写入移到提交步，幂等化（确定性 id + upsert）。
  验收：计划创建结果与迁移前逐字段比对一致。
- [x] **B2 · execution_mode 贯通预埋（已完成 2026-09-13，commit `e136b7e`）**：LLM 计划 schema 新增 `execution_mode`（默认 sequential，提示词有意不动 → 行为不变）；commander 三处硬编码 `"sequential"` 改为由数据派生；抽出纯函数 `derive_plan_execution_mode`。新增 `tests/test_execution_mode_chain.py`（8 条）。
  **范围收紧**：本批**未**做「四套计划形状收敛为 canonical 模型」——因 B3 会重组 commander/审批/分发节点，重组前改同一批代码等于做两遍，且在高风险改动前引入 churn。全量收敛推迟为 **B4**（见批次末）。
  B4 待办：`Plan`/`PlanStep` canonical 模型；`dependencies` ↔ `depends_on` 单一写法；`SubTask` 补存放 Commander 语义 `task_id` 的字段（现为双身份，靠 `expert_results` 里 db_uuid 双保险匹配）；用测试断言三条转换链字段一致。
- [ ] **B3 实现依据（2026-09-13 本地实测，环境 langgraph 1.2.11）**——动手前已验，勿再重复试探：
  | 能力 | 实测结论 |
  |---|---|
  | 首跑暂停 | 中断经 `on_chain_stream` 的 `__interrupt__` 浮现；`snapshot.next == (中断节点名,)`，且 **`snapshot.tasks[0].interrupts` 给出结构化 `Interrupt` 对象**（含 value payload 与 id）——这是取代 `_should_wait_for_human_approval` 启发式的原生判据 |
  | 恢复 | `astream_events(Command(resume=值), config)` 有效；中断节点**从头重跑**，`interrupt()` 此时返回 resume 值并继续 |
  | 上游节点 | **不重跑**（checkpoint 中已有结果）——故 `commander_node` 的写库副作用不会被恢复触发，决定 3 非 B3 阻塞项（已在上文修正） |
  | 事件格式 | 恢复流与首跑流**同构** → 服务层「首跑循环」与「恢复循环」可合并为一个函数，仅 input 不同（`None` vs `Command(resume=)`）；这直接消掉现外层 while 的一半复杂度 |
  | 中断 payload | 可直接从 `Interrupt.value` 取计划数据，不必再手工构造 `human.interrupt` 事件 |
- [x] **B3a 已完成并实机验证（2026-09-13，commit `760071a`）**：四件事中已完成 1/2/4，同一 commit（原子）：
  1. ✅ `interrupt()` + `Command(resume=)` 替换 `interrupt_before=["expert_dispatcher"]`
  2. ✅ 审批独立成 `plan_approval` 节点；任务切换回路 `generic → expert_dispatcher` **绕过**它（拓扑承载语义，不靠运行时判断）
  3. ⬜ checkpoint `thread_id` 对齐业务 thread → 归入 B3b
  4. ✅ 恢复路径改为 `Command(resume=审批结果)`
  → 一次性消掉：外层 while、`_should_wait_for_human_approval` 启发式、`HumanMessage` 注入、`run_max_graph_loops`（原生 `recursion_limit` 接管）。
  - 新增测试：`tests/test_graph_topology.py`（5 条结构测试，替代被删的启发式单测）、`tests/test_plan_approval_node.py`（4 条节点行为测试）。
  - **实机验证通过**：`backend/scripts/e2e_hitl_check.py`（真实 HTTP + 真实 LLM，可重复运行）。两次连续成功——规划出 3 任务计划 → `human.interrupt` 携带完整计划（含 `task_1→task_2→task_3` 依赖链）→ 批准后 3 个任务执行完成、3 份产物、`message.done`。
  - 未做：`cancel-during-wait` 与「幂等重放」的端到端用例（B0 已覆盖其 DB 级不变量）。
- [ ] **B3b（未做）**：thread 对齐业务 thread + checkpoint 生命周期守卫。
  - ⚠️ **修正记录**：本节原写「四件事必须同一 commit，只换 `interrupt()` 但 thread 仍是 `{thread}_{run}` 会找不到 checkpoint」——**不成立**。恢复请求自身携带 `thread_id` 与 `run_id`，而 `execute_langgraph_stream` 已有 `isolated_thread_id = f"{thread_id}_{run_id}"` 的**确定性重建**，恢复能命中同一 checkpoint。故 thread 对齐与前两件可分，B3 已按此拆为 B3a（已完成）/ B3b。
  - 终态清理需加「**非等待态**」守卫：`delete_checkpoints_for_thread` 在正常收尾路径被调用，thread 对齐后若在等待审批中执行会删掉恢复所依赖的 checkpoint。
- **实现要点（B3a 落地时遵循）**：
  - `plan_approval` 节点内代码顺序必须是「**先 `interrupt()`、后应用裁决结果**」——`interrupt()` 之前的代码在恢复时会重跑一遍，之后的只跑一次。
  - 计划的 approve 合并（保留已完成任务的 `output_result`、清理依赖、重算索引）**留在 `_apply_updated_plan`**，由服务层在 resume 前 `aupdate_state`；`plan_approval` 节点本身不访问数据库。后续可改为随 `Command(resume={"action":"approve","tasks":[...]})` 传入、由节点应用（更干净，但非必需）。
- [ ] **已拍板（2026-09-13）：修订不图内化，保留后台任务。**
  - 理由：拆开看是两件事——**图只负责「停在审批点等人」，修订是对计划数据的副作用，不是图的一次转移**。
  - 形状：图 pause 在 `plan_approval` 的 `interrupt`；`approve` → `Command(resume)` 从该点继续；`revise` → API 立即返回 + 后台任务跑 LLM 出 v(n+1) 落库与账本，前端轮询到新版本重亮审批卡。
  - **不需要 `plan_reviser` 节点。** 分钟级 LLM 调用留在请求生命周期之外（不赌生产网关超时），同时「停在审批点」成为原生状态而非启发式推断。
  - 反证：原「从账本推导修订态 + 重启兜底」机制中，`fail_stale_revision_jobs` 自 v3.5.0 起从未生效（`created_at` 字段名 bug，2026-09-13 才修）——该路径本身脆弱。
  - 后续可选：若想给修订过程做实时进度，可给后台任务单独开 SSE，不必回到图内。

**批次 B 总验收**：五条特征测试通过；checkpoint 表行数不再随消息线性增长。

### 批次 B4 · Plan 全量收敛（**须在 B3 之后**）

从 B2 推迟而来。理由：B3 会重组 commander / `plan_approval` / 分发节点，**在重组前改同一批代码等于做两遍**，且会在高风险改动前引入 churn。

- [ ] `Plan` / `PlanStep` canonical 模型：四套形状（`commander.Task` / `SubTaskCreate` / `TaskInfo` / 图状态 dict）收成一套，边界处显式转换
- [ ] `dependencies` ↔ `depends_on` 收敛为单一写法
- [ ] `SubTask` 补存放 Commander 语义 `task_id`（如 `task_0`）的字段——现为「双身份」，靠 `expert_results` 里 db_uuid 双保险匹配（`generic.py` 的匹配逻辑随之简化）
- [ ] 用测试断言三条转换链（LLM→DTO、DTO→图状态、图状态→事件 payload）的字段一致——历史上已因字段名漂移静默丢过数据

**验收**：改任一字段名只会影响一处；三条转换链有一致性测试。

### 批次 C · 并行（决定 5 + 决定 8）

依赖批次 B 完成（节点纯化是并行分支/重试的硬前提）。

- [ ] 决定 8①：`commander.Task` 增加 `execution_mode`；提示词引导「哪些步骤独立」。
- [ ] 决定 8②：审批页分层可视化（显示「这几步同时跑」）。
- [ ] 决定 5：执行器按 `depends_on` 拓扑分波 + 同层 `Send` 扇出；`max_concurrency` 做成配置项（按 provider 限流能力调）。

**并行的五个新问题（必须一并设计）**：

1. **失败语义**：分支失败，兄弟任务继续还是取消？下游依赖任务 skip 还是 fail-fast？
2. **聚合顺序必须确定**：按 `sort_order`，不能按完成顺序（否则产物顺序每次刷新都不同）。
3. **配额与限流**：突发并发会撞 provider 429；token 成本要能下钻到任务级（现在 `add_run_token_usage` 只按 run 累加）。
4. **取消要覆盖在飞分支**：`_raise_if_run_cancelled` 是协作式逐 token 检查，需扩展到 N 分支；一个来源挂掉应降级为部分结果，不是整轮失败。
5. **token 放大**：多 agent 扇出的成本一个数量级于单 agent，适合高价值广度任务。commander 需学会**判断何时值得扇出**，而不是能扇就扇。

**验收**：一个含并行层的计划能跑通，审批页可见分层，单分支失败可用例覆盖，配额/限流有上限配置。

### 批次 D · 运行层归位（决定 1 + 决定 2）

- [ ] 决定 1：SSE 改为 journal 的投影。（开工前拍板 token delta 是否进 journal。）
- [ ] 决定 2：`run_lease` + supervisor 循环，替换四处存活启发式。

### 批次 E · 收尾项（可穿插，独立价值）

- [ ] **alembic 日志 handler 问题**（见第 8 节）——直接损害排障能力，已经害过一次。
- [ ] 决定 6：事件 schema 生成 TS 类型。
- [ ] 决定 7：配置缓存去全局化。
- [ ] commander / plan_revision 改 `with_structured_output(..., include_raw=True)`（删 ~150 行手抽 JSON；保留 `plan.thinking` 事件、任务 id 兜底、失败兜底语义）。
- [ ] 工具错误走 `ToolNode(handle_tool_errors=...)`（分类话术是业务资产，保留）。
- [ ] `awrap_tool_call` 做 per-tool_call 重试（**现状重试整个 ToolNode，多 tool_call 时会把已成功的重复执行——这是在错的，不只是优化**）。
- [ ] per-tool 超时（现状挂了 MCP 会把 calculator 一起放宽到 90s）。
- [ ] `TimeoutPolicy` 挂 `generic`/`commander`/`aggregator`（现在 LLM 悬挂只能等 run 级 900s）。
- [ ] `Runnable.with_fallbacks` 运行时模型降级。
- [ ] 前端第二批：`taskStore` 持久化收敛、`useSessionRestore` Query 化、自研 persist 退役、`use-toast` 换 `useSyncExternalStore`（涉生产验证过的恢复时序，需谨慎）。
- [ ] 记忆迁 `AsyncPostgresStore.asearch`（**不值作为换而换**，等记忆要升级为产品功能再做）。

---

## 7. 保留清单（官方真没有，不要动）

| 机制 | 位置 | 为何不可替代 |
|---|---|---|
| RunEvent 事件账本（append-only） | `models/domain/run_event.py`、`crud/run_event.py` | checkpoint 存 channel 快照，不是「谁在第几版批准/哪个任务产出/修订为何失败」的时间线 |
| `stream_hub` SSE 断线续传 | `services/chat/stream_hub.py` | 开源版无事件缓冲/seq/重放；Platform 的 `join_stream` 是服务端产品且自述不缓冲 |
| run 级 deadline 三层生命周期 | `run_lifecycle.py`、`crud/agent_run.py` | `TimeoutPolicy` 是单节点、单次图调用内的墙钟；本项目预算跨 HTTP 请求且**审批等待期不消耗预算** |
| 协作式取消 `_raise_if_run_cancelled` | `parts/event_builders.py` | 官方取消是进程内 asyncio 范畴；本项目要跨请求 + 落 DB + 清理兜底 |
| 心跳 | `crud/agent_run.py`、`utils/sse_builder.py` | 运维可见性语义 |
| ToolPolicy 风险分级 / 黑白名单 / DB 覆盖 | `agents/tool_policy.py` | 纯业务治理 |
| `recent_artifacts` 有界摘要 + `get_artifact` 按需读 | `tools/artifacts.py` | 业务 artifact 概念，middleware 管不到 |
| 计划版本乐观锁 CAS + 恢复幂等键 + 活跃 run 互斥 | `recovery_service.py`、`crud/agent_run.py` | 多端并发审批的正确性保障 |
| 节点→SSE 事件通道 `adispatch_custom_event` | `agents/event_stream.py` | **这已是原生正确用法**，全仓唯一一处 HITL 级原生实现 |
| 前端流式 RAF + 节流 | `useStreamHandler.ts` | 高频 token 不进 React 状态是正确判断；`useTransition`/`useDeferredValue` 解决不了重渲染次数 |
| `chat.ts` 的 SSE 生命周期管理 | `services/chat.ts` | 库不提供 Last-Event-ID 续传；非幂等 POST 必须禁掉库的自动重试 |
| `deadline_at` 的 `pause_deadline` | `run_lifecycle.py` | 审批等待期挂起预算，官方无「预算可暂停」概念 |

---

## 8. 已知地雷与复盘（**动手前必读**）

### 8.1 我犯过的错（同类错误不要重犯）

1. **按「节点类别」一刀切推理**：我把 `direct_reply` 和 `commander`/`expert` 归为一类，都改 `streaming=False`，并断言「三者的内容都经 `sse_event` 通道直达」。实际 `direct_reply` 的 token 是 **Simple 模式唯一的流式来源**（经 `on_chat_model_stream` → `message.delta`，节点本身不发 content 事件），这一改会让简单模式退化成「转圈后整段蹦出」。
   → **教训：必须逐个节点核实事件出口与状态读写，不能靠模式匹配。**
2. **循环论证**：我用「当前库 28 个计划中 0 个可完全并行」论证「不需要并行设计」。但计划是链式**部分正因为**执行是单链、commander 按此拆解——用当前设计的产出去否定新设计。数据测的是「今天的产品形状」，不是「并行之后会是什么样」。
   → **教训：内生数据不能用来预测架构变更后的行为。**
3. **把「消白开销」和「删流式」混为一谈**：正确做法是逐个节点追内容出口，而非按类别归纳。

### 8.2 环境与机制地雷

| 地雷 | 说明 |
|---|---|
| **`interrupt()` 会重跑节点** | 恢复时**含中断的那个节点**从头执行（其上游节点不会重跑，状态来自 checkpoint）。任何写库/发事件副作用必须在 `interrupt()` 之后，或幂等。**推论：把 `interrupt()` 放在独立节点里，就能避免让有副作用的节点重跑**——这是 B3 设计的依据。 |
| **`Command(resume=None)` 会让 langgraph 内部崩溃（已实测）** | langgraph 1.2.11 下以 `None` 作为恢复值会抛 `UnboundLocalError: resume_is_map`（框架内部问题）。**恢复值一律传 dict**，如 `{"action": "approve"}`。 |
| **`human.interrupt` 的 SSE payload 是扁平的** | `build_sse_event` 展开了 event data，故字段直接是 `current_plan` / `plan_version` / `run_id` / `execution_plan_id`，**没有 `data` 外层**；且 **`thread_id` 不在 payload 里**，只在响应头 `X-Thread-ID`。写客户端或验证脚本时注意（已踩两次）。 |
| **产物不得随任务替换被删（已修）** | 原 `get_or_create_execution_plan` 按 `thread_id` 单键判定，命中即删除全部旧 SubTasks 并重建；而 `SubTask.artifacts` 配 `cascade="all, delete-orphan"` → **连带删除已完成任务的产物**。产品语义上产物是**会话级交付物**（同会话「先生成网页、再写小游戏」，两个都要留），故改为 **一 run 一计划**：新 run 新建计划，不删除任何既有内容；运行时不再有删除子任务的路径，级联自然失效（**无需迁移**）。`get_execution_plan_by_thread` 改为显式按 `created_at desc()` 取最新（原为无 ORDER BY 的 `.first()`，多计划下不确定）。 |
| **`preview_execution_plan_id` 接线未生效（已修）** | 该键原**未在 `AgentState` 声明、无写入点**（仅测试显式传），而 LangGraph 过滤未声明键 → commander 里 `state.get(...) or uuid4()` **每次执行都拿到新 uuid**，它设计的目标「`plan.started` 事件 id 与落库计划 id 一致」**从未成立**。已补声明 + commander 成功路径回写。 |
| **psycopg 连接串必须是 plain** | `utils/db.py` 走 psycopg 原生池，只认 `postgresql://`；`+psycopg` 是 SQLAlchemy 驱动标记，libpq 会报 `invalid connection option`。`database.py` / `migrations/env.py` 走 SQLAlchemy，**才**用 `+psycopg`。 |
| **provider `enabled` 判定** | `is_provider_configured` 必须同时看 `enabled` 与存在 key。只看 key 会让 `enabled: false` 的 provider 被选中，然后 `_build_llm_instance` 抛错、commander 静默退化为空计划。 |
| **alembic `fileConfig` 清 handler** | `logging.config.fileConfig` **无条件**调用 `_clearExistingHandlers()`，且 `alembic.ini` 的 `[logger_root] level = WARNING`。进程内迁移一跑，应用的 INFO 日志全部消失（ERROR 仍在）。**未修**——修法不是重调 `setup_logging()`（有幂等守卫会直接返回），需显式重建 handler。 |
| **枚举须注册 msgpack 白名单** | `utils/db.py` 的 `JsonPlusSerializer(allowed_msgpack_modules=[...])`——新增业务枚举不注册，checkpoint 反序列化会炸。 |
| **时区约定** | 全库 UTC naive 写入 + 前端 `toLocalDate` 补 Z 解析。禁用模型默认 `datetime.now` / 裸 `new Date(iso)`。 |
| **前端依赖用 pnpm** | 根 `pnpm-lock.yaml` 是真锁文件。`npm uninstall` 会改写 `package.json`（即使命令失败）。 |
| **前端「改动没生效」** | 先整页 F5（懒加载 chunk 残留），不要急着重启服务。 |
| **`_debug_code` 登录** | 仅新用户返回。测老号要换新手机号。 |
| **push 需明确授权** | commit 本地可做；push / tag / release 必须等用户明确说。 |
| **ruff-format 会吞 commit** | pre-commit 改写文件致 commit 中止 → `git add -A && commit` 重提即可。 |
| **Git Bash 的 `taskkill /PID`** | `/PID` 会被当路径转换，用 `//PID`。 |
| **后端日志缓冲** | stdout 重定向到文件时块缓冲；要实时看日志用 `PYTHONUNBUFFERED=1`。 |

---

## 9. 当前状态快照（2026-09-13）

- **分支**：`feat/redesign-workbench`，`origin/main` = `6b3f4d9`
- **未推送**：9 个 commit（`dd632da` … `87552e4`）
- **已发布**：v3.5.0（tag 停在 `3e060e2`；两个 hotfix 未进 tag，随下次发版带上）
- **生产**：v3.5.0 已部署，500 已修。**注意**：`origin/main` 尚未含批次 B 之前的工作，生产也尚未拉取后续修复。

**本轮（Tier 0 + Tier 1）已完成**：

| commit | 内容 |
|---|---|
| `ff8eb42` | Tier 0：删不可达死代码 351 行（`_streaming_planning_fallback` + `utils/json_parser.py` 整模块）；修 provider `enabled` 判定；`recursion_limit` 收进 settings；删三处死分支 |
| `bbc8bb8` | Tier 0 前端：删除会话路径收敛到已有 mutation；修 `useConversation` 不失效缓存的 bug |
| `f1ae2fc` | Tier 1：事件消费端判据改 `langgraph_node` + `node_type` 合并判据；commander/expert 消流式白开销 |
| `943677a` | 修 Tier 1 引入的 Simple 模式流式回归（见 8.1 第 1 条） |
| `87552e4` | 修两个潜伏 bug：psycopg URL 驱动标记（Batch 3 引入，**未推故生产未受影响**）、`fail_stale_revision_jobs` 的 `created_at` → `timestamp`（v3.5.0 起从未生效） |

**测试状态**：后端 `pytest` 159 passed；前端 `tsc` 全绿 + vitest 43 passed。

**本地服务**：后端 `run.py` 于 3002（PG 容器 `xpouch-postgres`）。

---

## 10. 验收口径（每批次适用）

- **批次 A**：`pytest` + `tsc` 全绿；简单消息流式正常；复杂任务到审批页正常。
- **批次 B**：五条特征测试（resume / revise / cancel-during-wait / 幂等重放 / 审批期超时）通过；checkpoint 不随消息线性增长。
- **批次 C**：含并行层的计划跑通；审批页可见分层；单分支失败可降级；限流上限可配。
- **通用**：`plan.thinking` 事件、失败兜底语义、工具错误话术三条不回归。

---

## 附：派生文档

- `docs/langgraph-native-audit.md` —— 框架原生化审计（19 处自研机制逐条对到 langgraph 1.2.11 / langchain 1.3.18 的结论，含「官方有 / 官方没有 / middleware 挂不上」三档判定）
- `docs/design/REDESIGN-NOTES.md` —— UI 设计体系（token 三层 + 自研语义皮 + Radix 行为芯）
