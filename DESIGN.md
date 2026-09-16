# XPouch AI — UI 设计与交互规范（柔和材质体系）

> 本文是**使用规范**层：什么场景用什么、怎么写才"像 xpouch"。
> v3.5.1 起对齐柔和材质体系（Bauhaus 规范已随该主题一并退役）。
> Token 完整数值见 [THEME_GUIDE.md](./THEME_GUIDE.md)；新页面/新组件上线前过一遍文末检查清单。
> 组件语法字典、位置与交互态的硬规则见 [docs/DESIGN-SPEC.md](./docs/DESIGN-SPEC.md)。

---

## 0. 设计原则

1. **柔和材质**：1px 预混合细边框、软阴影三档、克制的悬停微位移（`-translate-y-px`）。
   不使用硬边框、大位移、发光、弹跳曲线。
2. **语义 token，永不写死颜色**：所有颜色走 Tailwind 语义类。唯一例外：打印/导出强制
   配色、图表数据系列色、`lib/expertIdentity` 身份色板（与 token 同源集中声明）。
3. **克制动效**：动效是反馈不是装饰。`duration-fast`、ease-out、无弹跳；
   主题切换的光圈扩散尊重 `prefers-reduced-motion`。
4. **胶囊语言 + 暖纸底**：`rounded-full` 胶囊控件与 `rounded-md/lg` 卡片是全站签名；
   正文 13.5px（`text-body`）是对话流签名档。

## 1. 主题

- 枚举：**soft（柔和·默认）/ dark（黑暗）**，`data-theme` 挂 `<html>`。
- 业务代码零 `dark:` 前缀——一切由 token 承担；确需局部重置主题（如打印导出），
  在局部挂 `data-theme="soft"`，token 选择器已支持命中。
- 图表等需要 JS 取色处：读 token 计算值（见 `ChartRenderer.useChartTheme`），
  不得写死 hex。

## 2. 色彩语义

| 场景 | 用法 |
| --- | --- |
| 页面底 / 卡片 / 弹层内嵌 | `bg-surface-page` / `bg-surface-card` / `bg-surface-elevated`（或 `bg-surface-tint` 分组底） |
| 主 / 次 / 弱文字 | `text-content-primary` / `text-content-secondary` / `text-content-muted` |
| 边框 | `border-divider`（静止）→ `border-hover`（悬停）→ `border-focus`（聚焦） |
| 品牌 | `bg-accent-brand`（CTA 底）+ `text-accent-ink`（黄底配字，成对使用，禁止 content-primary 代替） |
| 危险 | `accent-destructive` / `status-offline`——红仅作危险信号，不作装饰 |
| 状态 | `status-online` / `status-offline` / `accent-warning` / `status-info`，文字级用加深档 |
| 遮罩 | `bg-surface-scrim/45` |

**专家识别色 / 产物类型色**：单源 `lib/expertIdentity.ts`（六色板哈希取色）与
`lib/artifactPresentation.ts`（类型色映射），业务不得自带色值。这是寻路语义
（"这步是谁干的"），不是装饰色。

**禁令**：❌ `gray-*`/`slate-*`/hex 进组件配色；❌ 品牌黄作低对比文字；
❌ 自创几何块当品牌标记（品牌=口袋 logo + `[XPOUCH]` 字标）。

## 3. 字号阶梯（禁止 text-[Npx] 任意值）

| token | 值 | 用途 |
| --- | --- | --- |
| `text-nano` | 10px | 卡片底行元信息 |
| `text-tiny` | 11px | 次级元信息 |
| `text-caption` | 11.5px | 辅助说明 |
| `text-xs` | 12px | 列表正文 |
| `text-body-sm` | 13px | 密集正文 / 控件文字 |
| `text-body` | 13.5px | **对话正文（签名档）** |
| `text-body-lg` | 14.5px | 强调正文 / 胶囊按钮文字 |
| `text-sm` 及以上 | Tailwind 默认 | 标题 |

一次性展示字号（海报类产物渲染）允许任意值，需注释说明。

## 4. 材质与组件

### Button（cva 变体，新代码禁止手写胶囊类名）

| 变体 | 用途 |
| --- | --- |
| `default`（或 `pill` 系） | 标准灰描边控件 |
| `brand` / `pillBrand` | 黄底主行动（`pillBrand` 配 `size="pill"`） |
| `pill` / `pillDanger` | 对话流/弹窗内高频胶囊次级 / 危险胶囊 |
| `destructive` | 非胶囊破坏性控件 |

三态（hover/active/disabled）必须齐；危险操作才是红。

### 弹窗（唯一 API：ModalShell）

所有新弹窗一律 `ModalShell`（Portal + 遮罩 + 焦点陷阱 + Esc + `dismissable`）；
确认类二弹窗复用 `DeleteConfirmDialog`。禁止手写 portal + hook 对展开；
Radix `dialog.tsx` 仅保留标准件，不再新增消费。

### 分段胶囊（Segmented）

单选切换一律 `ui/segmented`（Radix ToggleGroup 行为芯），尺寸 sm 28 / md 30 / lg 34。
禁止手写 overflow-hidden 分段条。

### 空态（EmptyState 两档 + 第三种语义）

`card`（虚线卡 + 图标 + 描述 + CTA）用于真空态；`bare`（+`dense`）用于筛选无结果，
**不放操作按钮**（用户知道在哪发起会话）。

第三种是**对象不存在**（会话被删、链接失效、路径打错）：不要静默留白或默默跳首页——
用 `card` 档给明确标题 + 一句说明 + 去处（重试 / 回工作台），让用户知道"东西不是丢了，
是这里没有"。未知路由同理：回工作台并留痕（`NotFoundRedirect`）。

### 思考面板（思维链）

- **按专家分组**：组头 = 专家识别色点 + 显示名 + 状态（进行中 / 失败，进行中优先），
  任务数 **>1 才显示**；组内是该专家负责的任务行。规则与纯函数在 `lib/thinkingGroups.ts`：
  只有任务步骤（`type='execution'`）参与分组、只合并**相邻**同专家步骤（编排步骤按原位置内联，
  时间顺序不重排）、专家为空的任务不分组。
- **组头不做底色条**：层级靠字号字重表达——面板头 14px bold > 组头 12px semibold > 步骤行
  12px regular（对齐蓝图 run-card「普通行 + 分隔线」的做法，全宽色带会压过面板头）。
- **缩进两档**：组内任务行 `pl-[46px]`，编排步骤 `pl-[66px]`——层次靠缩进表达，不靠再包一层卡片。
- 步骤行标题：组内用 `taskDescription` **前 30 字**（计划描述常是整句长文，全量渲染会让面板
  「字很大」；详情/摘要在下方，不丢信息），编排步骤用类型短名。
- 面板数据有两个来源：实时事件流 与 运行事件账本重建（`started_at` 是重建的锚点），
  刷新后两者必须视觉一致。
- 专家显示名走 `useExpertLabel`（服务端名册 → 智能体 → 静态表 → 原文），
  不要在组件里另写一份映射。

### 其他既定件

- 状态胶囊 `RunStatusBadge`；行内 chip `rounded-full px-1.5 text-nano`。
- 权限锁定 `LockCard`（可见但锁）。
- 子页面壳 `SubPageLayout`：搜索住标题行右槽 `w-72`，标题行 `min-h-9` 防跳动。
- 产物画布两档宽 330/560；对话列 `max-w-[760px]` 居中。
- Toast 单系统 `pushToast`（SSE 等 非 React 上下文同样可用）。

## 5. 布局与响应式

- 工作台三栏：会话地层 236px / 对话列 / 产物画布（`xl` 起显示）。
- 移动端：左栏塌为顶部分段条；弹窗 `max-w-[90vw]`。

## 6. 动效与可访问性

- `duration-fast` 为默认；一切动效尊重 `prefers-reduced-motion`。
- 弹窗：focus trap + 焦点归还 + `role="dialog"` + `aria-modal` + `aria-labelledby`；
  图标按钮必有可访问名；表单 label 显式关联；对比度 WCAG AA。

## 7. 上线检查清单

- [ ] 颜色全是语义 token？固定色逐一过了暗色对比度？
- [ ] 没有 `dark:` 前缀类、没有 `gray-*`/hex 配色（除 §2 例外）？
- [ ] 字号走阶梯 token，没有 `text-[Npx]`？
- [ ] 胶囊按钮用了 `pill` 系变体，没有手写胶囊类名？
- [ ] 弹窗是 ModalShell？有焦点陷阱与 aria？
- [ ] 单选切换是 Segmented？
- [ ] 列表 loading 同构骨架屏；空态两档选对了？
- [ ] 按钮三态齐了，危险操作才是红？
- [ ] 文案走 i18n 三语（`TranslationKey` union 缺键编译报错）？
