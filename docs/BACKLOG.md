# BACKLOG

未完成工作清单（唯一真相源）。条目完成并**验收通过后直接删除**——完成记录由 git log / CHANGELOG 承载；被否决的需求移入 [DECISIONS.md](DECISIONS.md)（git 不记录"为什么没做"）。

状态：`待办` / `进行中` / `等用户`（验收、拍板或用户侧操作）/ `搁置`。类型：需求 / 工程债 / 观察。

## 运维（等用户）

- [ ] **生产部署收尾（原 v3.5.4 验证，现应连 09-22/23 批次一起发 v3.5.6）**：确认 f6ae155（deploy.sh 改为 Compose v2 插件优先 + 版本闸门 ≥2.17）修复后重跑 deploy.sh 成功。前置检查：`.env` 空串 key（4851b97 起空串=拒绝启动）；**迁移 20260918_000100 会删 customagent 表与 custom 线程（不可恢复，备份兜底）**；20260916_000200 枚举 USING 转换=锁表操作，低峰执行；若设过日配额，b98478a 已修，部署后聊天即恢复。**09-23 批次注意**：①20260923_000200 把内置专家（search/router/aggregator/memorize_expert）教材覆盖为代码种子版，20260923_000400 再覆盖 search 教材（工具条款让位版）——生产若人工调优过这几家提示词，先导出备份（000400 会再次覆盖 search）；另补种 router/aggregator 并归位内置标记。②000300 runevent 枚举加 tool_result（加值，低锁表风险）。③000500/000600 是数据清洗 UPDATE（僵尸 running 任务/消息收尾为 failed + summary 对齐 artifact.title），无 schema 变化，会把存量卡死会话解锁。④ModelScope 的 Generate-image MCP key 已失效（USER_NOT_IN_ORG）——部署后在管理台更新 key 或停用该服务器（现在单服务器失败不连坐其余 MCP，挂着只浪费一轮超时）。
- [ ] **生产 asyncio 日志确认（T4）**：查生产有无调度挂起迹象（本机问题疑已绕开，生产未见症候）；确认后解锁"半异步治理"排期。

## 需求（待办）

- [ ] 图片输入收尾：附件入口现仅图片；文档/文件输入=独立功能（定位已讨论：解析为文本注入当前对话上下文，不持久化；pypdf/python-docx/openpyxl；单文件 10MB / 单次 3 个）
- [ ] 图片进复杂任务的传递管道（image_analyzer 当前收不到图片）：用户消息附图只挂在初始消息（router 可见），commander 分派到专家执行无任何图片通道——image_analyzer 教材虽好但拿到的只有文字（2026-09-23 审计发现，用户拍板暂缓：管道就绪前该专家不可用，也未移出内置）
- [ ] Selective approval UI 或记忆系统（二选一，方向待讨论）
- [ ] BYOK（认可方向，未排期）
- [ ] GitHub 入口补位：登录弹窗 wordmark 下方 + 命令面板"关于"条目（实现注意：lucide 1.x 无品牌图标，复用 `components/common/GithubMark`）
- [ ] README 双语"30 秒跑起来"段：一张界面实拍 + 一条 self-host 命令 + 与 CrewAI/AutoGen/LangGraph 模板的一句差异
- [ ] xpouch.ai 在线 demo 挂链（站已有，差入口串联）

## 工程债（待排期）

- [ ] T2 契约锚点余量（已锚 20 类型）：请求 DTO 锚点（待后端请求模型收敛）、`types/index.ts` 拆分（线上形状 vs 前端本地扩展字段如 ThinkingStep/isStreaming）、ToolPolicy 系 Literal 化（id 带业务语义默认值）
- [ ] SSE 解析换 eventsource-parser（收掉自研解析面）
- [ ] 事件双真相源统一：同一组 pydantic 模型约束 SSE 流与 run_events 账本
- [ ] 后端半异步二选一（全同步线程池 vs 正规 async engine；**等 T4 生产确认**）
- [ ] 前端状态三轨统一（消息 zustand / 会话产物 react-query / taskStore——周级重构，单独立项）
- [ ] User 表验证码六列摊平（规范=独立表；能用，收益低，搁置）
- [ ] 未使用 i18n 键审计：判据 `git grep "t('<key>')"` 为空 ≠ 死键（`expertIdentity` 这类类型→key 映射是动态引用，删前连映射表一起查）
- [ ] Redis 限流（现内存态，多 worker 不共享）
- [ ] 列表虚拟化（会话/画廊长列表）
- [ ] i18n `common.ts` 按域拆分

## 观察（不排期，条件触发再升级）

- TS7：等 7.1（tsgo Compiler API 稳定）+ typescript-eslint 支持双信号后一次性纯替换；当前 tsc --noEmit 5.6s 非瓶颈，vite/vitest 不走 tsc
- Geist 挂 Google Fonts=大陆可达性隐患；未来要蓝本中文字感=全部字体自托管
- git stash 有一条老 stash（986b76e LangSmith WIP，来历不明未动）
- 多 worker 分布式锁（部署形态未定）
- StreamService 五协作者分解 / generic 630 行拆解 / 路由三家归一 / RunContext 值对象（曾认可方向，未排期）
- 曝光升档剩余项：README 快速开始段、在线 demo、英文 README 主入口强化（LICENSE 识别与 topics/description 已于 2026-09-15 修复；具体流量/star 数据属私有信息，不入仓库）

## 等用户拍板

- B3b：checkpoint thread 对齐业务 thread + 生命周期守卫（"以后可讨论"非否决；动它须重跑 `e2e_hitl_check.py`）
