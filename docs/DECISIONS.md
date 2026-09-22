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

## 工程

- **sync/stream 双轨保留**：后端 sync 路径是公开 API（docstring 注记）；前端非流式死分支已删。
- **合理自研、勿再当待办重审**：RunEvent 账本 + stream_hub 断线续传（OSS 无等价物）、deadline/心跳/清理循环、DB 协作取消、SSRF 校验、serializer 白名单（官方安全参数）、前端 fetch-event-source + 接管连接 + RAF 渲染。
- **有意保留不重构**：RAF 批量层；主题 FOUC 内联脚本（内联脚本无法 import TS，是硬约束）。
- **模型**：MiniMax 已停用（2026-09-02，质量与成本原因，providers.yaml enabled:false）；默认 deepseek-flash。
- **时区**：全库 UTC naive 写入 + 前端 `toLocalDate` 补 Z 解析（规则详见 TARGET-ARCHITECTURE.md）；20260912_000300 已纠 user.created_at，其余表个别 ±8h 历史行有意不迁移（用户知悉）。
- **版本号单源**：`backend/pyproject.toml`（改后必须 `uv lock` 重锁）；发版 patch 递增。
- **依赖升级口径（2026-09-13）**：只升同大版本的 patch/minor；前端 `pnpm up <pkg>@<ver>` 显式列包、后端 `uv lock --upgrade-package <pkg>`；**明确不升**：eslint 10 / typescript 7 / mermaid 12 / @vitejs/plugin-react 6 / @types-node 26 / eslint-plugin-react-refresh 0.5；langchain 1.3.18→1.4.0 不升（`docs/langgraph-native-audit.md` 审计基线钉在该版本，升级须连审计重跑）；mcp 2.x 被上游 langchain-mcp-adapters 卡住。
- **API 建模约定**：恒序列化、值可空的字段**不写默认值**（默认值会被 OpenAPI 降级 optional，与运行时恒有键矛盾）。改协议/路由后的常规动作：`just gen-enums` / `just gen-event-types` / `just gen-openapi-types`。
- **evals/ 不进镜像**=有意（仅测试引用）。
- **许可：标准 Apache-2.0**（2026-09-15，4fb7377）：LICENSE 与官方逐字一致 + NOTICE（§4d），SPDX 三处；用户明确放弃 SaaS 限制与品牌保护（执行前二次确认过）。后果：他人可自由 SaaS 转售/改名；**再收紧需征得贡献者同意（无 CLA），收外部 PR 前应先考虑加 CLA/DCO**。
- **部署语义**：镜像内（代码/providers.yaml=必须发版）vs 宿主机（backend/.env=可热改，`docker compose up -d` 生效，restart 不重读 env）。
