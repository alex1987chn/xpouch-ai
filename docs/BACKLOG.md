# BACKLOG

未完成工作清单（唯一真相源）。条目完成并**验收通过后直接删除**——完成记录由 git log / CHANGELOG 承载；被否决的需求移入 [DECISIONS.md](DECISIONS.md)（git 不记录"为什么没做"）。

状态：`待办` / `进行中` / `等用户`（验收、拍板或用户侧操作）/ `搁置`。类型：需求 / 工程债 / 观察。

## 运维（等用户）

- [ ] **生产部署 v3.5.4 收尾**：确认 f6ae155（deploy.sh 改为 Compose v2 插件优先 + 版本闸门 ≥2.17）修复后重跑 deploy.sh 成功。前置检查：`.env` 空串 key（4851b97 起空串=拒绝启动）；**迁移 20260918_000100 会删 customagent 表与 custom 线程（不可恢复，备份兜底）**；20260916_000200 枚举 USING 转换=锁表操作，低峰执行；若设过日配额，b98478a 已修，部署后聊天即恢复。
- [ ] **生产 asyncio 日志确认（T4）**：查生产有无调度挂起迹象（本机问题疑已绕开，生产未见症候）；确认后解锁"半异步治理"排期。

## 需求（待办）

- [ ] 图片输入收尾：附件入口现仅图片；文档/文件输入=独立功能（定位已讨论：解析为文本注入当前对话上下文，不持久化；pypdf/python-docx/openpyxl；单文件 10MB / 单次 3 个）
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
- [ ] 时区 aware 化专项：模型层全局 `DateTime(timezone=True)` + `ALTER ... USING AT TIME ZONE 'UTC'` 迁移（timestamp→timestamptz 零损失，锁表低峰）+ API 自动带后缀；前端 toLocalDate 已兼容带后缀输入零改动。**触发条件：sqlmodel 解钉需求（0.0.45+ 要求 aware 或 NaiveDatetime 注解）/ 再发时区事故 / 大版本窗口**。顺带解掉 sqlmodel 0.0.42 钉版
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
