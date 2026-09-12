# CHANGELOG

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0.html),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2026-09-12] - v3.5.0 柔和化大改版、HITL 修订循环与用户管理

### 新增功能

- **柔和化设计大改版**：全新"柔和/黑暗"双主题（暖纸色/暖炭黑语义配色，中英日三语主题名），Bauhaus 主题退役；主题切换带 View Transitions 光圈扩散动画（降级为全局色彩渐变）；全站组件按新设计语言重构——审批弹窗、登录注册、专家/模板/工具卡片、空态、状态胶囊、底栏状态栏等
- **HITL 修订循环（v4）**：计划审批升级为三动作——批准执行 / 修订并重提（驳回+反馈，规划专家修订出 v(n+1)，任务保持挂起，可循环裁决）/ 终止任务；修订由后台任务执行（240s 硬超时），前端轮询感知新版本；反馈以 user 消息永久留痕在会话中；对话流琥珀审批行 + 右缘光晕直达裁决
- **用户管理（管理员）**：全实例用户列表（手机号脱敏/按需揭示、UUID、注册时间、最近登录、角色），支持创建用户（初始密码三态：不设置/自定义/系统随机，随机明文仅展示一次）、编辑资料与角色（防自锁）、重置密码、删除用户（级联清理会话与产物，禁自删）
- **审计日志（管理员）**：用户/专家/配额等管理面变更全量留痕（操作者、动作、对象、详情、时间），`auditlog` 表 + `GET /api/admin/audit-logs` + 管理台"审计日志"页签
- **附件文档（轻量多模态）**：聊天支持附带 PDF / Word / Excel / Markdown / 纯文本文档（单文件 10MB，最多 3 个），后端解析为文本注入对话上下文
- **产物大弹框查看器**：侧栏产物/画廊卡片化（2 列专家卡形态），点击打开大框——视图/代码切换、编辑、复制、下载、导出 MD/PDF（打印流强制柔和主题）、公开分享
- **长文折叠 + 文档视图**：AI 长回复自动限高折叠（渐隐遮罩 + 展开全文），消息底部"文档视图"一键进产物弹框阅读
- **运行统计全用户开放**：普通用户查看自己的运行数据，管理员查看全实例；运行记录支持按运行 ID / 用户名搜索
- **底栏今日 token 用量 + 配额条**：实时显示当前用户当日消耗与配额进度（留空 = ∞ 不限量）
- **设置中心关于块 + 分享页 GitHub 链接**：wordmark + slogan（initial minds, one pouch）+ 版本号 + 开源仓库引流

### 变更

- **色彩体系定稿**：主色黄 #f2c00f（双主题统一）+ 配字色 accent-ink 成对定义；辅色三色系（雾蓝/鼠尾草/陶土）与专家识别色板同源；文字级状态色加深一档保证对比度；遮罩统一 surface-scrim/45；暗色微点阵背景接入主壳
- **时间戳约定统一 UTC**：14 个领域模型默认值与服务层全部 `utc_now_naive`，前端 naive 一律按 UTC 解析；迁移一次性纠正 user.created_at 存量本地值
- **迁移单一真相源**：启动时 schema 对齐全环境统一走 Alembic（create_all 退役）；运行事件枚举新增修订事件值（迁移 20260912_000200）
- **i18n 键类型派生**：`TranslationKey` 改为从 zh 词条对象派生（`keyof typeof zh`），en/ja 缺键在编译期报错，替代 224 行手工联合类型
- **思维链行式化**：思维过程从卡片堆叠改为紧凑步骤行（状态圆标+专家色点+耗时+点击展开详情）
- **运行统计布局归一**：与资源库/系统管理共用 SubPageLayout（子菜单+同高标题行），切页不再跳动
- 资源库移除工具治理入口（管理台为唯一入口，消除重复）；版本号全线 3.5.0

### 修复

- **多模态图片发送报错**：图片转多部件 content 后，router/direct_reply/commander 三节点把 content 当字符串塞入 graph state 导致 pydantic 崩溃——新增统一文本提取工具，三处消费点全部接入；带图消息全链路实测走通
- **会话时间显示"16 小时前"**：后端本地/UTC 混写 + 前端双重时区偏移叠加所致（见上"时间戳约定统一 UTC"）
- **管理员登出后换普通用户登录报错**：身份切换时 React Query 缓存与会话选中态残留——新增身份同步器，user.id 变化即清空缓存
- **复杂任务完成后产物卡片不实时出现**：恢复执行路径缺少产物缓存失效——流式收到 artifact.generated 即防抖刷新
- **分享页 html 产物显示源码**：改为沙箱 iframe 实时预览（allow-scripts，与主站隔离）
- **审批通过后输入台仍是旧会话**：修复 isNew 路由守卫缺失与 key 重挂掐流问题
- 弹窗右上角关闭按钮统一补齐；OTP 直角回归修复；toast 不再遮挡顶部搜索框

## [2026-09-11] - v3.4.7 系统管理、图片输入与双角色收敛

### 新增功能

- **系统管理页（/admin/console，仅 admin）**：实例级管理统一入口——部署检查面（版本/数据库/迁移对齐漂移检测/Provider 状态/用户分布）、专家管理、工具治理、模板管理、MCP 管理五个分区原地切换；侧边栏「专家管理」入口升级为「系统管理」（仅 admin 显示）
- **图片输入（多模态）**：聊天支持附带图片（≤4 张），视觉模型（DeepSeek V4.1 Flash / Kimi K2.6）原生理解；非视觉模型显式 400 而非静默失败；输入框缩略图可移除
- **模板分享链接**：管理员为技能模板生成公开只读导出链接（token 不可枚举、可撤销），跨实例导入——用户带用户的增长回路
- **首跑 bootstrap**：全新部署（user 表为空）首个注册者自动成为管理员，免去 INITIAL_ADMIN_* 环境变量；存量实例不受影响
- **发码 IP 频控 + 用户日 token 配额**：`SMS_IP_MAX_SENDS_PER_HOUR`（默认 10/小时/IP，仅成功计费入账）；每用户日 token 上限（UTC 日界重置，管理员可调），新任务超限拦截
- **系统状态可观测**：`LOG_FORMAT=json` 逐行 JSON 日志；X-Request-ID 贯穿访问日志与错误堆栈；run_id 写入流式日志上下文
- **自托管文档** `docs/self-hosting.md`：部署/管理员初始化/反向代理 HTTPS/升级/备份恢复/FAQ

### 变更

- **角色收敛 4→2**：user / admin 双角色（view_admin→user、edit_admin→admin，迁移幂等不回滚）；「专家管理」入口升级为「系统管理」，仅 admin 可见
- **模型配置归位**：全局默认模型/思考开关从个人设置迁入系统管理（admin 读写）；设置中心收敛为 个人资料 + 账号与安全；可选模型清单管理语义不变
- **DeepSeek V4.1 Flash**（`deepseek-flash`）：原生多模态视觉；旧 ID 已建 hidden 别名兼容存量数据；V4.1 默认开思考，provider 级保持全局关闭
- 运行统计增强：今日 Token 指标卡（配额余量联动、超限变红）、趋势 7/14/30 天切换、零数据空态引导
- 头像菜单收敛为个人域（个人设置/开源仓库/语言/退出），管理入口只在侧边栏

### 修复

- **OTP 发码 500（重要）**：20260304 迁移曾把 verification_code 收窄 VARCHAR(16)，v3.4.3 起改存 64 位 SHA-256 哈希后写入必炸——条件加宽迁移 20260909_000100（幂等）；本地无限 varchar 环境复现不了，生产与全新迁移链必现
- **AdminRoute 渲染期 toast 触发无限重渲染（React #301）**：提示移入 useEffect 一次性触发；/admin/console 对普通用户改为回首页 + 提醒
- **运行统计七日趋势缺柱**：无运行的日期整行缺失导致"七天只有六根"——补零填满完整窗口
- **聚合查询 Row 解包**：单列聚合 exec 返回 Row，int(Row) 抛 TypeError（今日 token 聚合与配额判定路径）
- 侧边栏展开态导航左偏（重构丢失 items-center）与系统管理高亮失效（isOnAdmin 精确匹配旧路由）
- 新会话按钮 hover：阴影回归暗色（黄影贴黄面失去深度感）并补 0.2s 过渡
- 生产可观测性修复：容器内 uvicorn 直启时应用 INFO 日志整体丢失（setup_logging 统一接管）；uvicorn access log 关闭，访问日志由中间件单行输出（含请求 ID 与耗时）
- Dockerfile：backend COPY 清单随结构演进更新（auth/ 等）

### 其他

- 版本号 3.4.6 → 3.4.7；README 中英同步（模型配置/首跑说明/双角色/能力清单）

## [2026-09-09] - v3.4.6 工程治理：a11y、后端结构归一、贡献者基础设施

### 新增功能

- **未登录访问管理页的就地登录拦截**：点击专家管理/运行统计时自动弹出登录弹窗并展示锁卡片（此前 /login 占位路由导致「轻刷一下没反应」）；登录成功后原地进入目标页
- **错误态/空态统一组件**：ErrorState（图标 + 原因 + 重试）与 EmptyState（带行动引导 CTA），接入产物中心、MCP 列表、运行统计
- **ARCHITECTURE.md 架构导览**：目录职责、三层运行时语义、消息生命周期、事件协议 v2、「新增页面/接口/工具」贡献路径
- **贡献者模板**：issue 模板（bug/功能建议）、PR 模板（自查清单）；README 加 CI badge 与 xpouch.ai 在线体验链接

### 变更

- **后端结构归一**：auth.py 单文件（701 行）拆为 auth/ 包（schemas/cookies/limiter/verify + 三路由模块）；api/（admin/library/tools）并入 routers/，路由家族归一，api/ 目录删除
- **前端 a11y（P3）**：新增 useDialogA11y hook（焦点陷阱/焦点归还/role=dialog）接入 8 个自研弹窗；侧边栏与弹窗关闭按钮补 aria-label；toast 关闭钮触达面积提升至 40px 且键盘可见
- **设计规范落地（P1/P3）**：新增 DESIGN.md（间距/尺寸/层级/权限锁定态/暗色自查）；内容页标题行统一 PageTitle；骨架屏全覆盖；页面切换淡入与列表错峰
- **LoginDialog 拆分**：OTP/密码/重置三流程拆为独立子组件，主文件 519 → 296 行
- 侧边栏「专家管理」图标 Shield → Bot（与产品内专家图标统一，盾牌让位安全语义）

### 修复

- **对比度达标（WCAG 实测）**：content-muted 两主题均未达 AA（亮 2.6:1 / 暗 3.2:1），调整为亮 5.9:1、暗 4.7:1+
- 清理废弃代码：framer-motion（迁纯 CSS）、mermaid 改动态懒加载（独立 chunk）、腾讯云 SDK 元包改 sms 子包、36 处旧硬阴影与旧别名、失效 dark: 类、空目录

### 其他

- 版本号 3.4.5 → 3.4.6（backend config/pyproject、package.json ×2、UI 常量）

## [2026-09-09] - v3.4.5 交互与权限打磨：账号与安全、权限锁定态、设计规范落地

### 新增功能

- **账号与安全独立弹窗**：密码管理从个人设置迁出（资料与凭证分离，消除「两个保存按钮」的语义冲突）；按钮动词化（设置密码）、支持回车提交、独立 loading 文案
- **忘记密码**：登录弹窗新增重置流程（`POST /api/auth/reset-password`，手机验证码验证后重置）；验证码发送区分用途，重置场景只发已注册手机号、不自动建号；复用验证码失败锁定防爆破
- **产物中心来源对话入口**：详情弹窗一键跳转生成该产物的会话（复用 thread_id 冗余列）
- **统一权限锁定态（可见但锁）**：新增 `PermissionLockCard` 锁卡片组件；专家管理页无权限时展示锁卡片而非裸空列表；专家配置编辑开放给 EDIT_ADMIN（与角色定位对齐），详情接口与列表对齐为 VIEW_ADMIN+
- **内容页标题行统一**：新增 `PageTitle` 组件，四处内容页全部换用；退役 fixed header（手动对齐侧边栏宽度、内嵌滚动区等心智税一并清除），四页容器模型与标题线宽完全一致
- **产物详情操作排统一**：来源对话/分享/展开/关闭四个操作统一为图标方块（w-8 h-8 + aria-label），分享去静态文案改为对勾反馈

### 变更

- **设计规范落地（DESIGN.md）**：新增间距/尺寸/位置硬约束（max-w-5xl 唯一内容宽、间距四档、Z_INDEX 唯一层级来源）、权限锁定态规范（§4.5）、暗色自查口诀与 dark: 禁令
- **骨架屏全覆盖**：新增 Skeleton/CardSkeleton/RowSkeleton，内容页裸「加载中」文字全部替换为同构骨架
- **动效**：页面切换 200ms 淡入、数据列表 40ms 步长错峰入场；全部受 prefers-reduced-motion 约束
- **主题机制补强**：切主题同步挂载/摘除 `.dark` 类（兼容依赖该约定的第三方组件）；本项目样式机制不变（data-theme + 语义 token）

### 修复

- **暗色模式对比度**：固定色类型徽章前景改固定白（暗色下深字压彩底不可读）；状态语义色（成功/失败/警告）全站统一走 accent token；清理失效的 `dark:` 前缀类与 36 处旧硬阴影（退役 shadow-hard-* 工具类）
- 清理 9 处旧底色别名、无使用的旧圆角别名等存量债务

### 其他

- 版本号 3.4.4 → 3.4.5（backend config/pyproject、package.json ×2、UI 常量）

## [2026-09-08] - v3.4.4 产品闭环：分享、产物中心、密码登录、用量可视化、resumable stream、UTC 统一

### 新增功能

- **断线续传（resumable stream）**：每个 run 一个有界事件缓冲（hub 统一分配递增 seq 到 SSE `id:`），网络中断后前端用 `GET /chat/{thread}/stream/resume?last_event_id=` 补放并跟随剩余事件；缓冲丢失（重启/超窗）返回 410，前端自动退化到"后台跑完 + 轮询刷新"。POST 从不重发（非幂等），重放只读
- **后台继续执行**：客户端断开不再终止任务（v3.4.3 曾误杀后台断连），producer 跑完照常落库；显式停止走协作取消（producer 在 token 检查点自查）
- **产物中心**：跨会话产物库页（类型过滤 + 分页 + 详情完整渲染）；artifact 增加 thread_id 冗余列（含存量回填）免 4 表 join；侧边栏新增入口
- **单产物分享**：`POST/DELETE /api/artifacts/{id}/share` + 公开 `GET /s/{token}`——服务端渲染 HTML（OG 卡片 + Bauhaus 风格），markdown 安全渲染（markdown-it-py，html=False）、其余全转义；token 只存 SHA-256 哈希、明文仅返回一次、可全量撤销、公开端点按 IP 限流
- **密码登录**：`POST /api/auth/login-password`（手机号/邮箱 + 密码，bcrypt，内存滑动窗口防爆破，未设密码账号与不存在账号同文案 404）+ `POST /api/auth/set-password`（首设免旧密）；登录弹窗双 tab，个人设置可设密码；`/api/user/me` 新增 `has_password` 布尔
- **Token 用量可视化**：agentrun 增加 prompt/completion/total_tokens 三列，专家任务完成后增量累加（SQL 层防竞态）；`GET /api/usage/summary` 今日/累计汇总；头像菜单显示用量条（近似值：router/aggregator 小额调用不计）
- **首页示例卡片真实执行**：三张场景卡从"预填"升级为点击即跑（未登录走 pendingMessage 登录后自动发送），标注"真实执行"

### 运维

- **deploy.sh 发版前置检查**：backend/.env 必须显式设置 ENVIRONMENT；production 下校验 JWT_SECRET_KEY 非默认且 ≥32 字符，否则拒绝部署（防"升级后无法登录"）
- **备份一键挂 cron**：`scripts/install_backup_cron.sh` 幂等安装每日 03:00 备份任务

### 修复

- **时间统一为 UTC（P7）**：DB 此前混用两种时钟（auth 域 UTC、其余本地时间）。28 个模块统一 `utc_now_naive()`，36 个本地时间列一次性回填 -8h（迁移 20260907_000400，部署窗口内切换）；FastAPI 的 datetime 序列化全局追加 "Z"，浏览器不再按本地时区误读；用户侧时钟（prompt 时间注入、时间工具）保持本地
- 部署前置检查随 deploy.sh 分发（该脚本按设计走 SFTP，不入库）

### 其他

- 版本号 3.4.3 → 3.4.4（backend config/pyproject、package.json ×2、UI 常量）

## [2026-09-06] - v3.4.3 执行链路可靠性：HITL 闭环、截断防治、结构收敛

### 新增功能

- **HITL deadline 暂停/恢复**：进入等待审批即清空 deadline_at（用户思考审批的时间不再消耗执行预算——12 分钟的审批间隔曾导致恢复即超时）；恢复执行时发放完整新预算
- **专家结果落库失败前端可见**：新增 PERSISTENCE_WARNING 事件推送（此前只有后端日志）
- 备份脚本 `scripts/backup_db.sh`（pg_dump | gzip + N 份轮转），README 增补 Ops 章节

### 修复

后端执行链：

- **HITL 确认后无动作**：驱动图的 producer 循环被误包在 `elif message_id:` 分支内，而前端确认总是携带 updated_plan，走 `if` 分支应用计划后直接落尾——恢复返回空流、run 被误标 completed、checkpoint 被清。重构为 if/else 共享循环；端到端实测 interrupt→confirm→3 任务全部执行
- **HITL 取消必失败**：取消请求经 SSE 客户端读取 JSON 响应（后端拒绝处理器返回 JSON）必然解析失败；改走非流式 JSON 路径
- **多任务产物雷同**：prompt 组装分支条件写错（`if existing_messages:` 在聊天历史恒非空时永真），任务描述与依赖上下文从未进入后续任务的 prompt，同一专家的每个任务都在回答原始请求；改为仅当末条为 ToolMessage（工具续跑）时才沿用现有 messages
- **产物双写**：同一任务 artifact 经专家完成保存与流末批量收集两条路径落库，产生两行同内容记录；`create_artifacts_batch` 按 sub_task_id 幂等
- **LLM 输出静默截断**：专家调用从不设置 max_tokens，OpenAI 兼容 API 退回较小默认值，长 HTML artifact 在 `<head>` 中途被掐断（页面无 body、预览整页空白，finish_reason=length 无任何报错）。providers.yaml 显式配置输出上限（deepseek/moonshot 32768，请求级>模型级>provider 级）；generic worker 检测 finish_reason=length 告警；前端内嵌 HTML 定高渲染并显示截断警告横幅（三语）
- **P1 异步转换漏网**：12 处 run 状态助手调用缺 await，协程静默不执行，若干路径 AgentRun 永远停在 RUNNING
- **GraphTaskStatus 未注册序列化白名单**：新枚举随 task_list 进 checkpoint，恢复时报 Blocked deserialization，HITL 无法恢复
- **SSE 断连后 producer 空转**：客户端断开不取消 producer_task，LangGraph 继续执行消耗 token 至自然结束
- **事件循环内阻塞写库**：StreamService 状态更新与账本写入全部 `asyncio.to_thread`；专家工具绑定切换到 ASYNC_TOOLS（search_web/read_webpage 原为阻塞 requests，异步版一直闲置）
- **/api/user/me 泄漏敏感字段**：裸 ORM User 序列化出 password_hash/verification_code/access_token 等；改 UserProfileResponse 白名单（GET/PUT 同）
- **安全加固**：`require_role` 工厂修复 expert-list 角色越权；ENVIRONMENT fail-closed（未设置即 production）；OTP/token 改 SHA-256 哈希存储（旧明文行 fail-closed 自然淘汰）；生产环境 500 不再回显异常细节；MCP SSRF 检查 DNS 解析失败时 fail-closed
- **PDF 导出失效**：html2canvas 1.4.1 不解析 oklch()（Tailwind 4 默认调色板），抓图即抛错；换 html2canvas-pro
- **原生 alert 全量替换**：PlanReviewCard / LoginDialog / PersonalSettingsDialog 共 16 处改 pushToast（错误用 destructive 语义）
- **i18n 幽灵键**：5 个零翻译键存在活调用点（登录重发按钮、专家编辑标题等直接渲染键名），补齐三语；18 个有译无类型键补进联合
- 命令器测试与真实数据库解耦（内存 SQLite），CI 空库不再 UndefinedTable

### 重构与架构

- **run_lifecycle 单一模块**：三处重复的 run 状态更新/失败标记/完成收尾/`_get_execution_plan_by_run`/SSE headers 归一；裸 psycopg checkpoint 清理删除，统一走连接池版
- **状态词表枚举化**：新增 GraphTaskStatus StrEnum 命名图状态词表（原约 15 处匿名裸字符串），`to_task_status()` 作为图→DB 唯一映射，ORM 枚举列的裸字符串写入清零
- **SSE 构建栈核实收敛**：证实 sse_builder 并非第二套格式栈（同走 build_sse_event 对象管线）而是传输层便捷层，无需合并；6 个纯转发 shim 降为别名，分层真相写入 docstring
- **前端缓存所有权**：agents 列表唯一真相 = React Query（chatStore 去掉实体持久化，仅留 selectedAgentId）；会话编排收进 `useChatSession`（恢复→轮询交接、终态单次刷新、待发消息重试）；useChatCore 三条复制的流式流程归一（isAbortError / makeStreamCallback / finalizeStream）并删除三处死代码累积
- **checkpointer 建表归一**：删除自研建表预检（只警告不修复），官方 `setup()` 为唯一 schema 所有者
- 前端死代码清扫约 600 行（零消费者逐项 grep 终验后删除）

### 性能

- Mermaid/Chart 渲染器按语言 React.lazy 懒加载，普通代码产物不再拉入重组件 chunk
- ChatStreamPanel lastThinkingIndex 由渲染期内每消息回扫（O(n²)）改为单次 O(n) 预计算
- thread_service 分页计数下推 `SELECT count()`（原先整表载入内存）

### 基建

- Docker 加固：HEALTHCHECK、非 root 运行、.dockerignore 排除 tests/*.md；compose 服务 healthcheck 编排
- CI：并发取消、任务超时、uv 缓存、覆盖率产物、前后端镜像构建验证 job
- 生产环境 schema 单一来源：production 跳过 create_all（Alembic 唯一所有），缺失表快速失败

### 其他

- frontend `package.json` / 根 `package.json` / UI 版本常量 3.4.2 → 3.4.3，对齐后端常量

## [2026-09-06] - v3.4.2 前端设计体系收敛：主题精简、语义 token、可访问性

### 变更

- **主题收敛为三套**：移除 Glass 主题（现存 Light / Dark / Kyoto），旧用户本地偏好自动迁移到 Light；Kyoto 页面渐变进主题 token（`--bg-app`），AppLayout 硬编码 hex 清零
- **语义 token 化**：danger/状态色全库统一（`status-offline/online/info/warning`、`accent-destructive/warning`），清除 `red-500`/`green-500`/`amber-500` 等裸色值；微型字号 token 化（`text-nano/micro/tiny`，160+ 处收敛，零残留）；弹窗 z-index 统一走 `Z_INDEX` 常量（顺带修复弹窗与 toast 同层的隐患）
- **可访问性**：6 个手搓 Portal 弹窗全部支持 Esc 关闭（新增 `useEscapeToClose`）；图标按钮补齐 `aria-label`/`title`；聊天输入工具图标与移动端视图切换的触控目标放大
- **i18n 补漏**：运行时间线/详情、计划审核、Artifact 加载与错误态、登录弹窗占位与提示、设置菜单 UID tooltip 等约 40 处硬编码中文全部接入三语翻译（新增 `run` 翻译模块）

### 修复

- `bg-page` 幽灵类：9 处引用但 Tailwind 配置无映射，背景实际透明（新增兼容别名）
- 聊天页 md 断点双面板 `min-w-[400px]` 相加超视口导致右侧被裁切；`!md:!` 无效 important 语法改为 v4 后缀形式
- 首页双汉堡菜单重叠（页面自带一份与 AppLayout 重复）；移动端首屏两侧共 96px 留白
- dark 主题浅色残留：`.dark` class 从未生效（主题走 `data-theme`），5 处 `dark:` 死变体的浅色值在暗色下刺眼，改用半透明色底 + 主题感知前景
- tailwind-merge 不识别自定义字号 token 导致 `text-micro` 等被误判为文字颜色并在 `cn()` 合并时删除（菜单 UID/语言按钮字号回退 16px），注册 font-size 分组修复
- 专家管理页小屏堆叠（原固定 `w-80` 列表 + 编辑器并排在手机上裁切）；StatsPage 归入内容页容器规范（`max-w-5xl`）并补表格横向滚动

### 界面

- 首页 hero 新增 OPEN SOURCE 仓库入口（内联 GitHub 标志，替换装饰性 IDLE 标签）；头像弹出菜单重设计（扁平行 + 紧凑语言切换 + 登出危险色语义，高度约减半）；删除确认弹窗警告色收进 `accent-warning` token

### 其他

- `package.json` / `frontend/package.json` / UI 版本常量从 3.3.0 同步至 3.4.2（此前 tag 已到 v3.4.1 而常量停滞）

## [2026-09-04] - v3.4.1 跨轮产物连续性：多轮协作闭环

### 新增功能

- **历史产物注入规划**：每条新消息自动携带本会话最近 5 个产物的有界摘要（id/类型/标题/产出专家/内容头 400 字符）进入图状态；Commander 规划 prompt 注入产物清单（支持 `{recent_artifacts}` 显式占位符，DB 提示词未配置时自动追加），规划时知晓可引用/可修改的既有产物
- **get_artifact 工具**：专家执行「修改产物」类任务时按需读取完整产物内容（截断 2 万字符），避免全量产物塞进图状态
- 不破坏会话隔离：仍每轮独立 isolated thread，产物上下文经 initial_state 有界注入

### 端到端实测

第一轮"画用户注册 mermaid 流程图"→ 产出产物；第二轮同会话"把上面的流程图改成时序图"→ Commander 计划显式引用产物 ID → coder 专家实际调用 `get_artifact(产物ID)` 读取原文 → 新产物确认为 sequenceDiagram

## [2026-09-03] - v3.4.0 事件协议 v2：统一事件流（消除脑裂）

### 架构变更

- **事件发射统一**：新增 `agents/event_stream.emit_event`（经 LangChain `adispatch_custom_event`，以 `on_custom_event` 浮现于 `astream_events`）——节点层唯一事件出口，四个节点（router/commander/generic/aggregator）全部迁移；节点不再接触 SSE 线格式、不再读写 event_queue
- **传输通道迁移**：废弃 v1 的"state 携带 SSE 字符串 + 每个 on_chain_end 全量 flush"模式（该模式导致事件重复推送 N+1 遍、checkpoint 膨胀、节点与协议三层耦合）；三处消费端（主流程/恢复内循环/producer）统一处理 `on_custom_event`
- **前端单通道收敛**：chat.ts 所有事件统一经 EventHandler 分发，onChunk 只承担正文流式与 UI 状态同步——双通道脑裂（死通道 bug 的温床）消除
- **task.started 恰好一次**：generic 工具循环重入不再重复发 started（in_progress 标记守卫）

### 实测等价性验证

- simple：router.start/decision、delta、thinking、done、[DONE] 各恰好 1 次
- complex+HITL：v1 的 router.start×3 / plan.created×2 → 全部 ×1
- resume（含工具循环）：v1 的 task.started×7 → ×2（=任务数）；completed/artifact 各恰好一次；delta/done 同 ID

### 契约测试

- 旧 event_queue 不可变性测试重写为 v2 契约：节点唯一出口断言、消费端 on_custom_event 断言、emit_event 全链路回环（真实 StateGraph）、图外 no-op 安全性

## [2026-09-03] - v3.3.10 流式层修复 Stage 1：严重 bug 九项清零（不动架构）

### 数据正确性

- **回答尾部重复**：message.done 的 full_content 校准后，finally 的 forceFlush 又把同帧缓冲追加到尾部——useStreamHandler 增加完成态闩锁（message.done 置位后 flush 丢弃缓冲），异常中断时仍刷出保留半截回答
- **断流当成功**：三处 SSE 生成器（simple/complex 完成、HITL 中断、resume、自定义智能体）补发传输级 `[DONE]`；前端无完成标记的关闭按错误处理（"连接中断，回答可能不完整"），不再静默截断
- **盲目重连**：POST+SSE 非幂等（重发=重复生成/计费+409 冲突），移除自动重发，网络错误明确报错由用户决定重试
- **complex 最终消息绕过统一清洗**：抽 `save_assistant_message_sync` 同步核心，aggregator 复用（think 标签清洗 + frontend_message_id），历史回放可映射；移除旁路 save_aggregator_message
- **resume 产物永不落库**：恢复流 artifact 入队补 task_id（_process_collected_artifacts 依赖它落库到对应 SubTask）

### 资源与可观测

- **checkpoint 无限增长**：新增 `delete_checkpoints_for_thread`（官方 adelete_thread）；run 完成后（图连接归还之后，实测放 with 内会"删后复现"）、resume 完成、取消、超时/线程清理四处接清
- **LLM 实例缓存泄漏**：lru_cache 换为显式 LRU（驱逐/清空时关闭实例持有的 httpx.Client）
- **后台保存静默失败**：专家结果落库失败改为 logger.exception 可见

### 体验

- 停止生成保留已流出的部分内容（不再整体置空）
- ThinkingProcess 折叠 effect 依赖补全（思考先于正文结束时不再永不折叠）

### 验证

- 88 测试 + ruff + tsc 0 + build + eslint 0 错误；真实冒烟：[DONE] 序列 ✓、checkpoint 事后计数 0 ✓、resume delta/done 同 ID ✓

## [2026-09-03] - v3.3.9 流式层修复 Stage 0：invoke 下线 / message_id 贯通 / 缓存链补齐

依据深度架构审查（含 LangGraph 1.2.11 源码级复核与业界流式最佳实践调研）的分阶段修复，本阶段为不动架构的快速收尾：

### 变更

- **下线 /api/chat/invoke**：前端零调用，且 auto 模式因 interrupt_before 在规划后被拦停、返回假 "completed" 与空结果（无任何 resume 接线）；连同 invoke_service 与 invoke_session 一并移除（git 历史可找回）
- **message_id 全链贯通**：AgentState 新增字段并经 initial_state 注入；此前 aggregator 的 message.done 恒为随机 uuid，与流式 delta 的 ID 对不上（同一消息前端无法关联）；resume 两条路径（改计划/直接批准）均补写。实测：直接批准恢复流 delta/done 共用同一前端指定 ID
- **专家缓存失效链补齐**：refresh_cache 此前漏清 dispatcher 与 aggregator 的本地 TTLCache，admin 改专家后聚合器最长 5 分钟用旧 system_prompt 生成
- **移除 langgraph-sdk**：LangGraph Platform 客户端 SDK，全项目零 import 的死依赖

### 验证

- 88 项测试全过 + ruff 全绿
- 真实端到端：complex 触发 HITL → 直接批准 → 恢复流 2600+ delta 与 done 的 message_id 完全一致

## [2026-09-03] - v3.3.8 Moonshot 迁移 Kimi K2.6 与工程清洁

### 变更

- **Moonshot 模型迁移**：`kimi-k2.5` 该 API Key 无权限（实测 404），默认模型切换为 **kimi-k2.6**（$0.95/$4 每百万 token，256K 上下文，便宜快速）
  - K2.6 实测特性入库：默认开思考（`extra_body` 关闭保持快/省，参数约定同 DeepSeek，声明 `thinking_toggle`）；仅允许 `temperature=0.6`
  - 旧 ID `kimi-k2.5` 保留为隐藏别名 → K2.6，数据库存量专家配置无缝兼容；新增 `kimi-k3` 旗舰可选项
- **修复连接池健康检查告警**：psycopg3 异步连接的 `autocommit` 属性只读，原实现每次建连接都告警一次；改为事务态检查 + rollback 兜底（实测对话后告警清零）
- **工程清洁**：ruff format 存量债清零（158 文件全格式化）；删除误入库的 `tsconfig.node.tsbuildinfo` 与本地残留物（test-output.css 等）

## [2026-09-02] - v3.3.7 模型思考过程流式展示（Simple 模式）

### 新增功能

- **思考流实时展示**：Simple 模式开启思考后，回复气泡上方流式滚动显示 DeepSeek 的推理过程（reasoning_content），思考完成自动收起（1.5s），正文随后流式输出——"黑盒等待"变为透明思考流
- 新增 SSE 事件 `message.thinking`（前后端事件契约测试同步覆盖）；思考关闭或模型不支持时完全不发事件，行为与此前一致
- 思考过程随消息持久化（`extra_data.thinking`），刷新/回看历史会话时可重新展开（复用既有 ThinkingProcess 渲染与历史映射）
- 自定义智能体直连路径同步具备转发与持久化能力（当前思考默认关闭，为未来开关预留）

### 行为说明

- 仅 Simple 模式 + 思考开启时可见；Complex 模式与专家流水线不受影响（其 LLM 思考本就为关闭状态）
- 持久化优先使用原生 reasoning_content，`<think>` 标签解析降级为兜底（兼容历史消息）

### 验证

- 端到端实测：开思考对话产生 205 个 thinking 增量事件 + 128 个正文增量 + 567 字符思考入库；关思考零 thinking 事件
- 后端 86 项测试通过（含 SSE 前后端事件契约一致性）；前端 tsc 0 错误、build ✓、eslint 0 错误

## [2026-09-02] - v3.3.6 TypeScript 存量错误清零 + 升级 6.0.3：tsc 288 → 0

### TypeScript 5.7.3 → 6.0.3（为 TS 7 铺路）

- TS 7.0（原生 Go 编译器）已 GA 但 typescript-eslint 尚不支持（peer `<6.1.0`，v9 待发布），先升官方桥接版 6.0.3，行为与 5.7 一致并提前暴露 7.0 弃用项
- **移除已弃用的 `baseUrl`**（TS 7.0 停效；`paths` 保持相对写法不受影响）
- **显式声明 `"types": ["node"]`**：TS 6.0 改变了 `@types` 包的自动全量包含行为，pnpm workspace 符号链接布局下 `@types/node` 的全局命名空间（`NodeJS.Timeout` 等）不再被自动引入；显式包含后正常（react/react-dom 走模块导入不受影响）
- 验证：tsc 0 错误、vite build ✓、eslint 0 错误（57 条存量 warning 不变）

### 问题分布与修复

- **i18n 联合类型缺 92 键**（单一根因）：`TranslationKey` 联合类型落后于翻译文案，补齐全部键
- **未使用符号清理 33 处**：含死代码文件删除（`config/models.ts`、`types/model-provider.ts` 等，v3.3.4 起由 /api/models 替代）
- **SSE 事件判别联合改造**：`SSEEvent<T, K>` 增加字面量类型参数，14 个事件别名绑定各自 `type` 字面量，消除事件类型断言
- **~20 个真实类型 bug**：
  - `ExpertEditor` 保存时未传 `expected_version`（乐观锁实际失效，冲突场景会静默覆盖他人修改）
  - `UserProfile.role` 扩宽为四级角色（`user/view_admin/edit_admin/admin`，与后端一致）
  - `chatEvents` 思考步骤空值安全、zustand persist 中间件泛型重写、`toggle-group` variant 类型收窄等
- **vitest 测试目录移出 tsc 检查**：项目未安装 vitest，测试文件引用其类型全量报错（`tsconfig exclude`，测试文件本身保留）

### 验证

- `tsc --noEmit` 0 错误（项目历史首次）；`vite build` ✓ 22s；eslint 0 错误、warning 90 → 57
- 浏览器实测 + DOM 结构检查：首页关键元素（侧边栏/标题/登录入口）完整，无 Error/undefined 渲染，Bauhaus 主题无损

### 意义

TS 7（编译器重写版）升级的前置债务已还清，后续迁移不再被存量错误淹没

## [2026-09-02] - v3.3.5 依赖全面升级：LangChain 1.6 / Tailwind 4 / Vite 8 (rolldown) / bcrypt 5

### 后端（~66 个包升级）

- **LangChain 全家桶**：langchain-openai 1.1.7→1.6.0、langchain-core 1.2.7→1.6.1、langchain 1.2.6→1.3.18、langgraph 1.0.6→1.2.11（含 checkpoint/prebuilt/sdk）、langsmith 0.6.3→0.12.1、openai SDK 2.15→3.7
- **框架层**：fastapi 0.135→0.141、starlette 0.52→1.6、cryptography 46→50、psycopg/sqlalchemy/sqlmodel/alembic 等全部最新
- **passlib 移除**：认证层（jwt_handler）迁移为 bcrypt 5 原生调用（passlib 已停更且与 bcrypt 5 不兼容）；$2b$ 哈希与历史数据完全兼容，非法哈希防御性返回 False
- **Tavily 适配**：langchain-tavily 0.2.x 将 `TavilySearchResults` 更名为 `TavilySearch`，search.py 导入链已适配（langchain-community 已停止维护，仅作兜底）
- **ChatDeepSeek 集成**：deepseek provider 改用 `ChatDeepSeek`（ChatOpenAI 不透传第三方 reasoning 字段），`reasoning_content` 现落入 `additional_kwargs`——为前端展示思考过程铺路（实测 thinking=enabled 捕获 301 字符，disabled 为 0）
- **pyproject 约束解锁**：mcp<3、bcrypt<6、gunicorn<27、watchfiles<2、cachetools<8；新增依赖 langchain-deepseek 1.1.0

### 前端

- **批量 minor/patch**：react 19.2.8、react-router-dom 7.18、@tanstack/react-query 5.102、@sentry/react 10.73、radix-ui 全系、recharts 3.10、mermaid 11.17 等；删除已废弃的 @types/dompurify
- **大版本**：lucide-react 1.39（1.0 里程碑）、framer-motion 13、katex 0.18、eslint-plugin-react-hooks 7、tailwind-merge 3
- **Tailwind 3 → 4**：`@tailwindcss/vite` 插件替代 postcss + autoprefixer 链路（postcss.config.js 删除）；通过 `@config` 兼容模式挂载原 tailwind.config.ts，全部主题 token（surface/content/border/accent/shadow 语义色、动画、阴影）验证无损；`tw-animate-css` 替代 tailwindcss-animate；`@custom-variant` 精确复刻 v3 darkMode 语义（项目实际经 data-theme 切换，dark: 变体历史上即未生效，行为不变）
- **Vite 7 → 8（rolldown 内核）**：`manualChunks` 由对象形式改为函数形式（rolldown 仅支持函数）；构建时间 41s → 22s；vendor 分包结构与 terser drop_console 压缩验证不变
- **pnpm 10 → 11.25**：适配 pnpm 11 新策略——`minimumReleaseAge: 0`（关闭"拒绝过新包"的供应链防护，本项目需跟进最新依赖）、`allowBuilds`（批准 esbuild/core-js 的 postinstall）
- **Sentry 移除**：`@sentry/react`、`@sentry/vite-plugin` 及 `src/lib/sentry.ts` 整体移除（集成代码从未被任何模块消费，DSN 也未配置），vite 分包表同步清理
- **视觉回归**：Tailwind 4 与 Vite 8 构建产物经浏览器实测截图验证，Bauhaus 主题（品牌黄强调、硬阴影、点阵背景、边框系统）渲染完整无样式缺失

### 有意保留

- TypeScript 先保持 5.7.x（TS 7 为编译器重写，且项目存在 279 个 tsc 存量错误，需先还债再迁移；存量错误已在 v3.3.6 清零并升入 6.0.3，TS 7 待 typescript-eslint v9 支持后跟进）
- mcp 停在 1.29（langchain-mcp-adapters 0.3.2 的 resolver 锁定）；pydantic-core 跟随 pydantic 协调

### 验证

- 后端：全量 86 项测试通过、ruff 无告警、真实 API 冒烟（默认/thinking 开/关、Tavily 实例化）全部通过
- 前端：vite build ✓、eslint 0 错误（90 条存量 warning）、产物 CSS token 完整性逐项核对 ✓、浏览器视觉回归 ✓

## [2026-09-02] - v3.3.4 用户级模型配置：Simple 模式模型选择与思考模式开关

### 新增功能

- **「模型配置」页激活**（头像菜单 → 模型配置，原为纯写不读的占位页）：
  - Simple 模式模型自选：用户可选择对话模型，或"跟随系统默认"；偏好存入新表 `user_settings`（JSONB 弹性字段，多端同步）
  - 思考模式三态开关（跟随默认 / 开启 / 关闭），仅对声明 `thinking_toggle` 的模型开放（当前为 DeepSeek V4 系）；不支持开关的模型自动禁用并提示
  - Complex 模式区域为只读说明（模型仍由管理员在专家管理配置）
- **GET /api/models**：模型列表单一真相源，来自 providers.yaml（过滤已停用 provider 与隐藏别名），前端模型选择器（设置页 / 专家表单 / 创建智能体）全部改为消费此接口，删除前端硬编码模型列表与死代码（含内嵌 env API Key 的 `providerConfigs`）
- **GET/PUT /api/user/settings**：用户偏好读写（校验模型有效性与 thinking 取值）
- **thinking 参数归一化**：`get_llm_by_model(model_id, thinking=)` 按模型能力声明归一化生成 `extra_body`，请求级覆盖 provider 级默认；v1 仅 DeepSeek 映射

### 行为说明

- 未设置偏好时行为与 v3.3.3 完全一致（deepseek-v4-flash + 思考关闭）
- simple 模式（direct_reply）按用户偏好实时选模，偏好无效时静默回落系统默认
- 开启思考后 DeepSeek 的推理内容经 `reasoning_content` 返回，当前 langchain-openai 1.1.7 不透传该字段，v1 不展示思考过程（不影响正文生成与计费）

### 关键改动

- 后端：`routers/system.py`（/models、/user/settings）、`models/domain/user_settings.py` + 迁移 `20260902_120000`、`providers_config.get_available_models()`、`utils/llm_factory.py`（thinking 归一化）、`agents/state.py` + `routers/chat.py` + `agents/nodes/router.py`（偏好注入与选模）
- 前端：`services/models.ts`、`useModelsQuery`/`useUserSettingsQuery`、`SettingsDialog` 重写、`ModelSelector` 改为 API 数据源、删除 `config/models.ts` 与 `types/model-provider.ts`、清理 `utils/config.ts`、i18n 三语 13 个新 key
- 测试：新增 `tests/test_model_preferences.py`（8 项：模型列表过滤、thinking 矩阵、偏好默认值合并/脏数据防御），全量 86 项通过

### 升级注意

- 部署时执行 Alembic 迁移自动建表（deploy.sh 已含 `alembic upgrade head`）
- 旧 localStorage 中的默认模型选择（`xpouch-app-config.defaultModelId`）已废弃，静默忽略

## [2026-09-02] - v3.3.3 模型层迁移：停用 MiniMax，全面切换 DeepSeek V4 Flash

### 背景与根因

- **MiniMax 停用**：账户余额耗尽且生成质量不达预期，全链路切换 DeepSeek
- **DeepSeek 旧模型 ID 停用风险**：官方已于 2026-04-24 宣布旧别名 `deepseek-chat` / `deepseek-reasoner` 于 2026-07-24 停用（实测服务端仍临时映射到 `deepseek-v4-flash` 的非思考模式，但随时可能真正下线）。全项目显式迁移至 `deepseek-v4-flash`
- **V4 默认开启思考模式**：思考 token 按输出计费且增加首字延迟，与原 `deepseek-chat` 行为不一致

### 变更内容

**停用 MiniMax**：
- `providers.yaml`：`minimax.enabled: false`，从 Router 优先级列表移除，模型别名注释保留
- 双重拦截：工厂函数对 disabled 提供商直接抛错；`backend/.env` 注释 `MINIMAX_API_KEY`
- Simple 模式（direct_reply）首选提供商从 MiniMax 改为 DeepSeek（temperature 0.7，不再走 Router 兜底的 0.1）
- 前端模型选择器移除 MiniMax 条目

**DeepSeek V4 Flash 迁移**：
- `default_model`：`deepseek-chat` → `deepseek-v4-flash`，上下文窗口 128K → 1M
- 旧 ID `deepseek-chat` / `deepseek-reasoner` 保留为兼容别名（解析到 v4-flash），数据库中已存储的旧模型 ID 无需迁移
- 后端全部硬编码默认值同步更新（expert_config 9 个专家、llm_factory、commander、admin API、模型/schema 默认值）
- 前端模型列表、智能体默认模型映射、会话兜底值同步更新

**新增能力：提供商级 `extra_body` 透传**：
- `providers.yaml` 提供商配置支持 `extra_body` 字段，经 `ChatOpenAI(extra_body=...)` 透传给 OpenAI 兼容 API
- DeepSeek 配置 `thinking.type: disabled` 关闭思考模式，保持与旧 `deepseek-chat` 行为一致（更快、更省）；需要思考模式时删除该配置即可

### 关键改动

- `backend/providers.yaml`：MiniMax 停用、DeepSeek V4 Flash 配置、extra_body、兼容别名
- `backend/utils/llm_factory.py`：默认模型更新、extra_body 透传
- `backend/agents/graph_builder.py`：Simple 模式 LLM 首选 DeepSeek
- `backend/expert_config.py` / `backend/agents/nodes/commander.py` / `backend/api/admin.py` / `backend/models/domain/*` / `backend/schemas/custom_agent.py` / `backend/services/chat/stream_service.py`：默认模型更新
- `frontend/src/config/models.ts` 及 4 处模型兜底值：前端同步
- `backend/.env.example` / `README.md`：环境变量说明同步

### 升级注意

- **部署后无需修改服务器 `.env`**：yaml 层已硬性禁用 MiniMax（即使 Key 仍存在也会被拦截）
- 数据库中仍有智能体选择 MiniMax 模型的，需在界面手动切换为 DeepSeek，否则调用会报模型不存在
- 实测验证：旧 ID 别名解析、MiniMax 拦截、真实 API 调用（思考模式已关闭）均通过

## [2026-03-18] - v3.3.1 修复

### 会话恢复与任务续执行

**新增功能**：
- **切换会话后可继续执行中的任务**
  - 新增 `useRunPolling` hook：3 秒轮询运行状态，后台持续执行
  - 新增 `RunPollingBar` 组件：显示轮询状态，支持停止执行
  - 新增 `GET /api/runs/{run_id}/status` API：轻量状态查询
  - 切换会话时检测 `latest_run.status`，自动启动轮询
  - 任务完成后自动刷新会话数据

**实现细节**：
- HITL 状态（`waiting_for_approval`）暂停轮询，等待用户确认
- 终态（`completed/failed/cancelled/timed_out`）停止轮询
- 后台轮询：标签页切换后继续执行
- 错误处理：404 或连续 3 次错误停止轮询

### 状态恢复与错误处理修复

**问题修复**：
- **修复刷新页面后状态未正确恢复的问题**
  - 根因：`aggregator_node` 执行完成后只更新 `ExecutionPlan.status`，未更新 `AgentRun.status`
  - 修复：`aggregator_node` 内部直接更新 `AgentRun.status = completed`，不依赖 SSE 流生命周期
  - 影响：刷新页面后前端能正确读取 `latest_run.status === 'completed'`，UI 显示正常

- **修复页面切换时弹出错误提示的问题**
  - 根因：`resumeExecution` 和 `handleApprove` 中 abort 错误检测不完整
  - 修复：统一 abort 检测逻辑，新增 `cancel` 和 `取消` 关键词检测
  - 影响：用户导航离开时不再弹出错误提示

**关键改动**：
- `backend/agents/nodes/aggregator.py`：新增 `AgentRun` 状态更新
- `backend/services/chat/stream_service.py`：改进 `CancelledError` 处理
- `frontend/src/hooks/chat/useChatCore.ts`：完善 abort 错误检测
- `frontend/src/components/chat/PlanReviewCard.tsx`：添加 `isAbortError` 辅助函数
- `frontend/src/hooks/useRunPolling.ts`：新增运行状态轮询
- `frontend/src/components/chat/RunPollingBar.tsx`：新增轮询状态条
- `frontend/src/services/run.ts`：新增运行状态 API

### 数据库连接稳定性优化（全量物理防御）

**问题背景**：
- 长任务（如 26s search）执行期间，Checkpointer 连接被云数据库断开
- 根因：`AsyncPostgresSaver` 持有单连接，26s 空闲期间 TCP 连接被中间防火墙掐断
- 表现：`psycopg.OperationalError: connection was closed` 在 `aput_writes` 时抛出

**优化方案（P1 + P2 + P3 激进版）**：
- **P1: 缩短 pool_recycle**（1800s → 300s）：主动在云数据库 600s idle timeout 前回收连接
- **P2: 缩短 db_pool_max_idle**（1800s → 300s）：与 pool_recycle 同步，确保连接池层面及时清理
- **P3: 激进版 TCP keepalive**（60s/30s → 30s/10s）：30s 无数据即开始探测，每 10s 心跳一次，欺骗中间防火墙

**关键改动**：
- `backend/database.py`：`pool_recycle=300`
- `backend/config.py`：`db_pool_max_idle=300`
- `backend/utils/db.py`：`keepalives_idle=30&keepalives_interval=10`

### useRunPolling 闭包陷阱修复（P0）

**问题修复**：
- **修复 `startPolling` 可能使用过期 `refetch` 函数的问题**
  - 根因：`refetch` 来自 `useQuery`，其 identity 可能变化，导致 `startPolling` useCallback 重新创建
  - 根因：`UnifiedChatPage` useEffect 监听 `startPolling`，但可能持有旧闭包引用
  - 风险：调用 `startPolling()` 时可能使用错误的 `refetch`，导致轮询查询错误的 run 或失败
  - 修复：使用 `refetchRef` 存储最新函数，绕过 `useCallback` 闭包陷阱
  - 修复：从 `startPolling` 依赖数组中移除 `refetch`，减少不必要的重新创建

**关键改动**：
- `frontend/src/hooks/useRunPolling.ts`：添加 `refetchRef` 并在 `startPolling` 中使用 `refetchRef.current()`

### LangGraph 状态隔离修复

**问题修复**：
- **修复会话恢复后发送新消息导致 AI 回显用户消息的问题**
  - 根因：LangGraph checkpointer 使用 `thread_id` 作为状态键，同一会话的历史状态会污染新消息执行
  - 根因：`aupdate_state` 会合并历史状态而非完全替换，导致 `task_list` 等字段继承旧值
  - 修复：使用隔离的 `isolated_thread_id = f"{thread_id}_{run_id}"` 作为 checkpointer 键
  - 修复：确保新消息的 LangGraph 执行从零开始，不受历史状态影响

- **修复恢复流程无法找到 checkpointer 状态的问题**
  - 根因：初始执行使用随机 UUID 生成 `isolated_thread_id`，恢复流程无法重建相同 ID
  - 修复：使用确定性格式 `f"{thread_id}_{run_id}"`，恢复流程可精确重建相同的 thread_id
  - 影响：复杂模式 HITL 恢复现在能正确找到并继续之前的执行状态

**关键改动**：
- `backend/services/chat/stream_service.py`：`handle_langgraph_stream` / `handle_langgraph_sync` / `execute_langgraph_stream` 统一使用 `isolated_thread_id`
- `backend/services/chat/recovery_service.py`：`_cleanup_checkpoints` 支持清理两种格式的 thread_id

### 模板导入导出功能

**新增功能**：
- **完整的模板导入导出工作流**
  - 导出：`GET /api/library/templates/{template_key}/export`，生成标准 JSON 格式（含协议头 `xpouch_template` v1.0）
  - 预览：`POST /api/library/templates/import-preview`，验证 JSON 有效性并检测冲突
  - 导入：`POST /api/library/templates/import`，支持三种策略：override（覆盖）、clone（克隆重命名）、skip（跳过）
  - 前端：Library 页面新增导出按钮和导入按钮（管理员权限）
  - UI：四步向导对话框（upload → preview/conflict → result），支持拖拽上传、策略选择

**安全与权限**：
- 内置模板不允许覆盖
- 仅管理员可执行导入操作
- JSON 协议版本检查，向前兼容设计

**国际化**：
- 中英日三语完整支持
- 新增翻译键：导入/导出相关 30+ 个

**关键改动**：
- `backend/api/library.py`：新增导出、预览、导入三个 API 端点
- `backend/schemas/template_import_export.py`：定义导入导出数据结构
- `frontend/src/components/library/TemplateImportDialog.tsx`：导入对话框组件
- `frontend/src/pages/library/SkillTemplatePanel.tsx`：集成导入导出按钮
- `frontend/src/services/admin.ts`：新增导入导出服务函数

### 模板列表 UI 优化

**改进**：
- **选中效果增强**：添加左侧品牌色边框（`border-l-4 border-l-accent-brand`），多主题下选中状态更清晰
- **删除确认弹窗**：使用 `DeleteConfirmDialog` 组件，避免误操作删除模板
- **导入成功自动关闭对话框**：修复导入成功后对话框未关闭的问题

**关键改动**：
- `frontend/src/pages/library/SkillTemplatePanel.tsx`：选中样式、删除确认、自动关闭
- `frontend/src/i18n/translations/library.ts`：新增确认删除翻译键

## [2026-03-13] - v3.3.0 更新

### Admin Stats Dashboard（管理统计面板）

**新增功能**：
- 新增后端统计 API：`GET /api/admin/stats`（概览）、`GET /api/admin/stats/trends`（趋势）、`GET /api/admin/stats/runs`（运行列表）
- 新增前端统计页面 `StatsPage.tsx`，路由 `/admin/stats`
- 数据库层聚合统计：使用 `func.count` / `func.sum` / `func.avg` + `group_by`
- 指标卡片：总运行数、成功率、HITL 使用率、平均耗时
- 趋势图表：7 天运行趋势折线图
- 运行列表：带分页（默认 50 条），显示状态、模式、时间、用户

**主题适配**：
- Light / Dark 主题完整适配
- 使用透明度色值（`/10`, `/20`, `/70`）确保深色主题可见性

**国际化**：
- 中英日三语支持：stats.title、stats.metrics.*、stats.trend.*、stats.runs.*

**侧边栏入口**：
- 管理员可在侧边栏「统计」菜单进入统计页面
- 修复笔记本屏幕下导航菜单被「最近会话」遮挡的布局问题

### Run Timeline UI 与前端入口

**新增功能**：
- 新增独立页面 `RunTimelinePage`，路由 `/run/:runId`
- 新增前端 API 服务 `frontend/src/services/runs.ts`
- 新增 React Query hooks `useRunDetails`, `useRunTimeline`, `useThreadTimeline`
- 新增类型定义 `frontend/src/types/run.ts`（RunEvent, RunStatus, RunEventType 等）
- 新增 `PayloadDrawer` 抽屉组件，点击事件展示 JSON Payload（语法高亮、复制、展开功能）

**前端入口**：
- 对话页面顶部 `RUN #xxx` 链接（正在运行或历史记录进入）
- 历史会话卡片右侧 `ExternalLink` 图标（仅当有 `latest_run` 时显示）

**后端 API 补充**：
- 新增 `GET /api/runs/{run_id}` API：获取运行实例详情
- 新增 `RunSummaryResponse` 响应模型
- `ThreadListResponse` 新增 `latest_run` 字段，历史列表 API 现在返回最近运行摘要

**修复问题**：
- 修复 `ExecutionPlanState` 缺少 `runId` 字段导致历史对话无法显示运行入口的问题
- 修复 `StreamService._get_execution_plan_by_run` 方法缺失导致 HITL 确认报错的问题
- 修复 `_update_thread_mode` 只更新 `Thread.thread_mode` 但不更新 `AgentRun.mode` 导致运行详情页面模式显示错误的问题

## [2026-03-08] - v3.3.0

### Skill Templates 与 Tool Governance v2

**Skill Templates**：
- 新增 `SkillTemplate` 数据模型与迁移
- 新增 `GET /api/library/templates` 与管理员模板 CRUD 接口
- 启动时自动补齐内置模板：出行路线、研究报告、写作大纲
- `Library` 页面新增 Skill Templates 面板，可直接以模板 starter prompt 发起新会话

**Tool Governance v2**：
- 新增 `ToolPolicy` 数据模型与迁移
- 新增 `GET /api/tools/policies`、`PUT /api/tools/policies/{source}/{tool_name}`
- 运行时现在会把数据库策略覆盖合并到静态工具治理规则
- `Library` 页面新增 Tool Governance 管理面板
- 当前支持可配置项：`enabled / risk_tier / approval_required / allowed_experts / blocked_experts / policy_note`

### Run Ledger 事件账本（2026-03-08）

**新增功能**：
- 新增 `RunEvent` append-only 事件账本模型，追踪 AgentRun 完整生命周期
- 新增 16 种 `RunEventType` 事件类型
- 新增 `GET /api/runs/{run_id}/timeline` API：运行实例事件时间线
- 新增 `GET /api/runs/thread/{thread_id}/timeline` API：线程事件时间线

**接入节点**：
- `run_created`：创建 AgentRun 时
- `run_started`：运行正式进入执行态时
- `router_decided`：Router 决策完成时
- `plan_created` / `plan_updated`：计划创建与用户修改后恢复
- `hitl_interrupted` / `hitl_resumed` / `hitl_rejected`：HITL 中断/恢复/拒绝
- `task_started` / `task_completed` / `task_failed`：任务执行生命周期
- `artifact_generated`：产物落库
- `run_completed` / `run_failed` / `run_cancelled` / `run_timed_out`：运行终态

**修复与加固**：
- 修正 `run_event` 迁移实现，改回标准 Alembic / PostgreSQL ENUM 方案
- 时间线 API 增加 `run` / `thread` 归属校验，避免越权读取其他用户的运行账本

**数据迁移**：
- `20260308_150000_add_run_event_ledger.py`

### Regression Assets 与单线程活跃 Run 约束（2026-03-08）

**Regression Assets**：
- 新增 `backend/evals/assets/regression_cases.json`
- 新增 `backend/evals/regression_runner.py`
- 新增 `backend/tests/test_regression_runner.py`
- 当前覆盖 Router、Commander 输出结构、run timeline 顺序

**单线程活跃 Run 约束**：
- 新增后端线程级活跃 run 冲突拦截
- `/api/chat` 与 `InvokeService` 已拒绝同线程新的活跃 run
- 前端对 409 冲突增加明确提示，不再只显示泛化错误

### Tool Governance 与 Selective Approval（2026-03-08）

**治理层**：
- 新增 `backend/agents/tool_policy.py`
- 新增统一 `risk_tier` 与 `policy action`
- `generic` 绑定工具前会过滤不应暴露给当前 expert 的工具
- `tool_runtime` 执行前会再次做策略校验，作为最后一道强制保护

**第一版策略**：
- `memorize_expert` 已被禁止主动调用 `search_web / read_webpage`
- 高风险 / 副作用 MCP 工具会被要求额外审批，并在第一版中直接阻止执行
- `/api/tools/available` 已返回 `risk_tier / approval_required / policy_note`

### 运行时重构封板（2026-03-08）

**运行时语义收口**：
- 明确并稳定 `Thread / AgentRun / ExecutionPlan` 三层模型
- `TaskSession` 退出现行主语义，复杂任务统一使用 `ExecutionPlan`
- `Thread.status` 降级为展示缓存，前端恢复优先依据 `latest_run.status`

**HITL / Resume / Cancel**：
- `POST /api/chat/resume` 已围绕 `run_id` 收口
- Commander 创建 `ExecutionPlan` 时已绑定当前 `run_id`
- 修复 HITL 确认后 `ExecutionPlan 未找到` 的 404 问题
- 修复恢复失败后 inflight 锁未释放导致的连续 409 问题
- 前端对 resume 的 4xx 错误不再无限自动重试
- `POST /api/runs/{run_id}/cancel` 已进入主链，停止生成不再只是本地 abort

**运行控制面（第一层）**：
- 新增 `AgentRun.deadline_at`
- 新增 `RUN_TIMED_OUT` 错误码
- 新增图循环预算保护 `RUN_MAX_GRAPH_LOOPS`
- 运行中持续刷新 `current_node / last_heartbeat_at`
- 后台清理任务会回收超时运行

**复杂模式稳定性**：
- 路由层为实时路线、距离、怎么去等场景增加确定性 complex 兜底
- 修复复杂模式 artifact 恢复展示
- 复杂模式面板恢复时优先选中有 artifact 的任务
- 修复删除线程 / 删除自定义智能体的关联清理问题
- 新增迁移修复 PostgreSQL enum label drift

**文档更新**：
- 重写 `.ai/langgraph_workflow.md`
- 更新 `.ai/active_context.md`、`.ai/data_schema.md`、`.ai/system_architecture.md`
- 更新 `code review` 目录下的运行时总结与产品化评估
- 重写 `README.md`，对齐当前开源定位与启动方式

### 主题系统语义化改造（2026-03-06）

**架构升级**：
- 新增 Glass/Kyoto 两主题，共支持 Light/Dark/Glass/Kyoto 四主题
- 引入细化层级变量：
  - 阴影三级：`shadow-button-sm` / `shadow-button` / `shadow-button-lg`
  - 位移三级：`transform-button-sm-hover` / `transform-button-hover` / `transform-button-lg-hover`
- 新增字体变量：`--font-sans`, `--font-mono`（主题自适应）

**组件改造**：
- 30+ 组件语义化改造：`ui/*`, `admin/*`, `settings/*`, `bauhaus/*`, `chat/*`
- 统一边框类：`border-2 border-border-default`
- 统一阴影类：`shadow-theme-card`, `shadow-theme-button-lg` 等
- 统一位移类：`[transform:var(--transform-button-hover)]`

**主题风格**：
| 主题 | 边框 | 阴影 | 位移 | 字体 |
|------|------|------|------|------|
| Bauhaus (Light/Dark) | 2px 粗硬边 | 硬阴影 4-8px | 大幅度 2-4px | Space Mono |
| Glass | 1px 细边 | 柔和扩散 4-20px | 微浮动 1-2px | DM Sans |
| Kyoto | 1px 细边 | 极淡 1-4px | 极微 0.5-1px | Noto Serif JP |

**新增文档**：
- `THEME_GUIDE.md`：完整的主题开发指南

### 代码审查修复（2026-03-06）

**P0 关键问题修复**：
- `utils/db.py`：将静默异常 `except Exception: pass` 改为 `logger.warning()`，记录异常信息
- `services/chat/session_service.py`：消除 N+1 查询，使用子查询一次性获取所有线程的最后消息

**P1 重要问题修复**：
- `main.py`：使用 `asyncio.to_thread` 包装同步专家初始化，避免阻塞事件循环
- `main.py`：删除 `/api/v1` 前缀，统一 API 路由风格
- `config.py`：数据库连接池参数可配置化（`DB_POOL_MIN_SIZE`, `DB_POOL_MAX_SIZE`, `DB_POOL_TIMEOUT` 等）
- 工具链简化：删除 Husky 和 lint-staged，统一使用 pre-commit

**P2 性能优化**：
- Ruff：添加 SIM 规则（代码简化建议）
- Ruff：简化 6 处嵌套 if/with 语句（SIM102/SIM117）
- 前端：清理 `prismjs` 冗余依赖，减少 ~100KB 包体积
- 前端：清理 3 处 `console.error`，统一使用 logger
- Pre-commit：修复 ESLint hook 配置，支持 PowerShell 环境

**文档完善**：
- `CONTRIBUTING.md`：添加 pre-commit hooks 安装说明

### HITL 状态持久化（2026-03-06）

**方案1实施：添加 `waiting_for_approval` 状态**

- 新增 `TaskStatus.WAITING_FOR_APPROVAL` 枚举值（`backend/models/enums.py`）
- 数据库迁移：`20260306_120000_add_waiting_for_approval_status.py`
- 后端逻辑：
  - `stream_service.py`：HITL 中断时更新 `TaskSession.status = 'waiting_for_approval'`
  - `recovery_service.py`：用户批准后更新 `status = 'running'`
- 前端恢复：
  - `useSessionRestore.ts`：刷新页面后恢复 HITL 弹窗状态和 `pendingPlan`

**状态流转**：
```
pending → waiting_for_approval → running → completed
                                ↘ cancelled
```

**问题解决**：刷新页面后 HITL 弹窗状态丢失 → 现在正确恢复

### 前端架构优化（2026-03-06）

**会话加载逻辑重构**：
- 统一使用 `useSessionRestore` 处理所有会话恢复场景
- 删除冗余的 `loadConversation` 函数（useConversation.ts 和 useChat.ts）
- 清理 UnifiedChatPage.tsx 中的相关引用和逻辑
- 修复 `isNew` 状态传递，新建会话时正确跳过历史加载
- 添加 `refetchOnMount: 'always'` 确保会话列表及时刷新
- 切换会话时清空 persisted 消息，避免旧数据闪烁

**时间显示和时区修复**：
- 用户消息上方从显示 ID 改为显示时间 `MM-DD HH:mm`
- 修复后端 UTC 时间解析：前端按 UTC 解析（`dateString + 'Z'`）
- 跨年自动显示年份格式：`YYYY-MM-DD HH:mm`
- 影响范围：侧边栏、会话记录页、对话消息

**消息排序双重防御**：
- 前端防御：`useSessionRestore` 中按 `timestamp` 升序排序
- 后端防御：`session_service.py` 中按 `timestamp` 排序

### 基础设施升级（2026-03-05）

**PostgreSQL 15 → 18 升级**：
- 升级 PostgreSQL 15 至 18.2，使用 `pgvector/pgvector:pg18-bookworm` 镜像
- 更新 docker-compose.yml 数据卷挂载路径（PG 18+ 新格式：`/var/lib/postgresql`）
- 更新文档：README.md 和 CONTRIBUTING.md 反映 PG18 要求
- deploy.sh 部署脚本自动检测并处理 PG15→18 升级（备份→清理→恢复）

### 专家管理增强（2026-03-05）

**动态工具列表与使用指南**：
- 新增 `/api/tools/available` 端点，动态返回可用工具列表（基础工具 + MCP 工具）
- 前端工具使用指南：新建/编辑专家时显示可用工具列表及使用示例
- 支持国际化：中英日三语翻译（`loadingTools`, `noToolsAvailable`, `toolTipsDescription` 等）
- MCP 工具实时同步：管理员添加 MCP 服务器后，工具列表自动更新

**工具调用日志增强**：
- `generic.py`：记录专家类型、任务 ID、工具名称和参数
- `tool_runtime.py`：记录工具调用请求和成功状态
- 结构化日志 `[ToolUsage]` 便于后续分析和成本统计

**相关文件**：
- 后端：`api/tools.py`, `agents/nodes/generic.py`, `agents/tool_runtime.py`
- 前端：`ExpertFormDialog.tsx`, `ExpertEditor.tsx`, `services/admin.ts`
- 翻译：`i18n/translations/admin.ts`

### 交互体验优化（2026-03-05）

**管理列表"创建-反馈"模式**：
- **专家管理（ExpertAdminPage）**：创建专家后自动选中并滚动到底部（新项目在列表底部）
  - 排序修复：从 UUID 排序改为 `created_at` 排序，确保新项目出现在底部
  - 自动滚动：`useRef` + `scrollIntoView` 实现平滑滚动
- **MCP 服务器列表（MCPList）**：创建服务器后自动展开并滚动到底部
  - 新增 `onSuccess` 回调传递新服务器 ID
  - `useEffect` 监听数据变化，自动展开并滚动

**最佳实践**：管理后台列表的统一交互模式——创建 → 选中/展开 → 滚动到可视区域

### 配置管理重构（2026-03-05）

**Pydantic Settings 配置管理（最佳实践）**：
- 引入 `pydantic-settings` 替代分散的 `os.getenv` 调用
- 集中式配置管理：`backend/config.py` 统一所有配置项
- 类型安全：自动类型转换和验证（int/float/str/SecretStr）
- 敏感保护：`SecretStr` 自动脱敏，日志不泄露 API Key
- 环境感知：`is_production` / `is_development` 属性
- 便捷方法：`get_llm_key()` / `get_jwt_secret()` / `init_langsmith()` / `validate()`
- 完全兼容：现有 `.env` 文件无需修改，新增配置项有合理默认值
- Ruff 代码规范：`main.py` 添加至 `per-file-ignores`（E402 导入位置规则）

**影响范围**：
- 修改：`backend/config.py`（完全重写）、`main.py`、`agents/graph_builder.py`
- 修改：`schemas/common.py`、`services/chat/stream_service.py`、`pyproject.toml`
- 文档：`backend/.env.example` 添加新配置项说明

### 架构重构（2026-03-04～03-05）

**Models 完全拆分**：
- ORM 模型迁移至 `backend/models/domain/`（user, conversation, task, expert 按领域组织）
- Pydantic DTO 独立为 `backend/schemas/`（请求/响应模型分离）
- 枚举集中至 `backend/models/enums.py`，统一 `_enum_values` 工厂
- 消除 `models/__init__.py` 臃肿问题，职责边界清晰

**SQLAlchemy 2.0 兼容性修复**：
- 移除 `__future__.annotations`（与 SQLAlchemy 2.0 不兼容）
- 修复 `func.now()` 调用（添加括号）
- 升级 SQLModel 0.0.31 → **0.0.37**，SQLAlchemy 2.0.45 → **2.0.48**
- 升级 FastAPI 0.128 → **0.135.1**，Starlette 0.52.1（安全修复）

**代码规范（Ruff 清理）**：
- 修复 ~810 处 lint 警告（UP006/007、F401、I001、W291/293 等）
- 统一现代 Python 类型注解风格（`List[X]` → `list[X]`，`Optional[X]` → `X | None`）

### 专家管理优化（2026-03-04）

**缓存一致性修复（P0）**：
- `refresh_cache()` 现在统一清除三级缓存：全局缓存、Commander 本地缓存、GenericWorker 本地缓存
- 解决管理员更新专家配置后，LangGraph 执行仍读取旧缓存的问题

**乐观锁并发控制（P1）**：
- 新增 `SystemExpert.config_version` 字段（迁移 006）
- 更新专家时校验 `expected_version`，不匹配返回 409 Conflict
- 前端提示用户"配置已被修改，请刷新后重试"
- 使用 SQLAlchemy Core `update()` 实现数据库层原子递增

### 稳定性与运维（2026-03-03～03-05）

**HITL 与恢复**:
- HITL 恢复流程幂等性加固，避免重复提交导致的状态错乱
- Recovery 并发保护与 session 状态一致性

**后台任务**:
- 新增 SessionCleanup 定时任务：自动清理过期/僵死会话（可配置间隔与保留天数）
- 应用启动时注册清理循环，随 Lifespan 启停

**数据库迁移**:
- `004_add_common_query_indexes`：常用查询索引
- `005_unify_index_naming_and_systemexpert_uuid`：索引命名统一、SystemExpert.id 改为 UUID
- `20260304_180000_standardize_enum_and_length_constraints`：枚举与长度约束标准化

**开发体验与门禁**:
- Husky + lint-staged：提交前自动跑前端 lint
- Node 版本要求提升至 ≥24.14（与 package.json engines 一致）
- 修复 ESLint pre-commit hook：`pass_filenames: true` 改为只检查修改的文件，避免全项目既有错误阻塞提交

**影响面与升级注意**:
- 新迁移需在部署时执行 `alembic upgrade head`
- 若从旧版升级，请按 004 → 005 → 20260304 顺序应用

---

## [2026-03-01] - v3.2.4 - 会话历史性能优化与批量删除

### 🚀 性能优化

**分页加载（P0-5 修复）**:
- 后端 `GET /threads` 接口支持分页（`page` + `limit` 参数）
- 前端使用 `useInfiniteQuery` 实现无限滚动加载
- 首屏只加载 20 条记录，滚动到底部自动加载更多
- 加载性能：~3s (500条) → ~200ms (20条)

**API 分离**:
```
GET /api/threads              # 列表（轻量级，无消息内容）
GET /api/threads/{id}         # 详情（元数据）
GET /api/threads/{id}/messages # 消息（完整内容）
```
- `ThreadListResponse` 新增 `message_count` 和 `last_message_preview`
- 避免 base64 图片等内容导致内存溢出

### 🗑️ 批量删除

**新增批量删除功能**:
- 历史页面右上角添加 "Select" 按钮进入批量模式
- 支持单条勾选、全选/取消全选
- 批量删除确认对话框
- 后端新增 `POST /threads/batch-delete` 接口

### 🌍 国际化

**新增翻译键（中/英/日）**:
- `select`, `selectAll`, `deselectAll`, `selectedCount`
- `batchDelete`, `batchDeleteConfirm`
- `moreAvailable`, `loadMore`, `noMoreRecords`

### 🐛 Bug 修复

**页面刷新跳转问题（P0-6 修复）**:
- 新增 `isAuthChecked` 状态标记认证检查是否完成
- `useRequireAuth` 和 `AdminRoute` 等待检查完成后再跳转
- 修复：历史页面、资源库、专家管理页面刷新后跳回首页的问题

### 📁 变更文件
- `backend/routers/chat.py` - 分页和批量删除端点
- `backend/models/__init__.py` - PaginatedThreadListResponse
- `backend/services/chat/session_service.py` - 分页查询逻辑
- `frontend/src/pages/history/HistoryPage.tsx` - 批量删除 UI
- `frontend/src/hooks/queries/useChatHistoryQuery.ts` - 无限滚动
- `frontend/src/services/chat.ts` - API 函数更新
- `frontend/src/store/userStore.ts` - isAuthChecked 状态
- `frontend/src/router/hooks/useRequireAuth.ts` - 等待认证检查
- `frontend/src/components/AdminRoute.tsx` - 等待认证检查
- `frontend/src/i18n/translations/common.ts` - 批量删除翻译

### 🗄️ 数据库迁移（Alembic）

**引入 Alembic 替代手动 SQL 脚本**：
- 全自动数据库架构管理
- 新部署：`alembic upgrade head` 自动创建所有表
- 更新部署：自动应用增量迁移
- 支持回滚：`alembic downgrade`

**迁移文件**：
- `backend/alembic.ini` - Alembic 配置
- `backend/migrations/env.py` - 环境配置（读取 DATABASE_URL）
- `backend/migrations/versions/001_initial_schema_v3_2_4.py` - 初始迁移（完整表结构）

**开发工作流**：
```bash
# 修改 SQLModel 后生成迁移
cd backend
alembic revision --autogenerate -m "Add new table"

# 生产部署自动执行
./deploy.sh  # 内置 alembic upgrade head
```

### 📁 其他变更
- `backend/Dockerfile` - 启动时自动执行迁移
- `deploy.sh` - 添加 Alembic 状态检查和自动迁移

---

## [2026-03-01] - v3.2.3 - 代码重构与设计系统优化

### 🏗️ 事件处理器模块化重构

**拆分 eventHandlers.ts (736行 → 模块化)**:
```
handlers/
├── types.ts              # 共享类型定义
├── utils.ts              # getLastAssistantMessage 工具
├── taskEvents.ts         # plan.* + task.* 事件 (197行)
├── artifactEvents.ts     # artifact.generated (49行)
├── chatEvents.ts         # message.* 事件 (134行)
├── systemEvents.ts       # router.* + HITL + error (110行)
├── index.ts              # 统一导出 + EventHandler 类
└── __tests__/            # 42个单元测试
```

**改进**:
- 按业务域拆分，单一职责
- 引入 HandlerContext 模式，便于测试
- 所有处理器函数可独立测试
- 保持原有 API 兼容性（`handleServerEvent`, `getEventHandler`）

### 🛣️ 路由层模块化重构

**拆分 router.tsx (398行 → 模块化)**:
```
router/
├── index.tsx             # 纯路由配置 (110行，-72%)
├── providers.tsx         # QueryClient + 全局错误处理
├── components/
│   └── LoadingFallback.tsx
├── hooks/
│   ├── useRequireAuth.ts # 认证守卫
│   ├── useCreateAgent.ts # 创建智能体逻辑
│   ├── useEditAgent.ts   # 编辑智能体逻辑
│   └── index.ts
├── wrappers/
│   ├── HistoryPageWrapper.tsx
│   ├── LibraryPageWrapper.tsx
│   ├── CreateAgentPageWrapper.tsx
│   ├── EditAgentPageWrapper.tsx
│   └── UnifiedChatPageWrapper.tsx
└── __tests__/
    └── hooks.test.ts
```

**改进**:
- 业务逻辑下沉到 Hooks，可复用可测试
- Wrapper 组件专注渲染和布局
- 路由配置纯净，只负责路由定义
- 统一的加载状态和错误处理

### ✅ 测试覆盖

- **eventHandlers**: 42 个单元测试，覆盖所有事件类型
- **router hooks**: 4 个单元测试，验证 Hook 导出

### 🔧 后端代码重构

**消除重复代码**:
- 删除 5 处重复的 `load_dotenv()` 调用，统一在 `main.py` 加载环境变量
- 统一 JWT 验证逻辑，从 `dependencies` 导入 `get_current_user`
- 删除 `jwt_handler.py` 中 4 个未使用的函数/类
- 删除 `config.py` 中 2 个废弃配置项

**抽象公共服务**:
- 新增 `mcp_tools_service.py`，统一 MCP 工具获取逻辑（含 TTL 缓存）

### ⚛️ 前端代码重构

**提取通用工具函数**:
- 新增 `sseUtils.ts`：提取 SSE 心跳检测通用逻辑
- 新增 `authUtils.ts`：提取登录弹窗触发函数
- 替换 12 个文件中的 `console.log` 为统一的 `logger`

**配置优化**:
- 删除 `package.json` 中重复的 `workspaces` 字段
- 修复 `clean` 脚本跨平台兼容性（使用 `rimraf`）

### 🎨 智能体创建页面重构

**布局优化（方案 B）**:
- 左侧表单改为两列紧凑布局（名称 + 分类）
- 右侧新增实时预览面板：智能体卡片、系统提示词预览、示例对话

**新增通用组件**:
- `BauhausSelect`：通用的 Bauhaus 风格下拉选择组件
- 统一分类选择与模型选择的交互风格

**国际化**:
- 新增 9 个翻译键：preview, unnamedAgent, noDescription, noSystemPrompt 等

### 📐 侧边栏交互重构

**边缘把手设计**:
- 展开状态：用户卡片右侧竖直把手（20px 窄条）
- 收拢状态：头像下方横置把手（点击展开）

**方圆结合风格**:
- 收拢状态：圆形按钮（像机械仪表盘旋钮）
- 展开状态：方形按钮（像控制面板开关）
- 统一 hover 效果：位移 + 黄色阴影 + 边框变色

**代码优化**:
- 提取 `constants.ts`：统一尺寸常量（230px 宽度、44px/60px 按钮高度）
- 共享 `collapsedButtonStyles`：收拢按钮样式统一
- 移除硬编码颜色：头像 fallback、套餐图标改用语义化变量
- 新增 `expandSidebar`/`collapseSidebar` 国际化翻译

## [2026-03-01] - v3.2.5 - UI 细节优化与代码清理

### 🎨 UI 优化

**滚动条统一**:
- 全站滚动条改为 bauhaus-scrollbar 风格（默认隐藏，hover 显示细条）
- 消息面板、首页、Artifact 面板、对话框等 15+ 处统一

**间距优化**:
- ArtifactDashboard 间距：32px → 16px，增加可视区域
- 聊天面板边距：24px → 16px，更紧凑
- 移除 ArtifactDashboard header 装饰方块

**i18n 修复**:
- 添加缺失的 `preview` 翻译键（中/英/日）
- 添加缺失的 `thinkingProcess`、`thinkingCompleted` 翻译键

### 🔧 代码清理

**移除废弃代码**:
- 删除 `bauhaus-card.tsx`（未使用）
- 删除 `bauhaus-button.tsx`（未使用）
- 删除未使用的 CSS 工具类：.glow-*、.text-glow、.bg-grid

**内联样式清理**:
- NewChatButton、NavigationMenu 等组件移除内联 style
- 统一使用 Tailwind 工具类（w-[230px]、h-[60px] 等）
- 新增阴影工具类：shadow-hard-accent-sm/md/lg

### 🐛 Bug 修复

- 修复翻译键缺失导致的英文 key 显示问题
- 修复 CreateAgentPage 硬编码黑色阴影

## [2026-03-01] - v3.2.4 - 设计系统完善

### 🎨 设计系统

**阴影规范**:
- 新增 shadow-hard-accent 系列工具类
- 统一 hover 阴影颜色为黄色强调色
- 移除所有硬编码 rgba(0,0,0,1) 阴影

**主题一致性**:
- Card 组件恢复黄色阴影 hover 效果
- 统一按钮 hover 边框为 content-primary

### 🗂️ 项目结构

- 删除空目录 `frontend/src/data`
- 统一常量导入路径

## [2026-02-28] - v3.2.3 - 语义化主题系统重构

### 🎨 主题系统重构

**语义化设计令牌 (Design Tokens)**:
- 新增三层架构：Primitive → Semantic → Tailwind Mapping
- 定义了 40+ 语义化变量：surface-*, content-*, border-*, accent-*
- 支持透明度修饰符（如 `bg-surface-card/50`）

**简化主题策略**:
- 移除 Cyberpunk 和单独的 Bauhaus 主题
- 归并为 Light/Dark 两个主题（均为 Bauhaus 风格）
- Light: 暖灰纸张背景 + 黄色强调 + 黑色粗边框
- Dark: 深灰黑底 + 黄色边框/阴影 + 白色文字

**大规模组件更新**:
- 更新 30+ 文件，将旧颜色类替换为语义化变量
- 移除所有 `bauhaus-*` 前缀的类名
- 移除所有 `dark:` 前缀，通过 `data-theme` 属性控制

**兼容层保留**:
- 保留旧变量映射（`--bg-page`, `--border-color` 等）供迁移期使用
- 添加旧主题值迁移（`bauhaus` → `light`）

### ✅ 可复用性

**新增主题无需修改组件**:
```css
/* 只需在 themes/ 目录下新建主题文件 */
[data-theme="my-theme"] {
  --surface-page: 10 10 10;
  --surface-card: 20 20 20;
  --content-primary: 255 255 255;
  /* ... */
}
```

### 🔧 修复

- 修复主题切换时的闪烁问题
- 修复 placeholder 对比度不足
- 修复消息气泡颜色不统一
- 修复反选文字可见性

## [2026-02-28] - v3.2.2 - 代码质量重构与架构优化

### 🏗️ 架构重构

**后端 Service 层抽取**:
- 重构 `main.py`：业务逻辑迁移到 `services/invoke_service.py`
- `main.py` 从 ~500 行减少到 ~310 行
- 引入 FastAPI 依赖注入模式：`service: InvokeService = Depends(get_invoke_service)`
- 提升可测试性：Service 层可独立单元测试

**前端组件拆分**:
- `BauhausSidebar.tsx` (750行) 拆分为 7 个子组件
- `translations.ts` (1043行) 拆分为 6 个模块

### 🔧 代码质量 (P0/P1 修复)

**P0 严重问题修复 (9项)**:
- 修复 `useAsyncError` 不存在导出
- 修复 MCP transport 参数传递 bug
- 添加 ESLint 配置（React Hooks 规则）
- 修复 React 19 `forwardRef` 兼容性
- 修复 Zustand Slice 类型定义
- 修复 N+1 查询问题（TaskSession 预加载）
- 修复 SSRF 防护增强（MCP URL 验证）
- 提取 `formatTaskOutput` 公共函数

**P1 重要优化 (14项)**:
- Selector 统一：创建 `useAuthSelectors.ts`，删除重复定义
- Query 缓存配置：创建 `src/config/query.ts` 统一配置
- Suspense + ErrorBoundary 包装懒加载路由
- STREAM_TIMEOUT 从 30s 提升到 120s
- JSON Mode 智能降级（支持 DeepSeek 等模型）
- LangGraph deepcopy → list() 优化
- MCP 缓存键添加服务器配置哈希
- Vite 代码分割：11 个 manualChunks
- Prettier 配置添加 Tailwind CSS 插件
- TypeScript 配置统一（合并 tsconfig.app.json）

### 🐛 Bug 修复

**认证体验**:
- 修复未登录用户点击侧边栏资源库/历史记录不弹登录框的问题
- Sidebar `handleMenuClick` 添加登录检查
- Router 新增 `useRequireAuth` hook 保护 `/library` 和 `/history`

### 📦 工具链

**代码质量工具**:
- ESLint：React Hooks 规则（rules-of-hooks: error, exhaustive-deps: warn）
- Prettier：添加 `prettier-plugin-tailwindcss` 插件
- 格式化脚本：`format`, `format:check`

### 🔧 Dependencies

- **新增**: `tenacity>=9.0.0` (后端重试机制)
- **新增**: `cachetools>=5.3.0` (后端 TTL 缓存)
- **新增**: `prettier`, `prettier-plugin-tailwindcss` (前端)

## [2026-02-27] - v3.2.1 - MCP 增强与媒体渲染优化

### 🎉 新增功能

**MCP Streamable HTTP 支持**:
- 新增 `transport` 字段支持 `streamable_http` 协议（MCP 新标准，2025年3月发布）
- 向后兼容 SSE 协议（legacy，已弃用）
- 数据库迁移：`mcp_servers` 表新增 `transport` 列（默认 'sse'）

**MCP 工具超时与错误处理**:
- 添加 60 秒工具调用超时，防止外部 MCP 服务挂起
- 超时/错误时返回友好提示给 LLM，而非崩溃整个工作流
- 支持通义万相等长耗时服务（如视频生成）的优雅降级

**媒体内容自动渲染**:
- 自动识别并渲染 MCP 生成的图片/视频链接
- 支持 Markdown 链接 `[text](image.png)` 和行内代码 `` `image.png` `` 格式
- 支持 OSS 对象存储链接（阿里云、AWS S3 等）
- 添加链接过期检测和警告提示

### 🐛 Bug 修复

- 修复 MessageItem 和 DocArtifact 中的图片渲染逻辑
- 修复 ToolMessage content 兼容性问题（DeepSeek/MiniMax）

---

## [2026-02-27] - v3.2.0 - MCP 生态正式版 + 工业级认证

### 🎉 重大更新

**MCP 生态正式可用**:
- MCP 工具调用完整流程验证通过（高德地图等外部工具）
- 修复 ToolMessage content 格式问题，支持多模型兼容
- 生产环境稳定运行，可接入任意 MCP Server

**工业级自动认证机制**:
- 前端拦截器实现静默 Token 刷新
- 用户 60 天免登录体验
- 刷新失败时才弹出登录框，无缝衔接

### 🔐 安全与稳定性 (P0)

**JWT Token 安全重构 + 自动刷新**:
- 从 localStorage 迁移至 HttpOnly Cookie
- 移除 JWT 默认密钥，强制使用环境变量
- Access Token 过期时间从 30 天缩短至 60 分钟
- **新增自动 Token 刷新机制**：前端拦截器静默刷新，用户无感知
  - 拦截 401 错误 → 调用 `/auth/refresh-token` → 重试原请求
  - 刷新失败时才弹出登录框，实现 60 天免登录体验
- 新增 `AuthInitializer` 组件处理页面刷新后的会话恢复

**MCP 工具调用修复**:
- 修复 ToolMessage content 格式问题（DeepSeek/MiniMax 只接受字符串）
- 添加模型特定的 `content_mode` 配置（string/auto）
- 支持多模态模型（OpenAI/Anthropic/Gemini/Kimi）保留原生 list[str|dict] 格式

**MCP 连接安全**:
- 修复 MCP SSE 连接泄漏问题
- 添加 URL 验证（SSRF 防护）
- 使用 `HttpUrl` 类型严格验证 MCP Server URL
- 添加连接超时控制（10秒）

### ⚡ 性能优化 (P1)

**数据库性能**:
- 修复 N+1 查询问题（TaskSession/SubTask/Artifact 预加载）
- 使用 `selectinload` 优化关联数据查询

**LangGraph 优化**:
- 统一所有 Node 函数签名，添加 `config: RunnableConfig = None` 参数
- 修复 Node 间状态传递问题
- 添加专家缓存并发锁保护

**工具调用优化**:
- 添加异步工具版本 `asearch_web()`、`aread_webpage()`
- LLM 调用添加 `tenacity` 重试机制（3次指数退避）
- MCP 工具添加 TTL 缓存（5分钟）

**SSE 连接稳定性**:
- 修复重连计数器不重置问题
- 连接成功后正确重置 `retryCount` 和 `lastActivityTime`
- 优化心跳检测机制

### 🐛 Bug 修复

**Artifact 数据持久化**:
- 修复页面刷新后 Artifact 丢失问题
- 修复会话切换时 Artifact 显示混乱问题
- 修复 `tasksCache` 从 localStorage 恢复时的重建问题
- 优化 `useSessionRestore` 和 `loadConversation` 协调逻辑

**类型安全**:
- 清理 `router.tsx` 中的 `any` 类型
- 修复 `conversation: any`、`agent: any` 等类型定义
- 新增 `ApiError` 接口用于错误处理

### 📦 新增功能

**React 19 最佳实践 Hooks**:
- `useOptimisticUpdate` - 乐观更新模式
- `useSuspenseQuery` - Suspense 查询模式
- `usePromise` - React 19 `use()` 兼容层

**API 改进**:
- 智能体列表添加分页支持
- 统一错误处理增强

### 🔧 Dependencies

- **langgraph-sdk**: 升级至 0.3.5（从 0.3.3 升级）
  - 在 `pyproject.toml` 中显式声明依赖 `langgraph-sdk==0.3.5`
  - 更新 `requirements.txt` 锁定版本至 0.3.5
  - 更新 `uv.lock` 依赖锁定文件

---

## [2026-02-02] - v3.0.0 - 架构重构与开源发布

### 🎉 重大版本更新

**v3.0.0 是项目的首个正式稳定版本，标志着架构重构完成和开源发布。**

本版本经历了全面的架构重构，采用现代化的前后端分离 Monorepo 架构，实现了智能路由系统、LangGraph 多专家工作流、以及 IndustrialChatLayout 双栏布局。

### 🏗️ 架构重构

**Monorepo 架构**:
- 前端位于 `/frontend`（Vite + React 19 + TypeScript）
- 后端位于 `/backend`（FastAPI + Python 3.13 + SQLModel）
- 统一使用 pnpm workspace 管理多包依赖
- 使用 uv 作为 Python 包管理器

**前端架构**:
- React 19.2.4 + React Router 7.12.0 路由系统
- Zustand 5.0.10 全局状态管理
- shadcn/ui + Radix UI 无头组件库
- Tailwind CSS 3.4.17 原子化样式
- Framer Motion 12.29.0 动画与交互
- 响应式设计，支持移动端/平板/桌面端
- 完整的国际化支持（EN/ZH/JA）

**后端架构**:
- FastAPI 0.128.0 异步 Web 框架
- SQLModel 0.0.31 ORM 框架，统一 SQLAlchemy 和 Pydantic
- PostgreSQL 15+ 数据库（移除 SQLite 支持）
- LangGraph 1.0.6 AI 工作流编排
- JWT 认证 + 密码哈希（PyJWT + Passlib）

### ✨ 核心功能

**智能路由系统（Router）**:
- 单入口智能体 `sys-default-chat`（默认助手）
- 后端 Router 节点智能判断 simple/complex
- **Simple 模式**：直接调用 LLM 进行对话响应
- **Complex 模式**：LangGraph 多专家协作工作流
- 通过 `thread_mode` 字段区分模式（非独立智能体）
- 前端无需手动切换，体验更流畅

**LangGraph 工作流**:
- Router 节点：意图识别，只做分类决策
- Planner 节点：任务拆解，生成执行计划
- Expert Dispatcher：循环分发任务到对应专家节点
- 七位专业专家：search/coder/researcher/analyzer/writer/planner/image_analyzer
- Aggregator 节点：整合所有专家结果，生成最终响应
- SSE 实时推送任务进度和专家状态

**IndustrialChatLayout 双栏布局**:
- 左侧 ChatStreamPanel：消息列表 + 输入框（55% 宽度）
- 右侧 OrchestratorPanelV2：编排器面板
  - Simple 模式：AI 预览区域
  - Complex 模式：BusRail（专家状态）+ Artifact（产物展示）
- 桌面端双栏并排，移动端单栏切换
- 全屏模式：Artifact 占满右侧区域

**MCP 生态支持**:
- 原生支持 Model Context Protocol (MCP)
- MCP Server 管理：完整的 CRUD API
- Library 页面：Bauhaus 风格设计
- SSE 连接测试：添加/编辑时自动测试
- 工具动态注入：LangGraph 运行时加载 MCP 工具
- 工具优先级：MCP 专业工具 > 内置通用工具

**自定义智能体系统**:
- 用户可创建个性化 AI 助手
- 支持自定义系统提示词
- 支持选择不同模型
- 支持分类管理
- 默认助手不在列表展示，通过首页输入框直接交互

**Artifact 产物系统**:
- 代码片段：语法高亮、复制功能
- HTML 预览：iframe 实时渲染
- Markdown 文档：安全渲染、支持 GFM
- 搜索结果：结构化展示
- 多产物支持：一个专家可生成多个产物

**Human-in-the-Loop (HITL)**:
- Commander 生成任务计划后暂停等待用户确认
- 支持修改任务、调整顺序、删除步骤
- 完全掌控执行流程

**长期记忆**:
- 基于 pgvector 的向量检索
- 自动提取和存储用户偏好、习惯
- 实现个性化 AI 体验

### 📊 数据库模型

**核心模型**:
- User：用户账户，支持多种登录方式
- Thread：会话记录，关联用户和消息
- Message：消息记录，支持 extra_data 存储额外信息
- CustomAgent：用户自定义智能体

**复杂模式模型**:
- TaskSession：任务会话，记录一次完整的多专家协作过程
- SubTask：子任务，专家执行的具体任务
- Artifact：产物，支持多类型产物存储

**管理系统模型**:
- SystemExpert：系统专家配置（Prompt、模型、温度参数）
- MCPServer：MCP Server 配置管理

### 🔧 技术改进

**代码质量提升**:
- TypeScript 严格类型检查
- Pydantic 模型验证
- 单一职责原则，模块化设计
- 自定义异常类：AppError/NotFoundError/ValidationError/AuthorizationError
- 统一的错误处理装饰器：withErrorHandler

**性能优化**:
- Zustand 状态管理，组件逻辑与视图分离
- React.memo 和 useMemo 优化渲染性能
- 懒加载路由，代码分割
- 专家配置内存缓存
- Zustand Slice 严格隔离
- Services 层 Barrel 模式

**安全性增强**:
- CORS 白名单配置
- 安全头部中间件
- JWT Token 认证
- 密码 bcrypt 哈希
- API 权限检查
- HttpOnly Cookie（v3.1.0）

### 🎨 UI/UX 改进

**视觉设计**:
- Bauhaus 风格设计语言
- 粒子网格动态背景
- 流畅的动画过渡
- 深色/浅色主题支持

**用户体验**:
- 实时打字效果和流式响应
- 专家状态实时更新
- 任务进度可视化
- 移动端手势交互
- 滑动返回功能

### 📦 依赖更新

**前端依赖**:
- Vite 5.4.17 → 7.3.1
- React 19.2.4
- TypeScript 5.6 → 5.7.2
- Framer Motion 11.15.0 → 12.29.0
- Lucide React 0.462.0 → 0.563.0
- React Markdown 10.1.0
- Sentry 错误监控集成

**后端依赖**:
- Python 3.13+
- FastAPI 0.128.0+
- LangGraph 1.0.6+
- SQLModel 0.0.31+
- psycopg 3.x
- langchain-mcp-adapters 0.2.1

**开发工具**:
- pnpm 10.28.1
- uv 包管理器
- Docker + Docker Compose

### 🐛 问题修复

**已修复的关键问题**:
- 修复专家完成事件显示空括号问题
- 修复复杂模式下任务计划展示逻辑
- 修复自定义智能体消息不显示问题
- 修复 Artifact 状态在切换会话时残留问题
- 修复专家状态栏在明亮主题下的文本对比度问题
- 修复移动端滑动返回冲突问题
- 修复侧边栏菜单状态同步问题

### 📝 文档更新

**文档改进**:
- 完整的 README.md 文档，包含架构说明、部署指南、使用教程
- CHANGELOG.md 详细的版本更新记录
- 国际化翻译文件（EN/ZH/JA）
- Docker 部署配置和 Nginx 配置
- 环境变量配置说明
- CODE_REVIEW_REPORT.md 代码审查报告

### 🔒 生产环境准备

**部署优化**:
- Docker Compose 一键部署
- PostgreSQL 数据库容器化
- 前端静态资源 Nginx 托管
- 后端容器健康检查
- ~~数据库迁移脚本（幂等性设计）~~ → 已迁移至 Alembic（v3.2.4）
- CORS 和安全头部配置

### 📊 代码统计

- 前端文件：135+ 个文件
- 后端文件：44+ 个文件
- 代码行数：约 20000+ 行

---

## 归档

更早期的版本变更记录请查看 [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md)
