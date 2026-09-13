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
- **代价**：~~需拍板 token 级 delta 是否进 journal~~ → **已拍板（2026-09-13）：delta 进 journal，但用「独立表 + 批量提交」**。
  - 原因：`stream_hub` 现在缓冲 2000 条事件，生成中断线重连**能重放已生成的文字**；若 delta 不进 journal，重连会丢半截文本——聊天产品里这是看得见的退化。原先"不进"的判断会造成行为回归。
  - 做法：**两张表、同一 seq 空间**。`run_event`（永久、里程碑、审计）**不动**；新增 `run_stream_frame`（瞬态、delta 帧、run 终态即清理）。写入按 ~200ms **批量提交**（一个事务多行，而非每 token 一次事务）→ 写放大从约 50 次事务/秒降到约 5 次/秒。SSE 端点按 seq 合并读两表。
  - **细化（2026-09-13 实施第 2 片时）**：「批量」是**提交批次**，不是「一行塞多条事件」。一行一事件才能让 `seq > last_event_id` 精确——客户端可能停在半批中间，整体重放会造成 token 重影（详见批次 D 第 2 片）。
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

### 决定 6 · 事件 schema 单一真相源 + 生成 TS 类型（**已落地 2026-09-13**）

- **现状**：Python `event_types/events.py` 与前端 TS 类型各自手写。
- **已完成**：真相源 = 后端 pydantic 模型（本来就有，`build_sse_event` 就是拿它们构线的），往下一层导出：
  - `backend/scripts/gen_event_types_ts.py` → `frontend/src/types/events.generated.ts`（模型→TS interface + EventType 联合 + EventPayloadMap；缺 payload 模型直接抛错）。Justfile 有 `gen-event-types` / `check-event-types`。
  - **闸门一（后端）**：`tests/test_event_types_ts_fresh.py` —— 生成物过期即测试失败，并打印修复命令。
  - **闸门二（前端）**：`types/events.ts` 对每条手写类型做**字段子集断言**（`Assert<KeysSubset<...>>`）——挡住「前端声明了后端不发送的字段」这类最伤人的漂移。已用假字段做负向验证（tsc 立刻 TS2344）。
  - **顺带照出一个真问题**：`TaskInfo` 后端没有 `depends_on`、前端一直有 → `plan.created` 从不发送依赖关系。已补模型 + 发射器透传。
- **已知缺口（两道闸门当前不覆盖，别误以为全覆盖）**：
  1. **null 与 undefined 的语义差**：后端 `str | None` 生成 `x?: string | null`，前端多写 `x?: string`。对齐它要动一批消费点的空值处理，属独立批次。
  2. **前端把字段收窄成字面量**：`ArtifactInfo.type` 只列了 5 种，而实际产物类型有 12 种（`lib/artifactPresentation` 的 12 个 + 过滤档）——是前端自己的类型债，修它要顺带把 `type` 的消费者过一遍。
- **未做**：协议版本号（生成物里带一个 hash/版本，运行时对不上就报警）——等真有多端接入时再加。

### 决定 7 · 配置缓存去全局化（**第一刀已完成 2026-09-13**）

- **现状（改造前）**：5 个模块各自持 TTLCache + 一个注册表点名失效。`expert_repository.py` 明确记录了事故：新增缓存忘记注册 → aggregator 用旧 prompt 最长 5 分钟。
- **已完成**：新增 `utils/config_cache.py` —— `ConfigCache` = TTLCache + **全局 epoch**。失效不再「逐个点名清空」，而是 `invalidate_config_caches()` 递增 epoch，**每个 ConfigCache 在下一次访问时自行清空**。于是「注册」这一步不存在了，也就没有「忘记注册」这回事：新模块随便造缓存都自动纳入失效链。TTL 保留（兜住「压根没人调失效」）。
  - 6 个缓存换成 `ConfigCache`（commander 配置 / 全量专家 / dispatcher / generic / aggregator / expert_manager 全局）；`agents/services/expert_repository.py`（注册表）**整个删除**——两套机制并存比少一个机制更糟。
  - `refresh_cache()` 现在是「epoch+1 + 可选重载，全局与本地缓存一起失效」，日志如实说明失效范围（旧实现靠注册表，日志里那个「已清除 N 个」的数字本身就是漏注册时的伪装）。
  - 新增 9 条测试（`tests/test_config_cache.py`），其中一条直接回归真实事故：写入节点本地缓存 → `refresh_cache()` → 该值必须消失。
- **有意未做（DI）**：依赖注入要改所有节点签名，而读取点全在**最热的执行路径**上（每次路由/每次工具调用）；收益主要是「便于替换实现/测试」，而真正造成事故的缺陷来源已被 epoch 消掉。等出现第二个配置存储或真需要替换实现时再做。
- **边界（明确未纳入，避免"看起来全改了"）**：
  - `services/tool_policy_service.py` 的覆盖缓存：自带 `invalidate()` 且管理面更新时显式调用（`routers/tools.py`），不属于「忘记注册」这一类。
  - `agents/graph_builder.py` 的 3 个 LLM 单例（`lru_cache`）：**2026-09-13 复核后修正**——此前我在本节写「改模型配置要重启进程才生效」，**那是错的**。真相：
    - 系统管理里选的「简单模式模型 + 思考档」存在 `system_setting`，`routers/chat.py` **每次请求**都 `load_model_preferences(session)` 注入图状态 → `_resolve_simple_llm` 用它构造实例（实例缓存按 (provider, model, streaming, thinking, temperature) 做键）→ **选完立刻生效，无需重启**。专家管理里每个专家的模型同理：管理员保存时 `refresh_cache()` → epoch 递增 → 配置缓存自清 → 下次运行用新模型建新实例。
    - 那 3 个单例只是「没有选择时的兜底」，其输入全部来自 env（`MODEL_NAME` / providers.yaml）——改 env 需要重启，这属于 env 语义，不是缺陷。
    - 唯一的真实差异：**router / commander / aggregator 三个角色的 provider 由 `providers.yaml` 钉定、模型名取 env 默认**，不跟随上面那个选择（有意为之：Router 要 JSON 稳定输出，历史上 MiniMax 的 `<think>` 标签就是因此被移除）。UI 上那个控件本来标的就是「简单模式」，所以行为与标注一致。**若将来希望编排角色也跟随某个选择，那是产品决策**，不在本轮。

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
- [ ] **B3b（暂停，2026-09-13 决定暂不做）**：thread 对齐业务 thread + checkpoint 生命周期守卫。
  - **暂不做的理由**（原以为的价值已不存在）：我以为它的价值是阻止 checkpoint 无限增长，但查证后——**每条终态路径都已在清理 checkpoint**（正常收尾 `stream_service:391`、驳回 `recovery:179`、取消 `recovery:392`、批准恢复收尾 `recovery:481`、后台清扫 `session_cleanup_service:172`）。增长早已有界，`{thread}_{run}` 虽不优雅但能工作。收益只剩「概念整洁」。
  - **真实隐患（若将来要做，必须先解决）**：`handle_langgraph_stream` 每次都拿**完整历史**调 `aupdate_state(initial_state)`；现在每 run 一个新隔离 thread 所以是「从零写入」，一旦共享 thread，同一份历史会经 `add_messages` reducer **追加到已有 checkpoint 上 → 消息成倍重复**且随轮数累积。需一并改消息注入策略 + 给清理加「非等待态」守卫。
  - **重新评估的触发条件**：需要「会话级执行历史可查询 / 时间旅行（`get_state_history`）」时，再拿出来讨论——届时上面两条隐患是必答项，不是可选项。
- **实现要点（B3a 落地时遵循）**：
  - `plan_approval` 节点内代码顺序必须是「**先 `interrupt()`、后应用裁决结果**」——`interrupt()` 之前的代码在恢复时会重跑一遍，之后的只跑一次。
  - 计划的 approve 合并（保留已完成任务的 `output_result`、清理依赖、重算索引）**留在 `_apply_updated_plan`**，由服务层在 resume 前 `aupdate_state`；`plan_approval` 节点本身不访问数据库。后续可改为随 `Command(resume={"action":"approve","tasks":[...]})` 传入、由节点应用（更干净，但非必需）。
- [ ] **已拍板（2026-09-13）：修订不图内化，保留后台任务。**
  - 理由：拆开看是两件事——**图只负责「停在审批点等人」，修订是对计划数据的副作用，不是图的一次转移**。
  - 形状：图 pause 在 `plan_approval` 的 `interrupt`；`approve` → `Command(resume)` 从该点继续；`revise` → API 立即返回 + 后台任务跑 LLM 出 v(n+1) 落库与账本，前端轮询到新版本重亮审批卡。
  - **不需要 `plan_reviser` 节点。** 分钟级 LLM 调用留在请求生命周期之外（不赌生产网关超时），同时「停在审批点」成为原生状态而非启发式推断。
  - 反证：原「从账本推导修订态 + 重启兜底」机制中，`fail_stale_revision_jobs` 自 v3.5.0 起从未生效（`created_at` 字段名 bug，2026-09-13 才修）——该路径本身脆弱。
  - 后续可选：若想给修订过程做实时进度，可给后台任务单独开 SSE，不必回到图内。

- [x] **HITL 二期之一 · 修订对照视图（已完成 2026-09-13）**：审批弹窗里新增「本次修订改动 · N 处」，展开可看逐条对照（改 / 增 / 删，含专家类型变化）。
  - **关键约束（决定了实现方式）**：修订在服务端是**删旧行建新行**，v2 的每个任务都是新的子任务 UUID——`id` 跨版本没有延续性，按 id 比只会得到「全删全增」的废 diff。因此对照**按位置（sort_order）对齐**，与 `lib/planDiff` 的模块说明同一口径；代价是「中间插入一条」会让其后各行显示为「改」，这对「专家据反馈逐条重写」的主场景是**如实**的。
  - 数据来源：`previousPendingPlan`（store）在 `setPendingPlan` 检测到**版本号变大**时自动留存上一版——两条下发路径（审批卡的 plan 查询、`human.interrupt` 事件）都走这一个动作，所以不会漏。刷新页面会丢这份对照（此时界面仍显示完整的新计划），属可接受的降级。
  - 纯函数 `lib/planDiff`（10 条单测）+ `PlanDiffList` 组件（只渲染有改动的行，未改的用一句「其余 N 条未变」带过）；配色遵循「危险才红」——删除用中性灰+删除线、改动琥珀、新增鼠尾草绿。中英日三语词条齐备。
  - **实测**（真实浏览器 + 真实修订）：发起任务 → 驳回并附反馈 → 等专家出 v2（4 → 5 个任务）→ 弹窗显示「本次修订改动 · 5 处」，展开可见 4 条「改」（其中两条含 `analyzer→search`、`writer→analyzer` 的专家变化箭头）与 1 条「增」。
  - **未做**：步骤级二次确认（原二期清单里的另一半）——它要改的是「批准后逐任务确认」的交互契约，属于新交互而非既有信息补齐，留待产品上真要「人工把关每一步」时再做。

**批次 B 总验收**：五条特征测试通过；checkpoint 表行数不再随消息线性增长。

### 批次 B4 · Plan 全量收敛（**上半已完成 2026-09-13**）

从 B2 推迟而来。理由：B3 会重组 commander / `plan_approval` / 分发节点，**在重组前改同一批代码等于做两遍**，且会在高风险改动前引入 churn。

- [x] **canonical 模型 + 唯一转换点**（`agents/plan_tasks.py`）：`PlanTask` + `build_plan_tasks` / `attach_subtask_ids` / `to_state_dict` / `to_event_task_dict` / `to_subtask_create`。commander 里三处手写构造（DTO / 状态 dict / plan.created payload）全部改经它。
- [x] **`dependencies` ↔ `depends_on` 收敛为单一写法**：canonical 名 = `depends_on`；LLM 侧 `Task` 用 `AliasChoices` 兼容旧名（历史提示词、已存计划、老测试不受影响），提示词/默认数据/修订路径/回归校验器一并改名。改名过程当场揪出两处仍读旧名的站点（`evals/regression_runner.py`、事件 payload 的键集）。
- [x] **三条链的一致性测试**（`tests/test_plan_task_conversions.py`，15 条）：状态 dict 键集钉死、事件 payload 键集 == `TaskInfo.model_fields`、DTO 双身份、依赖序号归一、落库前后调用顺序、位置错配必须报错。**验收口径「改任一字段名只影响一处」由此成立**（配 `to_event_task_dict` 未落库即报错）。
- [ ] **`SubTask` 补 Commander 语义 `task_id` 列**（下半，需一条迁移）：现状 `SubTaskCreate.task_id` 落库时被丢弃，`generic.py` 只能靠 `expert_results` 里 `task_id` + `db_uuid` 双保险匹配依赖。补列后：创建时写入、`generic.py` 的匹配逻辑简化、`depends_on` 的语义变清晰。
  - 注意：**修订路径（`action=revise`）产出的依赖 ID 用的是「1/2/…」序号写法**，与原计划的 `task_1` 命名不一致——落库时没有归一，执行期匹配依赖可能落空。这条独立于补列，属同一批的收尾项（已实测修订本身可用：见「批次 D 补」的 v1→v2 验证）。
- **图状态 dict 的键名有意不改**（`id` 存 UUID、`task_id` 存语义 ID）：被 generic / dispatcher / aggregator / plan_waves 广泛读取，改名纯风险无收益；改由 `to_state_dict()` 一处生成并在模块 docstring 写清映射，测试钉住键集。

**验收**：改任一字段名只会影响一处 ✅（上半）；三条转换链有一致性测试 ✅。

### 批次 C · 并行（决定 5 + 决定 8）

拆成两层：**C1 判定层（已完成）** 与 **C2 执行侧接线（未做，见触发条件）**。

- [x] **C1 判定层已完成（2026-09-13，commit `73e8a3e`）**：新增 `agents/plan_waves.py`——纯函数、无 IO，输入计划状态、输出「本轮能跑哪些」：
  - `ready_task_ids`：pending 且所有依赖已完成（按 `sort_order` 稳定排序）
  - `blocked_task_ids`：因上游 failed/cancelled 而**永远不会就绪**的 pending 任务——必须显式识别，否则执行器会「还有未完成任务」而空转到超时
  - `select_wave(max_concurrency)`：上限 1 时退化为一次一个
  - `is_plan_finished`；测试 22 条
  - 配置 `GRAPH_MAX_CONCURRENCY` 默认 **1（串行）**：能力在位但不改变现有业务。将来做页面可配置项时按 `system_setting` 既有模式读（参考 `services/run_quota.py` 的 `user_daily_token_quota`），执行器改「设置表优先、env 兜底」即可，无需改执行逻辑（已写入 `config.py` 注释）。
  - **声明：C1 尚未接线到执行器**——它是判定层，执行仍走 `current_task_index` 单任务循环。这是有意为之：接线必须一次做对（见 C2），半步接线会让判定与执行两套语义并存。
  - 顺带修一真 bug：`_apply_updated_plan` 的依赖清理用 db uuid 建集合，而 `depends_on` 存的是 commander id → **编辑计划即清空所有依赖**（测试 7 条锁住）。
- [x] **C2 执行侧接线（已完成 2026-09-13，commit `d6280d0` + 开关 `c83209c` 前序判定层）**：执行侧改为**按波 Send 扇出**。
  - **拓扑**：`commander → plan_approval → wave_dispatch ──Send──▶ expert_worker(子图) ──▶ task_join →（回 wave_dispatch）`；`wave_dispatch` 无就绪任务时转 `aggregator`。
  - **`agents/expert_worker.py`（新）**：一个任务 = 一次 `worker ↔ tools` 循环。**必须**是子图——`Send` 只让分支跑一个节点，框架没有「每个分支自己的循环」这种构造（此判断与本文原估计一致）。
  - **`agents/nodes/wave_scheduler.py`（新）**：`wave_dispatch`（扇出前把跑不了的任务标失败）/ `route_wave`（条件边，按并发上限 Send）/ `task_join`（产物落成 `task_list`、`expert_results`——二者执行期的唯一写者）。
  - **`agents/task_outcome.py`（新）**：分支产物的唯一形状（写者=generic，读者=join + stream_service 结果收集）。
  - **删除**：`agents/nodes/dispatcher.py`、`current_task_index` 游标、`last_expert_result` 通道。选任务只剩一处答案（`plan_waves`）。
  - **三条分支状态硬约束（实测得出，写在 `expert_worker.py` docstring）**：① 分支只拿得到 Send payload；② 工具草稿走私有 `worker_messages`，不污染会话历史；③ 只经 `task_outcomes`（有 reducer）交回结果——并发写无 reducer 的通道直接 `InvalidUpdateError`，而 `task_list` **必须**保持无 reducer（计划编辑要整表替换）。
  - **两个接线后才暴露的真 bug（由新集成测试抓到）**：
    1. 子图会把自己 schema 里**与主图同名的键全部写回**（不是只写本节点返回的）→ 平铺 `thread_id` 让 N 个并发分支写同一无 reducer 通道而炸。改为打包进主图没有的私有键 `branch_context`。
    2. 「等待 ≠ 成环」：判定层原把「既不就绪也不阻塞」一律判死锁，于是菱形计划在第一波就把整条下游链标失败。改为「迟早能跑」不动点判定。
  - **并发上限**：`services/run_concurrency.py`（读取链 system_setting → env → 串行）注入两个 run 配置；管理端「系统状态」页可改（`PUT /admin/graph-max-concurrency`），与日 token 配额并排。默认 **1 = 串行**，行为与接线前一致。
  - **验收**：新增 `tests/test_wave_execution.py`（6 条，跑真实图、只桩掉 router/commander/aggregator 与专家 LLM）覆盖串行按序 / **真并发重叠** / 依赖门控与跨波次注入 / 单分支失败降级 / 成环收尾 / 聚合顺序；`tests/test_plan_waves.py` 扩到 32 条；后端 364 全绿 + 真实 LLM 的 e2e 重跑通过。
- [x] **失败策略（随 C2 落地，集中在一处）**：单分支失败 → 兄弟继续（不 fail-fast）；依赖失败的下游 → 标失败并写明「上游失败，已跳过」（**不让它带着缺失上游硬跑**，那会产出看似正常的垃圾）；依赖成环 → 标失败并写明原因。三者同时写实时事件 + 运行事件账本（用户能看到「为什么没跑」）。改策略只改 `wave_scheduler.py`。
  - 有意**不做**配置项：策略只有一种，加开关等于给用户一个「选错就产出垃圾」的机会；真要分叉时再抽。
- [x] **其余三项**：聚合顺序按 `sort_order`（join 派生，aggregator 不再排序）✅；取消覆盖在飞分支 ✅（沿用 asyncio 取消整轮，分支随之取消）；并发配额/限流 ⚠️ **未做**（突发会撞 provider 429，见下方「仍未做」）；token 成本下钻到任务级 ⚠️ **未做**（`add_run_token_usage` 是 run 级的）。
- **仍未做（记在账上）**：provider 限流的退避/排队；任务级 token 成本；`execution_mode` 仍未参与限流决策（现在只由全局上限决定每波几个）——若要「这个计划整体不许并发」这类语义，得让 `route_wave` 也看它。

### 批次 D · 运行层归位（决定 1 + 决定 2）

目标：让 SSE 续传在**进程重启后仍成立**、为多实例铺路；把「run 还活着吗」从四处启发式收敛为租约。

**分三片推进（每片独立可验证，勿合并）** —— 三片均已于 2026-09-13 完成（第 1/2/3 片见下）：

- [x] **第 1 片 · 帧表基础设施（已完成 2026-09-13，commit `f9a8972`）**：`run_stream_frame(id, run_id, seq, wire, created_at)` + 迁移 `20260913_000200`（唯一索引 `(run_id,seq)`、`created_at` 索引）+ `crud/run_stream_frame.py`（append/list_after/latest_seq/prune_run/prune_older_than）+ 10 条测试。**未接线**，不改变任何现有行为。
  - 与 `runevent` 的分工（模型 docstring 已写明）：runevent = 永久审计账本（里程碑、只追加不删）；本表 = 瞬态传输缓冲（含 token 级增量），run 终态即清。
- [x] **第 2 片 · 写入端接线（已完成 2026-09-13，commit `f4544aa`）**：新增 `services/chat/frame_recorder.py`（`RunFrameRecorder`），接线点是 `StreamService._push_event`（唯一事件出口），三行：`reserve_seq` → `hub.publish(wire, seq)` → `record`。
  - **seq 的所有权改了**：从 `stream_hub` 移到 `frame_recorder`。理由——seq 是 run 级的**持久游标**，进程重启后必须接着库里的号继续，否则唯一索引 `(run_id, seq)` 会让新号段整批冲突回滚（静默空洞）。hub 因此退化为「按给定 seq 广播」的纯内存件。
  - **「一帧压多条事件、seq 记最后一条」的原设计被推翻**（原设计在下面保留作对照，理由已失效）：续传按 `seq > last_event_id` 取帧，而客户端 last_event_id 可能停在半批中间（实时通道逐条下发），把多条事件并成一行再整体重放会让**已收到的事件被重复应用**（token 重复＝正文重影）。改为**一行一事件 + 批量提交**：写放大照样摊平（~200ms 一次 INSERT 多行），代价只是行数（实测一次 25 秒的流 = 1910 行 / 222 kB，瞬态表，终态即清）。这也让 `seq >` 的语义精确，第 3 片的读端不需要任何去重。
  - **终态刷净**放在 producer 的 `finally` 里，且用**同步**写（`finish_blocking`）：收尾可能处在取消态，任何 `await` 都可能被跳过——那不仅丢尾帧，还会连带 `hub.close` 与 `done` 哨兵都发不出去，订阅者悬挂。
  - **写失败不丢批**：失败批次退回缓冲并退避重试（2s），只有积压超过 5000 条才丢最旧并告警。理由：一次 DB 抖动不该在重放里留空洞；而高频重试会在 DB 故障期把线程池占满（每次尝试都要等连接超时）。
  - **号段的高水位必须留在内存**（`finish_blocking` 不摘条目，交给 LRU 回收）：同一 run 的第二段流（第二次审批续跑）可能在上一段 flush 尚未提交时开始，此时重新查库续号会读到旧最大值而重号。
  - **实测验证**（`scripts/e2e_hitl_check.py` 真实 HTTP + 真实 LLM）：run `43fada9c…` 落库 1910 行，seq 连续 1→1910、无重号、`id:` 行与 seq 全量一致、终帧为 `message.done`（证明尾部刷净生效）；`1910 = 1906 delta + 1 task.started + 1 task.completed + 1 artifact.generated + 1 message.done`，与线上事件数逐条对齐。
  - 新增 18 条测试（`tests/test_frame_recorder.py`）+ hub 测试改为显式传 seq。全量 **283 passed**。
  - **原设计（保留作对照，勿再照此实现）**：~~token 级帧必须合并写（~200ms 一批，一帧可含多条 SSE 事件，seq 记其中最后一条）~~。
- [x] **第 3 片 · 读取端切换 + 清理（已完成 2026-09-13，commit `5b5d04f`）**：
  - **读取端**：`/chat/{thread_id}/stream/resume` 现在是「缺口补放 → 内存 backlog → 跟随实时」。补放只在**确有缺口**时查库（`backlog[0].seq > last_event_id + 1`，即客户端落后于内存窗口），逻辑在 `services/chat/frame_replay.py`，无缺口时零查询。
    - **实现选择**：不是原计划的「先无条件重放库中帧、再跟随」——那样会与内存 backlog 重叠，得靠 `max()` 去重；改成「只在缺口处查库」后两段天然不重叠，且热路径（客户端没落后，绝大多数）一次库都不查。
    - **`closed` 一律 410**：缓冲关闭 = 没有可跟随的实时通道。此时只回放库里那一段再结束的话，前端会把「没有完成标记的关闭」当成回答被截断而报错，比 410 更糟（410 会走刷新路径，终态内容本就在消息表里）。
      - **⚠️ 当时的这句话是错的**：前端**根本没有** 410 处理，410 被吞成一个通用错误串，用户只看到「连接异常，请重试」，服务端任务跑完也无人对账（详见下面的「批次 D 补」）。现已补上。
    - **同轮顺带修掉一个潜伏 bug**：`close()` 原来会把 `closed` 永久置真，导致同一 run 的**第二轮流**（再次审批续跑）期间所有 resume 都拿「已结束」。现在 `publish` 会重新打开缓冲（旧订阅者已收到哨兵，不受影响），并补了回归测试。
  - **清理**：新增 `utils.db.cleanup_terminal_run(thread_id, run_ids)` = checkpoint + SSE 传输帧一起清，**五个终态调用点全部改走它**（正常收尾 / 驳回 / 取消 / 审批续跑完成 / 线程过期与僵尸回收）。理由：两者生命周期一致，分散调用迟早有人只清一半。`session_cleanup_service` 另加 `prune_frames_older_than(24h)` 兜底。
  - **决定不删 `stream_hub`**（原计划写的是「全部生效后才删除」）：它仍是**实时跟随**的唯一通道。帧持久化解决的是「重放的前缀是否完整」，跟随实时若改成 DB 轮询，只会更慢更吵，且真正要外置缓冲得等 LISTEN/NOTIFY（多实例）那一批。所以本片的收尾是「hub 的角色收窄为纯广播 + 实时跟随」，`MAX_EVENTS_PER_RUN` 不再决定续传完整性（它只圈定内存窗口）。
  - **实测验证**（把 `MAX_EVENTS_PER_RUN` 临时缩到 50 再跑真实链路）：一个 `last_event_id=0` 的旁观连接拿到了**从 seq=1 起、逐条连续、共 746 条**（= 库里 696 + 内存 50），证明内存窗口之外那一段确实由 `run_stream_frame` 补回；窗口恢复 2000 后重跑标准 e2e 全通过，且该 run 的帧在终态被清成 0 行（清理钩子实机生效）。
  - **仍未覆盖的边界（明确记录，非缺陷）**：
    1. ~~首轮流不经过 hub、规划阶段断连即杀任务~~ → **已于 2026-09-13 修复，见下节「批次 D 补 2」**。
    2. **进程重启后 run 已死**（单进程跑图，producer 随进程消失）：此时只能重放已落库的一段，没有可跟随的流，所以端点返回 410 交由前端刷新。要拿到「完整产出」的前提是 run 能被重新驱动 —— 那是**决定 2**（租约/回收）的事，不在本片。因此核心验收的准确表述是：**重启后按 `last_event_id` 仍能拿到重启前的完整输出，且后端不报错、前端不悬挂**。
    3. ~~刷新页面后审批卡不出现~~（**2026-09-13 核实：不成立**）——`useSessionRestore` 在 `latest_run.status === 'waiting_for_approval'` 时本来就会用 `execution_plan.sub_tasks` 重建 `pendingPlan`。所以「卡片丢失」只有**断线重连**这一种情况，本片已修；F5 一直是被覆盖的。
- [x] **决定 2 · run 租约（已完成 2026-09-13）**：`agentrun` 加 `owner` / `lease_expires_at` / `attempt` 三列（迁移 `20260913_000300`），新增 `utils/run_lease.py`（策略与判定）+ `services/run_lease_service.py`（supervisor：续租 + 回收），随 lifespan 启动，20s 一轮、TTL 180s。
  - **四处启发式的最终归属**（逐个核对过，不是「少一个机制」而是「一个机制说清一件事」）：
    1. **存活可见性** → 租约。心跳仍然写（`last_heartbeat_at` = 最后一次见到进展，诊断用），但**生死只由租约判定**；旧口径里前端只声明了心跳类型、无逻辑消费者。
    2. **僵尸回收** → `reclaim_expired_leases`。判据从「`updated_at` 30 分钟没动」变成「租约过期或无租约」。
    3. **并发互斥** → 同一个判定（`get_active_run_for_thread` 只认租约有效的活跃 run）。
    4. **请求去重** → **保持原样**（`RecoveryService._inflight_resume_by_run`）：它挡的是「同一秒内的两次 HTTP 请求」，是请求级幂等，不是 run 存活语义。两处都在注释里写清了区别。
  - **行为变化（都是有意的，各有测试）**：
    - 僵尸 run **不再挡住会话**：租约一过期即可开新任务（旧口径要等清理循环猜满 30 分钟）。冲突响应里带上 `lease_expires_at` 便于排查。
    - 崩溃后的冻结时间从最长 30 分钟缩到 **约 3 分钟**（TTL 180s）。取这个值不取更短是为了防误杀：进程「活着但事件循环被卡住」若被误判死，会出现「标记超时但实际仍在跑」的状态分裂，代价比多等几分钟大得多。
    - **NULL 租约 = 无存活证据**（迁移前的遗留行一律可回收）；迁移不回填假租约——部署必然伴随重启，那些行本就是僵尸。
    - `attempt`：创建 = 1，审批后续跑认领 = 2……仅用于排查，不出现在 API 里。实测 e2e 的 run 终态是 `attempt=2`，与设计一致。
  - **必须保留的既有语义（都验过）**：`pause_deadline`（HITL 等待期挂起预算）——等待中的 run 租约照续、deadline 为 None，因此**绝不被回收**；`deadline` 判据与流内守卫共用 `is_deadline_exceeded`（一处实现），租约有效但超预算的 run 仍会被回收（旧清理循环里 `deadline_at < now` 那条分支的等价物——写成「租约有效就跳过」会让预算变成死条款，这条被单测当场逮到）。
  - **实测验收**（`lease_verify.py`，真实 HTTP + 真实 DB + 真实 supervisor）：
    1. run 停在审批、进程活着 → 跨 3 个 supervisor 周期（60s）租约持续续期、状态不变（**不误杀**）；
    2. 把租约改成「别的进程持有且已过期」（模拟进程死亡）→ supervisor 回收为 `timed_out`，原因写明「运行进程失联（租约过期）」并释放租约（**能回收**）；
    3. 回收后该会话活跃 run 为空（**让位**，新任务可立刻开始）。
    标准 e2e（规划 → 审批 → 执行完成）同时重跑通过（5 任务、5 产物、`message.done`）。
  - **测试**：`tests/test_run_lease.py`（16 条，判定 + 读写点）、`tests/test_run_lease_service.py`（12 条，含「单轮失败不能让 supervisor 死掉」与「HITL 等待中的 run 不许回收」）。后端 **405 passed**。
  - **有意不做**：让租约承担「崩溃后自动接管续跑」（从 checkpoint 重新驱动图）。回收目前 = 标记超时（与旧行为一致），接管是另一个量级的特性；租约把它的前提（谁是活的）备好了，但没顺手改行为。

**注**：决定 1 的 token delta 处理已拍板为「进 journal，但用独立表 + ~200ms 批量提交」——批量是**提交批次**，一行仍只装一条事件（见第 2 片）。

### 批次 D 补 · 断流后的前端接管（2026-09-13，接在第 3 片之后）

**发现**：做第 3 片时顺手核对「410 之后前端到底怎么退化」，逐跳读代码后发现**那条降级路径根本不存在**——它是三处文档/注释（本文件、resume 端点 docstring、CHANGELOG v3.5.0 条目）共同声称、而代码从未实现的东西：

- `services/chat.ts` 把 410 吞进 `attemptResume()→false`，最终 reject 一个通用串；`useChatCore` 的 catch 只是往对话里插一条错误消息，并在 `finally` 里 `finalizeStream()` → `clearActiveRunId()`。
- 于是 `useRunPolling.startPolling()` 的两个前置（`activeRunId` 有值、状态机未终态）同时不成立：轮询永远不会被启动，服务端跑完的结果无人对账，用户只能手动刷新页面（或切走再回来触发 restore）才看得到。
- 顺带查出三个孤立缺陷：① 状态机的 `isTerminal` 是静态判断 → 同一页面里第一个 run 终态后，后续所有轮询都被永久拒绝；② `RunPollingBar` 的错误分支永远不可见（`ERROR_OCCURRED` 已把 `isPolling` 置 false，而 `show` 只看 `isPolling`）；③ 409「已有活跃任务」这条**证明有 run 在跑**的分支，反而把 runId 清掉了。

**修复**（全部复用既有件，没有新增 UI 形态）：
- `useRunPolling`：状态机记住当前跟踪的 `runId`，终态只对「那个 run」成立；START 在同一 run 已终态时拒绝、换了 run 则允许（并清掉 hasError）。补 8 条 reducer 单测。
- `useChatCore`：新增可选回调 `onStreamInterrupted(runId)`；中断/409 且 store 里还有 runId 时**保留 runId** 并插一条「连接中断，但任务仍在后台执行；完成后本页会自动更新」的提示，回调交由上层启动轮询。提示文案走 i18n 三语。
- 工作台把该回调接到 `startPolling`（`useChat` 先于 `useRunPolling` 调用，故用 ref 转一手，与 `useRunPolling` 内 `refetchRef` 同手法）。
- `ChatStreamPanel`：`show` 纳入 `hasError`，让「连接失败，请刷新重试 + 刷新按钮」这条设计好的分支真正可达。

**闭环**：中断 → 保留 runId + 启动轮询 → 轮询到终态失效缓存并触发 restore → 结果自动出现在对话里（用户无需刷新）。

**仍未验证**：这条链路**没有自动化测试**（需要真实浏览器里制造「服务端还在跑、前端连接断掉」），我这边只做到 tsc / eslint / `vite build` / reducer 单测全绿。手工验证方式：复杂任务批准后、执行中途拔网线（或切飞行模式）数秒再恢复，应看到「任务仍在后台执行」提示 + 运行中状态条，任务完成后结果自动出现。

### 批次 D 补 2 · 规划阶段断连不再杀任务（2026-09-13）

**问题**：首轮流的图执行跑在 SSE 生成器里，客户端一断连（含按 F5 刷新）Starlette 就 `aclose()` 生成器 → 图循环被放弃 → **这个 run 当场死亡**，用户重发才能恢复；而断连期间错过的 `human.interrupt` 意味着**审批卡再也不会出现**。

**改法**（结构与恢复流 `execute_langgraph_stream` 对齐，正文零重写）：
- 原生成器正文整体改名为 `_run_graph()`（缩进不变、`yield` 改成 `await emit(...)`），外面套一个 `producer()`：分离任务里执行正文，finally 里收尾（`finish_blocking` 刷净帧 → `hub.close` → 投 `done` 哨兵）。
- `event_generator()` 退化为纯传输：取队列 → 下发，长静默期发心跳并顺带检查取消；`except asyncio.CancelledError` 里只 `add_done_callback`（取回异常防噪音）+ 记日志 + re-raise，**不取消 producer**。
- `emit()` = 内容事件唯一出口（分配 seq → hub 广播 → 入待写缓冲 → 投递消费者）；`emit_transport()` 只投 `[DONE]` 这类传输标记（不进重放缓冲）。
- 终端清理从 `delete_checkpoints_for_thread` 改走 `cleanup_terminal_run`（顺带清帧），与其余五处终态调用点一致。

**读端配套（这一步不做的话审批卡照样回不来）**：本轮流收尾后缓冲是关闭的，而断连的客户端恰恰需要这一轮里的 `human.interrupt`。于是 resume 端点在「**run 停在审批点**且没有可跟随的实时通道」时改走**整段重放**：`load_replay_frames`（新，上限 2000 条）取回该段全部帧 + 补一个 `data: [DONE]` 收尾（这一轮本就是正常收尾的，前端据此干净结算，不会误报「回答被截断」）。其他情况（还在跑却没通道 / 已终态）仍 410。

**实测验证**（`C:\Users\alex1\AppData\Local\Temp\verify_plan_drop.py`，一次性脚本不入库）：规划中途只读 3 秒就掐断 socket →
- run **在无客户端的情况下自行到达 `waiting_for_approval`**（证明 producer 未被断连杀死，且暂停检测/状态/账本/deadline 这批 DB 写在请求作用域 session 被回收后照常落库——这原本是我担心的一个坑）；
- 之后 `last_event_id=0` 重新 resume：HTTP 200，重放里含 `human.interrupt`、以 `[DONE]` 收尾 → **审批卡能自己回来**。
标准 e2e（规划→审批→执行完成）同时重跑通过。后端 **295 passed**。

### 批次 D 补 3 · 轮询状态机的两处生命周期错配（2026-09-13，用户实测报出）

**用户报的现象**：会话 A 的审批卡不点（run 停在 `waiting_for_approval`）→ 刷新页面 →
点「新建会话」→ 底部残留「正在恢复任务连接… (Unknown)」的加载条，直到整页刷新。

**根因（两处，同一类问题的两面）**：

1. **轮询状态机与它的输入脱钩**。轮询唯一的输入是 `store.activeRunId`（查询的
   enabled 与 queryKey 都靠它），而清空它的路径不止一条——`WorkbenchPage.handleNewChat`
   调 `resetAll(true)` → `resetUI()` 会把 `activeRunId` 置空——**停轮询却只有一条路**
   （`useChatSessionHandoff` 的「没有可控任务」分支），而那条路前面会先被 `!isRestored`
   拦掉（新建会话时 restore 被禁用/重置）。结果：状态机停在 `polling`/`hitl_paused`
   （`isPolling` 仍为 true），查询被禁用 → 状态永远取不到 → 假加载条常驻。
   修法是不变量式的 `isPollingOrphaned(state, activeRunId)`：**有轮询状态却没有 run 就停**，
   覆盖未来所有「清 runId」的路径，而不是只补「新建会话」这一处。
2. **「卸载时停轮询」的 cleanup 依赖写错**。原写法是
   `useEffect(() => () => {...}, [state.isPolling, stopPolling])`——依赖变化就会跑 cleanup，
   而 cleanup 读的是**闭包里旧的** `isPolling`，于是 HITL 暂停（status 变化 → `stopPolling`
   换引用 → 触发 cleanup）会把刚暂停的轮询直接停成 `idle`。后果不止界面：审批在**别的
   标签页/任务控制页**被处理时本页没人轮询，「run 在别处收场 → 撤下过期审批卡」这条
   兜底就永远不会触发。改为空依赖 + ref（与文件内 `refetchRef` 同手法）。

**顺带**：`RunPollingBar` 在状态尚未取到时不再显示 `(Unknown)`（那是内部词表的兜底值，
对用户是噪音），只显示「正在恢复任务连接…」。

**验证**：新增 `hooks/__tests__/useRunPollingOrphan.test.tsx`（3 条，`@testing-library/react`
+ 真实 store + 真 QueryClient，把用户的操作序列按 `resetAll(true)` 原样重放）与 3 条
reducer/纯函数断言。**反向对照**：把修复回退后 3 条全红（其中 2 条即用户报的现象），
恢复后全绿——证明测试真的覆盖这两条路径，而不是"看着像"。前端 69 passed。

### 批次 D 补 4 · 租约不得回收「停在审批点」的 run（2026-09-13，**我自己引入的回归，用户实测报出**）

**用户报的现象**：复杂任务跑到计划审批后，「审批计划」这个选项过一会儿就没了（刷新也不回来）。

**根因（决定 2 落地时漏掉了一条既存例外）**：存活判定写成了「owner 是本进程 + 状态活跃 → 续租」，
而停在 `waiting_for_approval` 的 run **必然没有续租者**——这一轮流已收尾，没人再驱动图，而续租只发生在
「本进程持有的活跃 run」上。我处理了 `deadline`（`pause_deadline` 把它置空）却漏了**租约**。
于是进程一换人（`uvicorn --reload`／部署重启 → `RUN_OWNER_ID` 变了），旧 owner 的租约不再被续，
TTL(180s) 一过就被 `reclaim_expired_leases` 判成「运行进程失联」并 `timed_out`。
**实测数据**：一小时内 5 条待审批 run 全被误杀（`error_message=运行进程失联（租约过期），已标记为超时`），
用户侧看到的就是审批卡消失、任务再也批不了——**生产每次部署都会触发同一条件**。

**修法**：存活判定收敛成 `crud.agent_run.run_holds_thread`（互斥与回收**共用同一处**）：
`waiting_for_approval` **无条件算活着**（它等的是人，不是进程），其余活跃状态照旧看租约。
旧清理循环本来有这个语义（stale 判据不碰等待中的 run），换机制时只搬了 `deadline` 那条——
**「换机制要把旧例外逐条搬过来」的又一次教训，已记入 8.1**。

**验证**：新增 `test_does_not_touch_hitl_paused_run_with_expired_lease`（旧的同类测试用的是**有效**租约，
所以一直绿灯——看着覆盖了其实没有）与 `test_expired_lease_paused_run_still_holds_thread`（互斥侧：
停在审批点的 run 在过期租约下仍占着会话）。**反向对照**：去掉例外判据 → 两条全红，恢复 → 全绿。
**实机**：把一条待审批 run 的 owner 改成外来进程、租约改成过去 → 等 2 个 supervisor tick 后仍是
`waiting_for_approval`（修复前会变 `timed_out`）。后端 `pytest` 407 passed。

### 前端补 · SSE 去重的作用域必须是 run，不是页面（2026-09-13，用户实测报出）

**用户报的现象**：「复杂任务对话完，审批计划这个选项没出来，需要刷新页面才会出现」＋
「点会话记录打开都是首页，都需要强刷才能正确展示内容」（两个症状同一个根因）。

**根因**：SSE 帧 id 是 **run 级 seq**（`frame_recorder.reserve_seq`：每个 run 都从 1 开始，进程重启从库里续号），
而 `EventHandler.processedEventIds` 是**页面级单例**——全站代码从不调用 `clearProcessedEvents`（只有测试调）。
于是同一标签页里的**第二个 run**，其 seq 1..N 与上一个 run 的 1..N 撞 id，**头部帧被当成重复静默丢弃**
（`router.start` / `plan.created` / `human.interrupt` 依次在其中）→ 审批卡不出现、思考面板空白、会话看着
像空的一样。硬刷 = 新页面 = 空集合，所以「刷一下就好」——这也解释了它为什么只在这个长开着的标签页里重现。

**证据链**：库里两条 run 的帧表**同号**（都从 `seq=1` 起、`human.interrupt` 都在第 6 帧）＋ 单测反向对照
（去掉 run 作用域 → 那条测试红）＋ 浏览器同页连跑两个复杂任务（修复后第二个的审批卡与步骤正常）。

**修法**：`handle(event, runScope)` 的 key 变成 `${runScope}:${event.id}`，调用方（`services/chat.ts` 的
`handleMessage`）传 `activeRunId ?? 本次请求的随机 id`（run id 由 `X-Run-ID` 头在 onopen 拿到，先于任何一帧）。
**同一 run 内仍然去重**：补放与实时跟随的重叠窗口里同一个 seq 可能到两次（客户端 seq 游标是第一道保险，
这个 Set 是第二道），不能顺手删掉。

### 前端 · 思考面板按专家分组（2026-09-13，打样）

**动因**：蓝图里各专家的活是**看得见谁在干**的（署名/色点/移交/实时面板），而实现里所有任务平铺在
「思考过程」里，每行都是「任务执行 · analyzer」——既看不出谁在干活，也看不出哪几行是同一个人；
而且行内色点取的是 `expertColor(step.type)`，任务步骤 type 恒为 `execution` → **所有专家同色**，
恰好把蓝图最重要的那条寻路信息抹掉了。

**做法**（`lib/thinkingGroups.ts` 纯函数 + `ThinkingProcess` 渲染）：
- **组 = 专家**（相邻、同一专家类型的任务合并），组头 = 识别色点 + 显示名 + 任务数 + 「进行中」；
  组内 = 该专家的任务行（行标题改用**任务描述**，产出正文在其下方——新增 `ThinkingStep.taskDescription`，
  因为 `content` 会被产出正文覆盖）。
- 编排类步骤（智能路由/任务规划）不参与分组，仍按原位内联——时间顺序不重排。
- 串行执行时自然退化成「一位接一位」；并行（C2 波次扇出）时多个组同时亮，用户看到的是真实情况，
  而不是被前端拉直的假串行。
- 计数改成数**任务**（`已完成 / 计划任务数`），顺手修掉「2/1」这种分子分母不同口径的读数。
- **显示名收敛为一处**：删掉死代码 `translateExpertName`（写好却零调用，词条还与 chat.ts / home.ts 各写一半），
  真相源是 `lib/expertIdentity.EXPERT_TYPE_LABEL_KEY` + `hooks/useExpertLabel`（先查自定义专家列表
  `GET /agents` 里的名字，再落静态词条，最后退回 key 串）。审批弹窗与修订对照也一并换过来
  （此前显示的是「search 执行」这种原始 slug）。

**已知缺口（留给协议改动）**：系统专家的**改名**读不到——权威名在 `systemexpert.name`（管理员可在控制台改，
如 `aggregator` 的显示名是「首席联络官」），而 `GET /admin/experts` 是管理员端点。彻底解法是让显示名随
`task.started` 一起下发（协议加字段 + 更新协议闸门），**不要再加第四份映射**。

**验证**：`lib/__tests__/thinkingGroups.test.ts` 9 条；实机跑通一个 4 专家 / 6 任务的复杂任务，面板呈
「规划专家(1) → 搜索专家(3) → 研究专家(1) → 首席联络官(1)」四组、计数 `6/6`、每组产物内联可点。
**未实机覆盖**：两个组**同时**「进行中」的画面（本该用并发上限 = 2 演示，测试期间该会话登录态过期、
resume 流返回 401，只能靠单测覆盖状态聚合）。

### 前端补 2 · 思考面板的「账本重建」从未生效（2026-09-13，查上面那条时顺带查实）

**现象**：刷新或切会话回来后，思考过程面板一律空白（只有正文），而设计上它应当从运行事件账本重建。

**根因（两处漏字段，链路因此断在第一句）**：
1. `useSessionRestore.attachThinkingFromTimeline` 的第一句是
   `if (!run?.id || !run.started_at) return messages`——它要靠 `started_at` 判定「这条助手消息确由本次
   run 产出」；而线程详情响应里的 `latest_run`（`AgentRunSummaryResponse` + `thread_service._serialize_run`）
   **两个地方都没有 `started_at`** → 每次恢复都在第一句返回。
2. 于是整套能力（含 `lib/thinkingStepsFromTimeline` 与它的测试）**从落地起就是死代码**——测试只覆盖了
   纯函数，没人验证「字段拿得到」。

**修法**：`AgentRunSummaryResponse` 与 `_serialize_run` 补 `started_at`（前端 `AgentRunSummary` 类型同步）。

**验证（实机，可复现）**：页面里用 Vite 模块图直接跑真实重建函数验证输入充分
（真实账本 → 8 步、守卫放行）；会话内往返一次，网络记录里出现 `/runs/{id}/timeline?limit=200`，
面板出现且读数为 `6/6 思考完成`，分组结构与实时一致（智能路由/任务规划内联 + 规划专家组 + 搜索专家组含 3 任务）。

**顺带修**：`ChatStreamPanel` 不再把「历史消息的全部步数」当分母（那会把路由/规划也算成任务，
读出「6/8」这种两口径混算的数）——历史消息现在用面板自己的**任务步数**当分母。

**再顺带修（同类：恢复路径的展示口径）**：恢复出来的消息时间戳差一个时区——`MessageItem.formatMessageTime`
用**裸 `new Date(iso)`** 解析后端返回的「无时区 UTC naive」字符串，浏览器按本地时区解析，
UTC+8 下少 8 小时（实时消息带 `Z` 所以只有恢复路径错）。这正是 `lib/datetime` 约定里禁止的写法
（裸 `new Date(iso)`）。同族修掉 ExpertEditor 的「更新时间」与 ProfileSection 的「注册时间」两处；
另有两处 `new Date(timestamp)` 只用于**排序**（统一偏移不改序，无害）故未动。实机验证：
恢复后的消息头显示 21:30 / 21:39（本地），修复前为 13:30 / 13:39（UTC）。

### 批次 E · 收尾项（可穿插，独立价值）

已完成（2026-09-13）：
- [x] **alembic 日志 handler**（`3489eb4`）——`fileConfig` 无条件清 handler 致启动后应用 INFO 日志全消失。**已实机验证**。注意此前只修 `disable_existing_loggers` 不足——该参数不阻止 handler 被清除。
- [x] **per-tool_call 重试 + per-tool 超时**（`0f72f4d`）。**关键机制发现**：`handle_tool_errors` 在 `execute` 内部执行，异常那步已被转成消息 → awrap 包装器看不到异常 → **重试不可能发生**。故 `handle_tool_errors=False`，由包装器统一负责超时/重试/降级（用 `request.tool_call` 的真实 id 构造错误消息）。**原计划「工具错误走 handle_tool_errors」对需要重试的场景不成立。**
- [x] **LLM 调用超时**（`e72ab69`）——按节点性质分两种语义：`generic` 用节点内 `asyncio.timeout`（任务级失败，其余任务继续）；`commander`/`aggregator` 用节点级 `TimeoutPolicy`（悬挂则整轮无救，快速失败）。配置 `LLM_CALL_TIMEOUT_SECONDS` 默认 420s。**已 e2e 验证**。
- [x] 顺带修：`_apply_updated_plan` 依赖清理用 db uuid 建集合而 `depends_on` 存 commander id → **编辑计划即清空所有依赖**（`73e8a3e`）。

待做：
- [ ] 决定 6：事件 schema 生成 TS 类型（**需要用户先定 codegen 挂在哪**：构建期 / 提交前钩子 / CI 校验）。
- [x] ~~决定 7：配置缓存去全局化~~ → **第一刀已完成（`0283b02`）**：全局 epoch 失效 + 删注册表。DI 与另外两处缓存（tool_policy 自带 invalidate、graph_builder 的 LLM lru_cache）有意未纳入，见决定 7 章节。
- [x] ~~commander / plan_revision 改 `with_structured_output(..., include_raw=True)`~~ → **已完成（`b2fabe3`）**，删掉手抽 JSON ~90 行，e2e 通过。
- [ ] `Runnable.with_fallbacks` 运行时模型降级——**待用户决定**。我的建议是不做：它会让 provider 在运行时被静默切换（DeepSeek 抖动改由 Moonshot 出计划），而模型质量是用户在刻意管控的（停用 MiniMax 即例），与刚清扫完的「静默降级」缺陷同类。
- [x] **前端第二批（2026-09-13）**：
  - ✅ **自研 persist 退役**：删除 `store/middleware/persist.ts`（155 行，仅 taskStore 在用），改用 zustand 官方 `persist`（与 chatStore/themeStore 同一套）。Set 过不去 JSON 边界，用 `partialize`（Set→数组）与 `merge`（数组→Set）两头配对——这是**静默丢状态**的典型位置，新增 `store/__tests__/taskStorePersistence.test.ts` 三条把它钉住（含版本不匹配不污染状态）。
  - ✅ **`use-toast` 换 `useSyncExternalStore`**：此前是自建监听器集合 + 每个订阅者各持一份 `useState`（并发渲染下会撕裂），现在只留一份模块级快照。对外 API 不变（`pushToast`/`dismissToast`/`useToast`），20 处调用点零改动。顺带把 toast id 从 `Math.random()` 换成递增序号（DOM key 不需要随机性，也避免安全扫描误报）。
  - ⏸️ **`useSessionRestore` Query 化：有意不做**。理由：这个 Hook 是「取数 → 一次性写进两个 store」的命令式应用（约 15 处 store 写入 + 派生标志），不是渲染期派生；它的触发策略（5s 防抖 + visibilitychange + 活跃流检查 + `force`）是产品语义，改成 Query 后仍要保留这套触发逻辑，等于**多一套缓存/失效机制**而不是少一套。Query 的收益（去重/缓存/重试）在这里几乎为零，风险却压在用户已实机验证过的恢复时序上。真要动，应先有「恢复时序」的自动化测试（当前只有 e2e 目检）。
  - ✅ **本地任务副本已删除（2026-09-13，续九）**：`createTaskSlice`（tasks Map / tasksCache / 任务 CRUD）与 `createArtifactSlice` 整体删除，`createUISlice` 同时删掉三组只写不读的状态（`selectedTaskId`/`selectTask`、`progress`/`setProgress`、以及从没被写入过的轮询影子字段）。逐个核对消费者：**没有任何组件订阅 tasks / tasksCache / task.artifacts**；产物与任务一律以服务端为唯一真相。代价不是内存，而是双真相源——本地留一份就要维护同步时机，漏一次就表现为「界面与执行状态对不上」。
    - 处理器的死写点一并清掉（`initializePlan` / `startTask` / `completeTask` / `failTask` / `addArtifact` / `selectTask` / `setProgress`），保留的是真有 UI 消费者的部分：思考步骤、`runningTaskIds`、模式与初始化标记、`pendingPlan`（其元素形状本就是协议类型 `TaskInfo`，弹窗要的也是它）。
    - **验证**：新增 `handlers/__tests__/handlersRealStore.test.ts`——**不用桩 store**，直接拿真 store 喂真实事件，任何「处理器引用了已删除的动作」都会当场抛错（这是那条「需实机验证」的自动化版本）；另外用浏览器在真实 dev 环境跑了一遍完整链路（规划 → 审批弹窗 → 批准 → 执行），确认 4 个任务步骤与耗时、步骤下内联产物卡、产物画布、最终综述全部正常，控制台无异常。前端 66 passed。
    - 顺带记录一个**先前就存在**的观察（未修）：run 正常结束后，左侧会话列表的「运行中」标记可能残留一段时间——它读的是会话列表接口缓存，而流收尾时的 invalidate 与该 run 的 completed 落库存在竞态。与本清理无关（该标记从来不由本地任务副本驱动），记为待办。

- [ ] 记忆迁 `AsyncPostgresStore.asearch`（**不值作为换而换**，等记忆要升级为产品功能再做）。

**已否决（不要再提议）**：
- 「用 `ToolNode(handle_tool_errors=...)` 生成工具错误消息」——与按调用重试互斥（见上）。
- 给 `generic` 加节点级 `TimeoutPolicy`——会让单个慢任务拖死整轮（有测试守护）。

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
4. **换机制时漏搬旧机制的例外**（2026-09-13，租约误杀待审批 run）：决定 2 用「租约」替换旧的
   「心跳 + `updated_at` 30 分钟没动就猜死」时，我搬过来了 `deadline` 语义（HITL 等待期挂起），
   却漏了旧清理循环里的另一条例外——**等待审批的 run 不算僵尸**。结果进程一重启（部署即触发），
   所有停在审批点的 run 在 TTL 后被批量标成「运行进程失联」，用户报「审批计划这个选项没了」。
   更值得记的是**测试为什么没抓住**：既有的同类测试用的是「租约有效的等待中 run」，而真实路径里
   它的租约**必然已过期**——测试绿灯但覆盖为零。
   → **教训：① 替换一个判据前，先把旧判据的每个分支/例外列出来逐条对照；② 给「特殊状态」写测试时
   要问「这个状态在真实路径下长什么样」，别用理想化的输入（有效租约）去测它。**

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
| **alembic `fileConfig` 清 handler（已修 2026-09-13）** | `logging.config.fileConfig` 会**无条件**调用 `_clearExistingHandlers()`，且 `alembic.ini` 是 `[logger_root] level = WARNING`。进程内迁移一跑，应用的 INFO 日志全部消失（ERROR 仍走 stderr，故"部分可见"更具迷惑性）。v3.5.0 曾因此让生产 500 难以定位，当时只修了 `disable_existing_loggers`——**该参数并不阻止 handler 被清除**。现 `migrations/env.py` 仅在应用未配置日志时（CLI 场景）才套用 alembic.ini，判据用 `setup_logging()` 打在 root 上的幂等标记。**已实机验证**：迁移后的 `[Database] schema aligned` / `[Lifespan] ...` / `[SessionCleanup] ...` / 带 request-id 的请求日志全部可见。 |
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

## 9. 当前状态快照（2026-09-13 晚）

- **分支**：`feat/redesign-workbench`，`origin/main` = `02f333f`（本地领先 **55** 个 commit，**未推送**）
- **已发布**：v3.5.0（tag 停在 `3e060e2`；两个 hotfix 未进 tag，随下次发版带上）
- **生产**：v3.5.0 已部署、500 已修。**注意**：`origin/main` 尚未含批次 B 之后的工作，生产也尚未拉取后续修复。

**本轮（决定 2 之后）追加修复**（均已完成实机验证，见批次 D 补 4 / 前端补两条）：

| 内容 | 触发 |
|---|---|
| 租约不得回收「停在审批点」的 run（`run_holds_thread`） | 用户报「审批计划这个选项没了」——我引入的回归，一小时内误杀 5 条待审批 run |
| SSE 去重作用域改为 run（原本全页面共用一个 Set） | 用户报「审批卡不出现 / 打开像首页，都要强刷」——同页第二个 run 的头部帧被静默丢弃 |
| 思考面板按专家分组 + 专家显示名收敛 | 用户提出「专家应当看得见谁在干」 |

**测试状态**：后端 `pytest` 407 passed；前端 `tsc` 全绿 + `vite build` 通过 + vitest 92 passed。

**本地服务**：后端 `run.py` 于 3002（PG 容器 `xpouch-postgres`）。

---

## 10. 验收口径（每批次适用）

- **批次 A**：`pytest` + `tsc` 全绿；简单消息流式正常；复杂任务到审批页正常。
- **批次 B**：五条特征测试（resume / revise / cancel-during-wait / 幂等重放 / 审批期超时）通过；checkpoint 不随消息线性增长。
- **批次 C**：含并行层的计划跑通；审批页可见分层；单分支失败可降级；限流上限可配。
- **批次 D**：`run_stream_frame` 有帧落库且终态被清；续传在「客户端落后于内存窗口」时仍拿到完整输出（缺口由库里帧补回）；重启后按 `last_event_id` 能拿到重启前的完整输出且不报错、不悬挂；**规划阶段掐断连接后 run 仍自行到达审批点，且重新 resume 能把 `human.interrupt`（审批卡）重放回来**。
- **通用**：`plan.thinking` 事件、失败兜底语义、工具错误话术三条不回归。

---

## 附：派生文档

- `docs/langgraph-native-audit.md` —— 框架原生化审计（19 处自研机制逐条对到 langgraph 1.2.11 / langchain 1.3.18 的结论，含「官方有 / 官方没有 / middleware 挂不上」三档判定）
- `docs/design/REDESIGN-NOTES.md` —— UI 设计体系（token 三层 + 自研语义皮 + Radix 行为芯）
