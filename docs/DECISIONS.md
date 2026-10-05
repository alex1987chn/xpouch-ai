# DECISIONS

已定决策与约定（**勿反复**）。否决过的需求记在这里，防止死案复燃——git 只记录"做了什么"，不记录"为什么不做"。需求与进度看 [BACKLOG.md](BACKLOG.md)。

## 产品

- **定位（2026-09-10）**：开源自托管多用户工作台（Gitea/GitLab CE 族）；xpouch.ai=橱窗+自用实例；多租户/计费/插件**不做**；新功能判据="为部署了这套系统的团队服务"。
- **信息架构（2026-09-12）**：资源库=干活时取用的资源，管理台=治理运营系统；MCP 的拆法是范本（资源库浏览工具能力 / 管理台配置服务器）。
- **明确不做**：知识库做实（未来走 API 接外部）、强制改密 v2、undo 删除会话。
- **重置密码不发短信**：明文凭据进运营商/终端留痕是反模式；随机明文仅展示一次（服务端不留），管理员当面/内部通讯交付。
- **审批弹窗不默认弹出**（终局）；确要弹=仅实时流首次进入 waiting_for_approval 弹一次（sessionStorage 按 run_id），刷新/恢复路径永不自动弹。
- **审计日志范围**：管理面动作 + 计划批准/修订/终止三记录点（成功才落笔、不记内容）；不记对话内容；审批历史在会话消息留痕与运行时间线。
- **HITL 设计原则（v4）**：人是发起者/裁决者/最终编辑者，AI 仅在明确驳回且给了反馈时代笔起草，修订产物无自动执行权；**步骤级二次确认=留待产品真需要人工把关每一步时再做**（审批点已过全图审，逐任务确认=双重打断）。
- **同层并发上限默认 1（串行）**；将来做管理页面可配置项（system_setting 模式）。
- **对话列 760px 不动**；中文字体轮（Noto Sans SC）已否决，未来要上=全部自托管。
- **品牌**：唯一品牌图形=卡片进口袋（黄卡+蓝袋，The4DPocketLogo）；字标 [XPOUCH]；slogan "initial minds, one pouch" 只落品牌触点（登录/分享/首跑空态/关于），不进工作台。禁止自创几何块当品牌标记。
- **题材型专家不内置（2026-09-23）**：内置=系统能力型专家（search/coder/researcher/analyzer/writer/planner/commander/router/aggregator/memorize_expert，共 11）；story_writer（小说家）已移出种子——需要者经管理台自建。判据：内置清单里的每个专家都必须有消费链路承接。
- **image_analyzer 暂缓（2026-09-23 审计）**：图片只附在初始消息（router 可见），专家执行无图片传递管道——教材虽好但收不到图。管道做之前该专家保持现状（未移出内置、不投入），见 BACKLOG。
- **三层能力词汇定界（2026-10-03，随能力包语义改造落定）**：对话模板（`skilltemplate` 表，UI 显示名已从「技能模板」改）=**输入侧**会话起手式（starter_prompt 预填 + 展示元数据）；能力包（`systemexpert`，即专家）=**执行侧**单元（commander 按 description 能力契约路由子任务）；技能包（挂起的提案闭环，SKILL.md 式）=可执行领域知识包，**长在能力包之内**被按需加载（对齐 Agent Skills 架构：skills 是 agent 加载的知识，不是平行于 agent 的另一套系统）。**执行能力只有能力包一个真相源**：模板的 `tool_hints` / `expected_artifact_types` 永远是展示元数据，不得成为执行时被读取的字段；模板 `system_hint` 不得与能力包教材竞争系统提示权。禁止合并两者或给模板加执行语义——双轨即债（本轮架构审视结论，勿复燃）。
- **专家执行形态=独立助手消息（2026-09-23 终局）**：thinking 卡只留路由判断与任务规划两个里程碑；每个专家的执行产出是消息流里的独立消息卡（署名/步骤 i/N/描述/摘要/工具区/产物横条），用户上滚即见全部专家做了什么。**消息表是专家执行状态的一等真相源**（task 开始插 running 态、终态原位更新），执行中刷新可恢复现场；工具明细真相源仍是 runevent 账本，消息上的 tool_stats 是聚合快照（派生数据）。**消息表行序=因果序**：思考载体行（commander 插入、content 恒空、幂等按 run_id）→ 专家行 → 聚合行（id 由 run 创建时的 state.aggregate_message_id 承载，与前端占位解耦）；前端占位消息经 plan.created 事件原位改写成载体行——实时流与刷新回放同序同源。对照过 DeepSeek/Kimi/Claude/ChatGPT/Manus：单思考块是单 agent 形态，Manus 是过程消息独立成条的先例——多专家+产物形态取后者。**旧机制已删净勿复燃**：thinking 卡 execution 渲染/专家分组/账本重建 task·tool 分支/toolHistory 字段全部退役；resume 的 message_id 贯通链（请求字段→recovery/stream→state）与 done 时的占位步骤迁移块一并退役。

## 工程

- **记忆系统三补丁（2026-10-04）**：①改写走精确匹配——`rewrite_memory(old_content, new_content)` 逐字命中单行（入库幂等去重保证同用户同内容唯一，精确文本即唯一键），未命中 fail-loud 附自愈指引，**不做关键词模糊覆盖**（多行命中被并成一条=信息静默丢失）；改写后 created_at 刷新（新事实按新时间参与衰减）。②检索时效衰减：相似度×exp(-ln2·age/90天) 重排（半衰期=排序行为契约，测试钉住；首版自审抓到把余弦距离当相似度用、排序整个反了）。③管理台记忆清理**只逐条删，刻意不提供批量删/按用户清空**——记忆属终端用户数据、误删不可再生，摩擦即护栏。
- **图内 task_list 与 SubTask 双真相并存（2026-10-04 脑裂审计 #1，维持守卫姿势不合并）**：执行期任务清单同时活在 LangGraph checkpoint 的 `task_list`（commander 语义 id "1"/"2" + 产出传播）与 DB SubTask 行（uuid 主键）——编排态自包含（checkpoint/重放的前提）与关系记录（前端/产物/审计的真相）各有职责，业界同构（Temporal workflow 状态 vs 业务表）无一方吞并另一方的低成本路径。两套 id 的接线纪律有事故案底（2026-10-03 e68b5a40：语义 id 流进 task_list → 产物保存查不到 SubTask 全灭 + 依赖线误剪）。现行守卫：RunPlanTask 回传 SubTask uuid、恢复路径 re-link、未知 id 命名空间守卫 409；e2e 对账断言钉住「事件账本 task_completed.task_id ↔ 计划 SubTask uuid 严格双射」（scripts/e2e_plan_actions_check.py A5）。**动任务状态链路前必读本条与上述事故记录**。
- **记忆删除走闭包工具（2026-09-26）**：`tools/memory.py` 按请求构建 `search_memories` / `delete_memories`，**user_id 由服务端闭包注入（branch_context），绝不作为 LLM 参数**——模型填报用户身份即跨用户读删漏洞。治理白名单 `allowed_experts=("memorize_expert",)`；generic 侧护栏：缺 user_id 不注入工具，**用过记忆工具的分支跳过逐行入库**（输出是操作报告非记忆素材，历史"已为您删除…"回声即违反此条的产物）。硬删除无软删（记忆可再生）；教材经 000903 下发（memorize/router/commander 三家）。
- **开发库存储= named volume（2026-09-26 事故后）**：Docker Desktop 对 WSL 路径的 bind mount 经 9p/virtiofs 跨系统共享，Windows 非干净关机（fast startup/强断电）曾把 `postgres_data/18/docker` 整树清空（PG 被入口脚本 initdb 重建、业务数据全失，自 D 盘快照恢复）。本地开发经 `docker-compose.override.yml`（gitignored）切 named volume `xpouch-ai_xpouch-pgdata`；生产（deploy.sh，原生 Linux）维持仓库根 bind mount 不变。伴生保险：每周 pg_dump 到 /mnt/d（WSL/Windows 双故障域）。同日修复空库部署建不出 checkpoint 四表的问题（langgraph setup 的 CONCURRENTLY 不能跑在事务里，改 autocommit 专用连接 + lifespan fail-loud），CI 补冷启动守卫。
- **审批超时 24h（2026-09-24 用户拍板）**：waiting_for_approval 的 run 被"遗弃"时由租约 supervisor 的独立第三判据兜底（`utils/run_lease.approval_deadline_exceeded`，计时起点 `agentrun.waiting_since_at`，配置 `APPROVAL_TIMEOUT_HOURS` 默认 24、0=关闭）——语义是"等人等太久"，走 cancelled 而非 timed_out，且**必须在会话留可见取消说明**（否则用户体验与 09-13 误杀事故无异：审批卡凭空消失）。铁律不变：等待审批永不走租约/预算判死（09-13 一小时误杀 5 条的教训），新鲜等待与无计时起点的历史行一律不碰。
- **run 终态必须级联收口（2026-09-24 补齐）**：宿主 run 进入任一终态时，其计划（ExecutionPlan.status）、子任务（pending/waiting/running）、running 态专家消息必须全部落终态——收口点是 `crud/agent_run.close_orphaned_task_state`（异常终态）+ `mark_run_completed` 的防御性调用；映射：completed→completed、cancelled→cancelled、failed/timed_out→failed。此前只收 RUNNING 子任务不碰计划，账面与前端（跟着 run 走）脱节，积压过 21 个僵尸计划 + 51 条 pending 子任务（存量由 000900/000901 清创）。
- **记忆写入护栏（2026-09-24）**：长期记忆（user_memories）按 user_id 隔离是硬约束——写入端缺 user_id 时 **fail-loud 拒绝入库**，禁止任何共享账号兜底（曾 `or "default_user"`，产出过 8 条跨用户可见的脏记忆，已清理）；embedding 失败抛错而非静默（调用方须如实上报"未记住"）；写入同用户同内容幂等去重。自然语言"删除记忆"仍无消费端（MemoryManager 无删除能力），见 BACKLOG。
- **sync/stream 双轨保留**：后端 sync 路径是公开 API（docstring 注记）；前端非流式死分支已删。
- **合理自研、勿再当待办重审**：RunEvent 账本 + stream_hub 断线续传（OSS 无等价物）、deadline/心跳/清理循环、DB 协作取消、SSRF 校验、serializer 白名单（官方安全参数）、前端 SSE 传输层（fetch + eventsource-parser，2026-09-26 自维护冻结的 @microsoft/fetch-event-source 迁出；接管连接/断线续传/RAF 渲染仍自研）。
- **有意保留不重构**：RAF 批量层；主题 FOUC 内联脚本（内联脚本无法 import TS，是硬约束）。
- **模型**：MiniMax 已停用（2026-09-02，质量与成本原因，providers.yaml enabled:false）；默认 deepseek-flash。
- **时区：全链路 aware UTC（2026-09-22 落地）**：领域表时间列全部 timestamptz（sqlmodel 0.0.45 默认映射 UTCDateTime，**NaiveDatetime 注解禁用**）、写入 `utils/time.utc_now()`（utc_now_naive 已删除，无兼容层）、API 自动带 +00:00、前端 `toLocalDate` 直接解析（补 Z 逻辑已删）。例外：注入 prompt 的用户墙钟（prompt_utils/tools/utils）保持本地时间。存量个别 ±8h 历史行有意不迁移（用户知悉）。
- **词汇收敛（2026-09-22 专项落地）**：canonical 名=description / strategy / created_at / expert_type / depends_on / thread（前端）；`dependencies` 旧名已显式拒绝（model_validator 抛错，fail-loud）。**有意保留的命名边界**：① 请求侧 `ChatMessageDTO.timestamp`（对外 API 契约，不改名）；② SSE 事件 payload 的 `timestamp` 协议键（线上一致即可）；③ 前端本地 Message/ThinkingStep 的 `timestamp`（本地生成时间戳，非 DB 列镜像）；④ `thought_process` 只进 plan.thinking 事件不落库（过程性数据，可回放，设计选择）；⑤ 账本 depends_on 存解析后 UUID、task_id 列存语义 ID（两个命名空间，桥接=关节非黏土）。
- **langsmith = 静默随行（2026-09-22 三项核查：无 key / 无 tracing 开关 / 代码零引用）**：langchain-core 传递依赖，默认不上报，零处理。观测需求未来走 **langfuse 自托管**（开源、CallbackHandler 即插即用、不经 langsmith），不启用 LangSmith。
- **版本号单源**：`backend/pyproject.toml`（改后必须 `uv lock` 重锁）；发版 patch 递增。
- **依赖升级口径（2026-09-13）**：只升同大版本的 patch/minor；前端 `pnpm up <pkg>@<ver>` 显式列包、后端 `uv lock --upgrade-package <pkg>`；**明确不升**：eslint 10 / typescript 7 / mermaid 12 / @vitejs/plugin-react 6 / @types-node 26 / eslint-plugin-react-refresh 0.5 / concurrently 10；mcp 2.x 被上游 langchain-mcp-adapters 卡住。
- **langchain 已升 1.4.2（2026-09-22，原"1.4.0 不升"决策由用户授权推翻）**：连带 core 1.6.4 / openai-pkg 1.6.3 / deepseek 1.1.1 / langgraph 1.2.12；openai 3.7.0 与 mcp 1.29.1 未被连带。`langgraph-native-audit.md` 审计基线已加注记（判定未逐条重验，升级批过全量测试+真实 LLM e2e）；完整审计重跑=条件触发（遇框架行为与文档不符时）。
- **依赖 patch 批（2026-09-22）**：后端点名升级 sqlalchemy 2.0.54 / psycopg 三件 3.3.6 / uvicorn 0.53 / watchfiles 1.3 / sse-starlette 3.4.11 / tavily 0.8.4 / tencentcloud 179 / pypdf 6.19 / langgraph-sdk 0.4.5 / langsmith 0.14 / ruff 0.16.8；前端 react-router-dom 7.18.4 / typescript-eslint 8.70.1 / prettier 3.9.8 / @vitest-coverage 5.0.1。**sqlmodel 已解钉至 0.0.45（2026-09-22 随时区 aware 化专项）**：其 naive 强校验正是该专项的触发信号；普通 `datetime` 注解默认映射 UTCDateTime（= timestamptz）。websockets 留 16（langsmith 0.14 已放宽上界，但我们无活的 WS 代码路径，零收益不点名）；mcp 1.29 / uuid-utils 0.17 仍被上游区间锁死（langchain-mcp-adapters 0.3.2 锁 mcp<2——2026-09-22 复核 PyPI 最新仍 0.3.2；langchain-core 锁 uuid-utils<1.0）。
- **pnpm 已升 12.5.1（2026-09-22，Rust 重写版）**：官方口径命令/flag/设置/lockfile 格式沿用 11，实测零迁移成本；锚点三处=根 `package.json` 的 `packageManager`+`engines`、`frontend/Dockerfile` 的 `pnpm@12`（CI 的 action-setup 自动读 packageManager）；lockfile 自记 pnpm 版本与平台二进制（`@pnpm/exe.*`，约 160 行自引用元数据，属预期非漂移）；`pnpm-workspace.yaml` 的 allowBuilds/minimumReleaseAge 继续有效。
- **API 建模约定**：恒序列化、值可空的字段**不写默认值**（默认值会被 OpenAPI 降级 optional，与运行时恒有键矛盾）。改协议/路由后的常规动作：`cd backend && uv run python -m scripts.gen_enums_ts`，事件协议用 `scripts.gen_event_types_ts`，REST 契约用 `scripts.gen_openapi_types`。
- **专家教材单一真相源 = `expert_config.EXPERT_DEFAULTS`（2026-09-23）**：代码种子即教材，已部署库的教材修复走迁移下发（只覆盖 is_dynamic=false 的内置行，用户自建专家不碰）；constants.py 的 router/aggregator 静态兜底直接引用种子（不维护第二份字符串）。**迁移即种子**：需要补种内置专家的迁移必须对全部内置做 INSERT IF NOT EXISTS——只补一两个会让表非空、main.py 的空表自举跳过、其余专家永远缺失。改教材的连带清单：EXPERT_DEFAULTS + 迁移下发 + 存量库同步。
- **run.mode 可空（2026-09-23）**：占位值 `"router"` 废弃——路由决策前终止的 run 如实存 NULL（迁移 20260923_000100 清洗存量）；接口契约放宽为可空 str 并对未迁移库存量值宽容。教训：不用假数据填还没发生的事实。
- **evals/ 不进镜像**=有意（仅测试引用）。
- **许可：标准 Apache-2.0**（2026-09-15，4fb7377）：LICENSE 与官方逐字一致 + NOTICE（§4d），SPDX 三处；用户明确放弃 SaaS 限制与品牌保护（执行前二次确认过）。后果：他人可自由 SaaS 转售/改名；**再收紧需征得贡献者同意（无 CLA），收外部 PR 前应先考虑加 CLA/DCO**。
- **部署语义**：镜像内（代码/providers.yaml=必须发版）vs 宿主机（backend/.env=可热改，`docker compose up -d` 生效，restart 不重读 env）。
- **BYOK 凭据纪律（2026-10-05，事故落地）**：LLM 客户端缓存的键必须含解析后 key 的摘要——key 焊在 ChatOpenAI 实例里，缓存键若不含凭据身份，删 key 后旧条目继续带着已删 key 计费、且跨用户共享会串 key（A 的个人 key 发给没配 key 的 B）。解析先于缓存查找，无 key 在查缓存前报错（旧缓存不许掩盖缺 key）。错误归因：凭据类失败（401/402/403/429）经 `utils.byok.with_byok_hint` 把「去设置更新你的个人 key」追加到用户可见错误；归因依据=请求入口装载的 key 快照（ContextVar 在运行内不可变，快照里有某 provider ≡ 该 provider 本次走用户 key——LangGraph 子任务各自拷贝上下文，执行期写不回状态，只能重读快照）。**管理端 LLM 动作（专家预览/生成描述）走操作者本人的有效凭据**，与其聊天口径一致；实例级健康检查不是这两个接口的职责。
- **BYOK 明确不做（2026-10-05）**：① embedding 永远走实例 key（读取路径直读 env，绕开 BYOK——自托管多用户合理取舍）；② 主密钥轮换不做（密文无版本化；换钥匙=停机重加密，自托管 v1 规模不值得）；③ key 生命周期审计日志不做（多租户/对账需求出现再上）。
