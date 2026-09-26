# BACKLOG

未完成工作清单（唯一真相源）。条目完成并**验收通过后直接删除**——完成记录由 git log / CHANGELOG 承载；被否决的需求移入 [DECISIONS.md](DECISIONS.md)（git 不记录"为什么没做"）。

状态：`待办` / `进行中` / `等用户`（验收、拍板或用户侧操作）/ `搁置`。类型：需求 / 工程债 / 观察。

## 运维（等用户）

- [ ] **Generate-image MCP key 失效**（ModelScope 报 USER_NOT_IN_ORG）：管理台更新 key 或停用该服务器。单服务器失败已不连坐，但不停用则每次 run 都为它浪费一轮超时；2026-09-26 生产部署后日志复现 WARNING。

## 需求（待办）

- [ ] 图片输入收尾：附件入口现仅图片；文档/文件输入=独立功能（定位已讨论：解析为文本注入当前对话上下文，不持久化；pypdf/python-docx/openpyxl；单文件 10MB / 单次 3 个）
- [ ] 图片进复杂任务的传递管道（image_analyzer 当前收不到图片）：用户消息附图只挂在初始消息（router 可见），commander 分派到专家执行无任何图片通道——image_analyzer 教材虽好但拿到的只有文字（2026-09-23 审计发现，用户拍板暂缓：管道就绪前该专家不可用，也未移出内置）
- [ ] Selective approval UI 或记忆系统（二选一，方向待讨论）。记忆系统侧 2026-09-26 已落地删除/查看能力（闭包工具 + 教材 + 000903 下发，见 DECISIONS）；剩余可做：管理台记忆查看/清理入口、记忆改写（"把 XX 改成 YY"）、检索注入的时效衰减
- [ ] BYOK（认可方向，未排期）
- [ ] xpouch.ai 在线 demo 挂链（站已有，差入口串联）

## 工程债（待排期）

- [ ] T2 请求 DTO 契约锚点（响应侧 20 类型、ToolPolicy 系 Literal 化、类型线上/本地分居均已锚；请求侧待后端请求模型收敛）
- [ ] 事件双真相源统一：同一组 pydantic 模型约束 SSE 流与 run_events 账本
- [ ] 后端半异步二选一（全同步线程池 vs 正规 async engine；T4 生产确认已过——2026-09-26 部署后日志干净，可排期）
- [ ] 前端状态三轨统一（消息 zustand / 会话产物 react-query / taskStore——周级重构，单独立项）
- [ ] User 表验证码六列摊平（规范=独立表；能用，收益低，搁置）
- [ ] 未使用 i18n 键审计：判据 `git grep "t('<key>')"` 为空 ≠ 死键（`expertIdentity` 这类类型→key 映射是动态引用，删前连映射表一起查）
- [ ] Redis 限流（现内存态，多 worker 不共享）
- [ ] 列表虚拟化（会话/画廊长列表）
- [ ] i18n `common.ts` 按域拆分

## 观察（不排期，条件触发再升级）

- 等待审批 run 无消息载体=前端不可见（2026-09-24 审计实例：两个 run 冲到 waiting_for_approval，消息表零载体行，用户侧表现"发了没反应"）——恢复路径也无处置渲染审批卡的锚点；同会话 82 秒内两个 waiting run 并存，互斥未拦（waiting 态不持租约不挡新任务，疑似 by-design 但审批目标会有歧义）。数据已按取消语义清理；若再现需查 carrier 插入路径与审批恢复目标选取
  （附：同日的后端自重启之谜已销案——run.py 用 `watchfiles.run_process` 包裹服务，文件变更即重执行，属刻意热重载设计；生产 Dockerfile 直跑 uvicorn 不受影响）
- TS7：等 7.1（tsgo Compiler API 稳定）+ typescript-eslint 支持双信号后一次性纯替换；当前 tsc --noEmit 5.6s 非瓶颈，vite/vitest 不走 tsc
- Geist 挂 Google Fonts=大陆可达性隐患；未来要蓝本中文字感=全部字体自托管
- git stash 有一条老 stash（986b76e LangSmith WIP，来历不明未动）
- 多 worker 分布式锁（部署形态未定）
- StreamService 五协作者分解 / generic 拆解（991 行）/ RunContext 值对象（曾认可方向，未排期；拆解前置的 e2e 安全网已就位——`e2e_cancel_resume_check.py` 三场景，且首跑即抓出并修复断连僵尸/[DONE] 缺失两 bug，可以排期动手）
- 曝光升档剩余项：在线 demo、英文 README 主入口强化（README 快速开始段单列于需求节；LICENSE 识别与 topics/description 已于 2026-09-15 修复；具体流量/star 数据属私有信息，不入仓库）

## 等用户拍板

- B3b：checkpoint thread 对齐业务 thread + 生命周期守卫（"以后可讨论"非否决；动它须重跑 `e2e_hitl_check.py`）
