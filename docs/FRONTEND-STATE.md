# 前端状态所有权清单（三轨统一 · Phase A）

> 2026-10-04 立项。背景：三轨状态（zustand ×2 + react-query）没有所有权规则，
> 切换/恢复/收尾的编排手工散布在多处，顺序错一位就是"切会话卡空态"这类事故
> （当周实案）。本文件是**唯一真相源**：每个状态原子归谁、谁写、何时重置。
> 改动前端状态前先对表；发现实际与本表不符，先改本表再改代码。

## 一、轨道划分

| 轨道 | 载体 | 判据 |
|---|---|---|
| **服务端状态** | react-query 缓存 | 真相在服务端，前端只是缓存；只经 invalidate 失效，**永不手写清空** |
| **会话 UI 态** | chatStore（zustand，无持久化） | 只对"当前打开的这个会话"有意义 |
| **执行与审批态** | taskStore（zustand，仅持久化 UI 偏好） | 描述"执行进行到哪一步"，随会话切换整体重置 |

## 二、状态原子清单

### 服务端状态（react-query）

| 缓存 | key | 失效时机 |
|---|---|---|
| 会话列表 | `chatHistoryKeys.lists()` | 发送/删除/流收尾/恢复对账 |
| 会话详情 | `chatHistoryKeys.detail(id)` | 删除会话时 removeQueries |
| 产物 | `artifactsKeys.*` | artifact.generated 事件防抖 + 流收尾 |
| 模型 / 用户设置 / 运行时间线 | 各自 keys | 常规失效 |

**规则**：任何组件不得把 react-query 数据复制进 store 长期持有（2026-09-13
已清过 tasks/artifacts 双真相源，勿复燃）。

### 会话 UI 态（chatStore）

| 原子 | 写入点 | 重置时机 |
|---|---|---|
| `messages` | 流式事件、恢复、乐观消息 | leaveCurrentThread / 进程切换 effect |
| `currentThreadId` | 恢复、onThreadId 回调、切换 effect | leaveCurrentThread（置 null） |
| `inputMessage` | 输入框、startWith 预填 | 用户清空（**切换不清**——保留未发出的草稿是刻意的） |
| `isGenerating` | 发送/恢复/挂断/收尾 | 任一执行终点 |
| `lastAssistantMessageId` | addMessage/renameMessageId 派生维护 | 随 messages |

### 执行与审批态（taskStore · createUISlice）

| 原子 | 语义 | 重置时机 |
|---|---|---|
| `mode` | simple/complex（持久化偏好） | resetAll |
| `activeRunId` | 当前接管的 run（轮询/审批/恢复三处共用） | 终态/收尾/leave |
| `pendingPlan` / `previousPendingPlan` / `pendingPlanVersion` / `pendingRunId` | 审批卡数据面 | resetAll / 审批完成 |
| `isWaitingForApproval` / `planRevising` | 审批卡可见性 / 修订中 | 同上 |
| `runningTaskIds` | 执行中任务集合（持久化） | 任务终态 |

### 瞬态（hook 局部，**不进 store**）

| 状态 | 归属 | 说明 |
|---|---|---|
| 轮询状态机 | useRunPolling（ChatCore 实例内） | isPolling/isHITLPaused/isTerminal——曾入 store 的影子副本已删（09-13） |
| isRestored / isLatestRunControllable / latestRunId | useSessionRestore | 恢复进度，恢复完成即定 |
| isSubmitting / isEditing | PlanReviewCard | 组件防抖 |

## 三、生命周期编排（Phase B 已收敛）

- **离开会话**：`leaveCurrentThread()`（src/store/sessionLifecycle.ts）——清
  messages、置空 threadId、resetAll。五处手写序列已全部替换：地层切换、
  命令面板（新建/跳转）、删除当前会话 ×2、新建会话。**新代码不得再手写三连**。
- **进入会话**：WorkbenchChatCore 的线程切换 effect 单点实现（挂断旧流 →
  清残留 → 预设新线程标识），顺序是 2026-10-03 事故修复的一部分，勿拆动。
- **恢复**：useSessionRestore 按服务端真相校准三轨（唯一允许批量写 store 的地方）。

## 四、已知顺序敏感点（改前必读）

1. 恢复守卫读 live store（`useChatStore.getState()`）：编排必须先清
   `isGenerating` 再让恢复 effect 跑（2026-10-03 事故根因）。
2. `resetAll` 会清 `pendingPlan`——审批进行中的会话被切走即丢审批卡，
   回来靠 restore 重建（isWaitingForApproval + GET /plan）。
3. react-query 失效不区分会话（画廊跨会话共享），流回调里的 invalidate
   不受归属守卫限制（刻意）。

## 五、剩余阶段（Phase C/D，未动工）

- **C · 执行态合并**：`isGenerating`（chatStore）/ `activeRunId`（taskStore）/
  轮询状态机（hook）实为同一事实"本会话有活着的执行"的三份投影，长期目标
  是一个显式状态机（idle / streaming / awaiting_approval / polling）。
- **D · 恢复读Selector 化**：performRestore 的 store 写入改经 selector 批量
  提交，减少中间态可观察窗口。
