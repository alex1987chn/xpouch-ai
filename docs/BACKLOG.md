# BACKLOG

未完成工作清单（唯一真相源）。条目完成并**验收通过后直接删除**——完成记录由 git log / CHANGELOG 承载；被否决的需求移入 [DECISIONS.md](DECISIONS.md)（git 不记录"为什么没做"）。

状态：`待办` / `进行中` / `等用户`（验收、拍板或用户侧操作）/ `搁置`。类型：需求 / 工程债 / 观察。

## 需求（待办）

- [ ] 计划修订基线持久化（2026-09-27 用户实测缺口）：修订循环的 v(n-1)↔v(n) 对比只活在审批弹窗内存里——修订后中途切会话再回来，restore 从 subtask 重建只有最新版，无对比可看。需要把上一版计划快照（或 diff 基线）持久化（计划历史表或事件账本重建），审批 UI 才能在恢复后继续出对比视图
- [ ] 图片输入收尾：附件入口现仅图片；文档/文件输入=独立功能（定位已讨论：解析为文本注入当前对话上下文，不持久化；pypdf/python-docx/openpyxl；单文件 10MB / 单次 3 个）
- [ ] 图片进复杂任务的传递管道（image_analyzer 当前收不到图片）：用户消息附图只挂在初始消息（router 可见），commander 分派到专家执行无任何图片通道——image_analyzer 教材虽好但拿到的只有文字（2026-09-23 审计发现，用户拍板暂缓：管道就绪前该专家不可用，也未移出内置）
- [ ] Selective approval UI 或记忆系统（二选一，方向待讨论）。记忆系统侧 2026-09-26 已落地删除/查看能力（闭包工具 + 教材 + 000903 下发，见 DECISIONS）；剩余可做：管理台记忆查看/清理入口、记忆改写（"把 XX 改成 YY"）、检索注入的时效衰减
- [ ] 技能包提案闭环（缺工具 → 提案 → 审批 → 入库复用，2026-10-03 架构审视判定挂起）：等真实用户需求再启动；硬前提 = 脚本执行沙箱（现无）；注意与 `skill_template`（聊天提示模板）是两回事，勿复用混淆
- [ ] BYOK（认可方向，未排期）
- [ ] xpouch.ai 在线 demo 挂链（站已有，差入口串联）

## 工程债（待排期）

- 事件双真相源统一——**2026-09-27 已收口**：①crud 中央归一（append_run_event 接受 BaseModel 统一 model_dump(mode=json)，不再依赖 psycopg 隐式适配——SQLite 测试路径会炸、格式不受控）；②task_started/task_failed 单构造双用（此前 SSE 与账本各自构造已实际漂移：账本缺 message_id/sort_order/total_steps、description 硬编码空串，e2e 账本 payload 复核已补齐）；③tool_result 原本就是单构造范本；④task_completed/artifact_generated 的 SSE 与账本是「落库前通知 vs 落库后权威记录」两个事实、router_decided 两边 reason 是展示文案 vs 机器规则名——语义不同，**判定不做统一**（避免丢信息），后人勿再疑惑
- RunContext 值对象 / 事件双真相源统一（同一组 pydantic 模型约束 SSE 流与 run_events 账本；StreamService 772 行 + parts 三 Mixin、generic 813 行 + 两个纯函数模块的拆解已于 2026-09-27 完成，双 e2e 全绿——结构性大手术已完成，剩余为语义统一类小项）
- [ ] 前端状态三轨统一（周级，**主体完成 2026-10-04，待用户手工验证后销项**）：Phase A 所有权清单 docs/FRONTEND-STATE.md；Phase B 离开编排单点化 leaveCurrentThread；Phase C 执行态三投影归一（executionState.ts 七种转换，组件层零直写，SSE/恢复/生命周期三个例外面）；Phase D 恢复写入同帧提交。剩余：轮询状态机本体仍在 hook 实例内（投影已归一，状态机搬迁收益边际化，条件触发再动）
- [ ] User 表验证码六列摊平（规范=独立表；能用，收益低，搁置）
- [ ] i18n 既有重复键措辞审计（2026-10-04 二轮 review 发现，先于本批存在）：7 个键跨文件重复且 zh 值漂移（simpleMode/complexMode/source/deleting/saving/noToolsAvailable 等，如 chat'简单对话模式' vs settings'Simple 模式（直接对话）'）；合并取后文件值，域内意图措辞被别处覆盖。逐键定全局唯一措辞或改键名分域，再清死副本
- [ ] i18n 按域拆分收尾（**主体完成 2026-10-04**）：死键审计已做（5 个真死键已删）；Navigation/StatsPage/Chat Actions/Create Agent/认证账户域（45 键→auth.ts）均已迁出，common.ts 481→145 行仅剩真跨域词汇。剩余：User Menu 残余（logout/download 等跨域词按主要消费者归 settings 或留在 common，收益边际）；判据同死键审计——`t('<key>')` 为空 ≠ 死键，`expertIdentity` 类映射是动态引用，删前连映射表一起查
- [ ] Redis 限流（现内存态，多 worker 不共享）
- [ ] 列表虚拟化（会话/画廊长列表）
- [ ] i18n `common.ts` 按域拆分

## 观察（不排期，条件触发再升级）

- 等待审批 run 无消息载体=前端不可见（2026-09-24 审计实例：两个 run 冲到 waiting_for_approval，消息表零载体行，用户侧表现"发了没反应"）——恢复路径也无处置渲染审批卡的锚点；同会话 82 秒内两个 waiting run 并存，互斥未拦（waiting 态不持租约不挡新任务，疑似 by-design 但审批目标会有歧义）。数据已按取消语义清理；若再现需查 carrier 插入路径与审批恢复目标选取
  （附：同日的后端自重启之谜已销案——run.py 用 `watchfiles.run_process` 包裹服务，文件变更即重执行，属刻意热重载设计；生产 Dockerfile 直跑 uvicorn 不受影响）
- TS7：等 7.1（tsgo Compiler API 稳定）+ typescript-eslint 支持双信号后一次性纯替换；当前 tsc --noEmit 5.6s 非瓶颈，vite/vitest 不走 tsc
- Geist 挂 Google Fonts=大陆可达性隐患；未来要蓝本中文字感=全部字体自托管
- 多 worker 分布式锁（部署形态未定）
- StreamService 五协作者分解 / generic 拆解（991 行）/ RunContext 值对象（曾认可方向，未排期；拆解前置的 e2e 安全网已就位——`e2e_cancel_resume_check.py` 三场景，且首跑即抓出并修复断连僵尸/[DONE] 缺失两 bug，可以排期动手）
- 曝光升档剩余项：在线 demo、英文 README 主入口强化（README 快速开始段单列于需求节；LICENSE 识别与 topics/description 已于 2026-09-15 修复；具体流量/star 数据属私有信息，不入仓库）

## 等用户拍板

- B3b：checkpoint thread 对齐业务 thread + 生命周期守卫（"以后可讨论"非否决；动它须重跑 `e2e_hitl_check.py`）
