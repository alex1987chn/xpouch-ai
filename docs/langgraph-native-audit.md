# LangGraph / LangChain 原生化审计与迁移方案

日期：2026-09-13
版本基线：langgraph 1.2.11 · langgraph-checkpoint 4.2.0 · langgraph-checkpoint-postgres 3.1.2 · langgraph-prebuilt 1.1.0 · langchain 1.3.18 · langchain-core 1.6.1 · langchain-openai 1.6.0 · langchain-deepseek 1.1.0

结论摘要：项目 2026 年 1 月起写，当时框架早期，若干能力只能自研。审计后确认——
**约 6 处是「当时迫不得已、现在官方有更好答案」；约 10 处是「官方真没有、必须自研」；3 处是「上层封装（middleware）只能配 create_agent，而 create_agent 装不下本项目业务管线」，应用底层原语而非 middleware。**

---

## 一、判定规则（回答「官方的就更合理吗」）

不是。按能力性质分三档：

| 档 | 性质 | 判定 | 典型 |
|---|---|---|---|
| A | **状态机 / 调度 / 中断 / 持久化**——框架核心职责 | 官方必然更优；自研是在还债 | 中断恢复、事件消费、节点超时、结构化输出 |
| B | **跨请求 / 跨进程 / 业务语义 / 运维语义**——框架设计边界之外 | 必须自研；硬套会功能退化 | run 级 deadline、协作取消、事件账本、SSE 断线续传、计划乐观锁 |
| C | **上层封装**（`langchain.agents.middleware` 全家桶） | 只有迁到 `create_agent` 才生效；本项目是手写 StateGraph，**挂不上** | HITL / 摘要 / 限流 / 模型降级 middleware |

**关键架构判词：不要把编排层迁到 `create_agent`。**
`create_agent` 的模型是「一个 ReAct agent + messages + tools」。本项目的管线是
`router → commander(产出持久化计划) → 人工审批(可编辑) → 逐任务分发 → 聚合`，
计划要落 `ExecutionPlan`/`SubTask` 表、要能被用户改、要走 HITL、要按 task 归集产物。
硬塞进 `create_agent` 会在「计划持久化 / 审批语义 / 逐任务产物归属」三处持续对抗框架。
因此 C 档一律绕开，改用与手写图天然兼容的底层原语：`interrupt()`/`Command`、`TimeoutPolicy`、`RetryPolicy`、`CachePolicy`、`Runnable.with_fallbacks`、`BaseStore`、`stream_mode`。

---

## 二、审计清点结果

### A 档：官方更优（应替换）

| # | 现状 | 位置 | 官方答案 | 风险 |
|---|---|---|---|---|
| A1 | `interrupt_before=["expert_dispatcher"]` + 外层 `while` + 启发式中断检测 + `HumanMessage` 注入恢复 + `{thread}_{run}` 隔离 | `graph_builder.py:132`；`stream_service.py:773-974`、`:590-598`、`:1035-1115`、`:149-153` | `interrupt()` + `Command(resume=)`；审批独立成节点，靠**拓扑**表达「任务切换不再经过审批」 | 高 |
| A2 | `astream_events(version="v2")` 原始 dict 解析 + 7 处手写 `node_type` + tag 约定 + `'"decision_type"' in content` 字符串嗅探 | `stream_service.py:1121-1223`；`node_type` 写在 `router.py:141/157/365`、`generic.py:502`、`aggregator.py:81`、`commander.py:634/718` | `stream_mode=["custom","messages","updates"]`；`metadata["langgraph_node"]`（全库零命中） | 低 |
| A3 | commander / plan_revision 手工抽 JSON（`_extract_json_string` 43 行 + 手绑 `response_format={"type":"json_object"}` + 伪 tenacity 38 行 + `constants.py` 内嵌 36 行手写 schema） | `commander.py:572-691`；`plan_revision.py:118-124`；`constants.py:102-138` | `with_structured_output(ExecutionPlan, method="function_calling", include_raw=True)`；router 已用、DeepSeek 已原生支持 | 中 |
| A4 | 工具错误分类后手工构造 `ToolMessage` 回灌（含 `tc.get("id","unknown")` 无效 id 兜底） | `tool_runtime.py:123-138`、`:277` | `ToolNode(handle_tool_errors=<callable>)` | 低 |
| A5 | 节点级超时**完全空缺**——LLM 悬挂只能等 run 级 900s deadline 才被杀 | `generic.py:498`、`commander.py:630`、`aggregator.py:85` | `TimeoutPolicy` 挂三个节点 | 低 |
| A6 | 工具重试粒度错误：重试**整个 ToolNode**，多 tool_call 时会把已成功的工具重复执行（MCP 写类有重复副作用） | `tool_runtime.py:240-266` | `awrap_tool_call` 按单个 tool_call 重试 | 中 |

### B 档：官方真没有（必须保留，不要动）

| # | 机制 | 位置 | 为何不可替代 |
|---|---|---|---|
| B1 | run 级 deadline 三层生命周期（创建 / 审批期 `pause_deadline` 挂起 / 批准时 `reset_deadline`） | `run_lifecycle.py:61-82`、`crud/agent_run.py:66` | `TimeoutPolicy` 是**单节点、单次图调用内**的墙钟；本项目预算跨 HTTP 请求、跨多次图调用，且**审批等待期不消耗预算**——官方无「预算可暂停」概念 |
| B2 | 协作式取消 `_raise_if_run_cancelled`（跨进程、DB 可见） | `parts/event_builders.py:45-77` | 官方取消是进程内 asyncio 范畴；本项目要跨请求 + 落 DB + 清理服务兜底「进程死了预算还在」 |
| B3 | 心跳（DB `last_heartbeat_at` + SSE idle heartbeat） | `crud/agent_run.py:208-224`、`utils/sse_builder.py:90` | 同上，运维可见性语义 |
| B4 | **RunEvent 事件账本**（append-only 15 类事件） | `models/domain/run_event.py`、`crud/run_event.py` | checkpoint 存 channel 快照，不是「谁在第几版批准/哪个任务产出/修订为何失败」的时间线；`routers/runs.py` 的 plan/timeline 直接吃它 |
| B5 | **stream_hub SSE 断线续传**（seq 注入 + 缓冲重放 + 中途订阅） | `services/chat/stream_hub.py` | 开源版无事件缓冲/seq/重放；Platform 的 `join_stream` 属服务端产品且自述「不缓冲」 |
| B6 | 计划版本乐观锁 CAS + 恢复幂等键 + 线程级活跃 run 互斥 | `recovery_service.py:583-626`、`:513-557`、`crud/agent_run.py:111-138` | 多端并发审批的正确性保障 |
| B7 | `task_list` / `expert_results` 的整值重建（非 reducer） | `state_patch.py`、`generic.py:633-666` | 换成 `operator.add` 会让节点重跑产生重复条目，而 `current_task_index` 与列表耦合 → 索引错位。**保持就是对的** |
| B8 | ToolPolicy 风险分级 / 专家黑白名单 / DB 覆盖 | `agents/tool_policy.py` | 纯业务治理 |
| B9 | `recent_artifacts` 有界摘要 + `get_artifact` 按需读 | `tools/artifacts.py:69-97` | 业务 artifact 概念，middleware 管不到 |
| B10 | checkpoint 清理（`adelete_thread`） | `utils/db.py:158-189` | **已验证**：`aprune` / `adelete_for_runs` 在本版本是 `NotImplementedError`；现状已接近该版本最优 |

### 已原生（无需动，作为对照）

- 节点→SSE 事件通道：`adispatch_custom_event` + `on_custom_event(name="sse_event")`（`agents/event_stream.py`）——**本仓库唯一一处原生 HITL 级正确用法**。
- `messages: Annotated[list, add_messages]`（`state.py:16`）。
- `JsonPlusSerializer(allowed_msgpack_modules=[...])`（`utils/db.py:114-128`）——构造参数可对齐 `with_allowlist`（已验证实现存在），但「自定义枚举须登记」这一点任何方案都改不掉。
- `ChatOpenAI(max_retries=)` 承担模型重试（tenacity 双包裹已在 Batch 1 移除，那次清理是对的）。
- 条件边 `add_conditional_edges` + `route_*`。
- 前端：TanStack Query 的 `refetchInterval` / `onMutate` / `useInfiniteQuery` / queryKey 工厂**已全面到位**。

---

## 三、本次审计新增发现（含对既有报告的纠正）

1. **【纠正】`aprune` / `adelete_for_runs` 不可用**——`langgraph-checkpoint-postgres 3.1.2` 中二者为 `NotImplementedError`（已读源码验证）。任何「用它们替代手写清理」的建议作废。
2. **【纠正】middleware 全家桶挂不上**——`HumanInTheLoopMiddleware` / `SummarizationMiddleware` / `ModelCallLimitMiddleware` / `ModelFallbackMiddleware` / `ToolRetryMiddleware` 均要求 `create_agent` 编排。本项目手写图 → 须用 `interrupt()`、`with_fallbacks`、`TimeoutPolicy` 等底层原语等价实现，或接受空缺。
3. **【死代码 350+ 行】不可达链路**——`commander.py:695-765` `_streaming_planning_fallback`（71 行）零调用方；`utils/json_parser.py`（280 行）唯一调用点在其内部（`commander.py:758`）→ 整模块不可达。另有 `extract_json_blocks`、`is_valid_json`、`get_models_by_provider`、`list_available_providers`、`clear_llm_cache`、`get_llm_cache_info` 无调用方。
4. **【潜在炸弹】provider `enabled` 与 key 存在性判定不一致**——`is_provider_configured`（`providers_config.py:191-201`）只看 env key，`_build_llm_instance`（`llm_factory.py:160-161`）却会因 `enabled: false` 抛错。`providers.yaml:62` 的 openai 即 `enabled: false`。**配了 `OPENAI_API_KEY` 就会让 commander 规划静默退化为空计划**。
5. **【真根因】`streaming=True` 硬编码**（`llm_factory.py:291/296/307/316`）使 commander / expert / plan_revision 的 `ainvoke` 在框架层**偷偷改走流式**（`langchain-core` `_should_stream`：实例字段显式设为 True 即触发）。这才是 `stream_service.py:1150-1190` 那一大段「过滤 commander/expert 的 message.delta」的存在理由——先流式聚合、再丢弃。
6. **【依赖脆弱】`langchain` 不是直接依赖**——由 `langchain-tavily` 传递带入（uv.lock:1037-1042）。一旦 tavily 降级，`langchain.agents` 相关 import 会断。
7. **【记忆接线不全】**——`user_memories.embedding` 有 `Vector(1024)` 但**无 hnsw/ivfflat 索引**（逐行算距离）；`memory_type` 声明 4 种值但唯一写入路径硬编码 `"fact"`；`get_user_memories`/`delete_memory` 零调用方；记忆无任何 API/UI 入口。
8. **【前端】React 19 API 采用度 = 0**（除 `useLayoutEffect` ×3）。自研 persist 中间件（`store/middleware/persist.ts`，154 行）与官方 `zustand/middleware` persist **同仓并存**（`chatStore`/`themeStore` 已用官方）；`use-toast` 手写订阅（应为 `useSyncExternalStore`）；`useRunPolling` 用 100 行状态机描述 query 自身状态。
9. **【前端真 bug】**——`useChatCore.ts:382-385` 用 `slice(0, -2)` 按位置回滚 401 失败消息（插入系统消息后切错，应按 id）；`useConversation.ts:32-43` 删会话后**不失效任何缓存**；`services/chat.ts:238` 续传连接未持续 `updateActivity`，共享 signal 会被主连接心跳 120s 后误杀。
10. **【契约脆弱】节点元数据契约自建**——`metadata["node_type"]` 是各节点手写进 `RunnableConfig` 的自定义键，框架不保证；官方对应物 `langgraph_node` 全库零命中。

---

## 四、最终方案（分档执行）

### Tier 0 · 纯收益，零行为变更（可立即做）

| 项 | 位置 | 量 |
|---|---|---|
| 删不可达死代码 | `commander.py:695-765`、`utils/json_parser.py` 整模块、无调用方导出 | −350+ 行 |
| 修 provider `enabled` 判定不一致（爆炸半径：commander/aggregator） | `providers_config.py:191-201` | ~3 行 |
| `recursion_limit` 硬编码 → `settings.recursion_limit` | `stream_service.py:141/415/736` | 3 行 |
| 删死分支：`routing_policy.py` 时间窗（`additional_kwargs` 无写入者，恒 None）、`generic.py:534-535` 的 `TimeoutError`、`routing_policy.py:43` 重复 import | 3 处 | ~25 行 |
| 前端：3 条删除会话路径收敛到已有 mutation（顺带修 `useConversation` 不失效） | `SessionStrata.tsx`、`useConversation.ts`、`useChatHistoryQuery.ts` | 删死代码 + 修 bug |

### Tier 1 · 事件消费端原生化（低风险，独立于审批迁移）

`astream_events(v2)` dict 解析 → `stream_mode=["custom","messages","updates"]`；`metadata["langgraph_node"]` 取代 7 处手写 `node_type` + tag 约定 + `'"decision_type"'` 嗅探。
**同时把 commander / expert / plan_revision 构造改为 `streaming=False`**（消除 #5 根因，从此不需要「先流式再丢弃」）。
前置：先跑通 `stream_mode` 下 `custom` 通道与现有 `sse_event` 协议的对接（协议本身不变）。

### Tier 2 · 审批链路迁 `interrupt()` / `Command(resume)`（M×2，高风险）

目标拓扑：审批独立成 `plan_approval` 节点，任务切换回路 `generic → expert_dispatcher` **绕过**它。

一次性消掉：外层 `while`、`_should_wait_for_human_approval` 启发式、`_apply_updated_plan` 的 `HumanMessage` 注入、`isolated_thread_id`、`run_max_graph_loops`（原生 `recursion_limit` 接管）、以及「每条消息一个新隔离 thread」导致的 checkpoint 线性膨胀。

**前置（不可省）**：先为当前实现补特征测试（resume / revise / cancel-during-wait 三条路），把现状输入输出固化。这是唯一的安全网。
**保留**：`_apply_updated_plan` 的计划合并语义（按 id 保留 completed 的 `output_result`/`task_id`、清理依赖、重算索引）移入节点内——这是业务规则，不是脚手架。
**需拍板**：修订（reviser）是否改为图内节点。图内 = 驳回流挂住等 LLM（分钟级），体验更好但把长调用挪回请求生命周期；后台任务 = 保留现状形态。取决于生产网关超时策略。

### Tier 3 · 有取舍的替换（需测试）

- **A3** commander / plan_revision 改 `with_structured_output(..., include_raw=True)`。必须保留：`plan.thinking` 事件（`include_raw`）、任务 id 兜底与依赖「索引→ID」改写（`commander.py:384-402`）、失败兜底语义（空计划 / 保持原计划待审——HITL 安全网）。
- **A4** 工具错误分类改为 `ToolNode(handle_tool_errors=classify_tool_error)`；分类函数（中文用户话术）保留为业务资产。
- **A6 + per-tool 超时**：`awrap_tool_call` 做 per-tool_call 重试；`asyncio.timeout` 下沉到单个 tool coroutine（现状「挂了 MCP 就连 calculator 一起放宽到 90s」是错的）。
- **A5** `TimeoutPolicy` 挂 `generic`/`commander`/`aggregator`。
- **新能力**：`Runnable.with_fallbacks` 做运行时模型降级（当前只有 `max_retries`，无故障切换）。
- **低优先**：`memory_manager` → `AsyncPostgresStore.asearch`（顺带修无索引 + `to_thread` + 8s 超时 hack）。因记忆无 UI/API、写入路径单一，**不值得为换而换**；若记忆要升级为产品功能再整体迁。

### Tier 4 · 真·新增能力（非替换，产品决策）

- **`Send` 并行执行**：当前任务串行（`execution_mode="sequential"` 硬编码，`PARALLEL` 枚举已定义但无实现）。
- **历史裁剪**：`trim_messages` / 摘要思路。当前 1M 上下文窗口不痛，属未来缺口；若做，**只作用于 simple/`direct_reply` 路径**，complex 路径的 checkpoint 状态不能碰（会污染恢复语义）。

### 前端独立清单（与后端解耦）

Tier 0 级（纯删代码）：产物编辑换 `useUpdateArtifactMutation`（删 ~55 行 + 消除跨层回滚）；`use-toast` 换 `useSyncExternalStore`；`useRunPolling` 状态机改派生值（100 → ~20 行）；自研 persist 退役统一官方 `persist`（删 ~120 行）；`ArtifactCanvas` 搜索防抖改 `useDeferredValue` + `placeholderData`。
风险级（涉生产验证过的恢复时序，代码内有「勿优化」警告）：`taskStore` 只持久化 UI 偏好、`useSessionRestore` Query 化。

### 明确不动

`deadline` 三层生命周期 · 协作取消 · 心跳 · RunEvent 账本 · `stream_hub` · ToolPolicy · `task_list`/`expert_results` 整值重建 · 前端流式 RAF + 节流（高频 token 不进 React 状态是正确判断，`useTransition`/`useDeferredValue` 解决不了重渲染次数）· `chat.ts` 的 SSE 生命周期管理（库不提供 Last-Event-ID 续传，非幂等 POST 必须禁掉库的自动重试）。

---

## 五、执行顺序

```
Tier 0（零风险清账，含 latent bomb 修复）
   ↓
Tier 1（事件消费端原生化 + streaming=False）  ←── 独立，先做；风险低
   ↓
Tier 2 前置：为 resume/revise/cancel 写特征测试
   ↓
Tier 2（审批迁 interrupt/Command）
   ↓
Tier 3（structured output / 工具错误 / 超时 / per-tool 重试 / with_fallbacks）
   ↓
Tier 4（Send 并行 / 历史裁剪）—— 按产品需要
前端清单可并行
```

## 六、验收口径

- Tier 0：行为零变更，`pytest` + `tsc` + 前端测试全绿。
- Tier 1：事件序列（`sse_event` 顺序与内容）与迁移前逐帧比对一致。
- Tier 2：特征测试覆盖 resume / revise / cancel-during-wait / 幂等重放 / 审批期超时 五条路；checkpoint 表行数不再随消息线性增长。
- Tier 3：`plan.thinking` 事件、失败兜底语义、工具错误话术三条不回归。
