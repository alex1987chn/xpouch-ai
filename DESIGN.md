# XPouch AI — UI 设计与交互规范（Bauhaus）

> 本文是**使用规范**层：什么场景用什么、怎么写才"像 xpouch"。
> Token 的完整数值清单见 [THEME_GUIDE.md](./THEME_GUIDE.md)；本文不重复变量值。
> 新页面 / 新组件上线前，过一遍文末检查清单。

## 0. 设计原则

1. **扁平 + 硬边框**：Bauhaus 语言 = 2px 实线边框、直角或小圆角、偏移硬阴影。不使用渐变、发光、大圆角、软投影堆叠。
2. **语义 token，永不写死颜色**：所有颜色走 Tailwind 语义类（`bg-surface-*` / `text-content-*` / `border-*` / `accent-*`）。唯一的固定色例外见 §2 类型色板。
3. **克制动效**：动效是反馈不是装饰。150–300ms、ease-out、无弹跳曲线；做之前先问"去掉它会少什么"。
4. **mono 大写 = 工业感签名**：标签、元数据、按钮文案用 `font-mono` + `uppercase` + `tracking-widest`，这是全站识别度最高的元素，别省略。

## 1. 颜色 Token 使用规则

| 场景 | 用法 |
| --- | --- |
| 页面底 | `bg-surface-page` |
| 卡片/面板 | `bg-surface-card`，弹层内嵌块用 `bg-surface-elevated` |
| 输入框 | `bg-surface-page` + `border-2 border-border-default`，focus 走全局 `:focus-visible`（勿自带 outline） |
| 主文字 / 次要 / 弱化 | `text-content-primary` / `text-content-secondary` / `text-content-muted` |
| 边框 | 静止 `border-border-default`，hover `hover:border-accent` |
| 强调 / 品牌 | `bg-accent-hover`（按钮主底）、`bg-accent-brand`（标记块） |
| 危险 | 仅破坏性动作用 `accent-destructive`；红色是危险信号，不作装饰 |
| 遮罩 | `bg-black/50`（scrim 双主题通用，勿改语义 token） |

**禁令**：

- ❌ 写死 `gray-*` / `slate-*` / hex 到组件配色（暗色主题直接坏）。
- ❌ 使用 `dark:` 前缀类——本项目主题走 `data-theme` 属性切换，`.dark` 类**从未被添加**，所有 `dark:` 都是死代码（见 `src/index.css:42`）。
- ✅ 双主题自查口诀：**token 对 token 自动适配；一旦出现固定色（hex / text-white / bg-black），必须脑内过一遍暗色下的对比度**。

**类型色板（唯一固定色例外）**：产物/图表类型徽章允许固定 hex 底（`ArtifactsPage.tsx` 的 `TYPE_COLORS`），但前景必须用 `text-white` 固定白（不能用 `text-surface-page`——它在暗色下翻转成深色，压不出对比度）。语义化半透明写法参考 `SkillTemplatePanel.tsx` 的 `ARTIFACT_TYPE_COLORS`（`bg-green-500/15 text-content-primary`）。

## 2. 字号与排版

| Token | 值 | 用途 |
| --- | --- | --- |
| `text-nano` | 9px | 最弱元数据（时间戳脚注、辅助括注） |
| `text-micro` | 10px | 标签、徽章、按钮行内说明（默认搭配 `font-mono uppercase tracking-widest`） |
| `text-tiny` | 11px | 紧凑列表正文 |
| `text-xs` / `text-sm` | 12/14px | 常规正文、按钮 |
| `text-lg`+ / `font-display` | — | 页面标题、弹窗标题（配 `font-black uppercase tracking-tight`） |

规则：正文可读性优先用 `text-sm`；`text-nano/micro` 只用于"第二层信息"，不要拿它当正文省空间。

## 3. 边框、阴影与形态

- **边框**：标准 `border-2`；内嵌细分隔用 `border` + `border-border-default` 或 `border-border-divider`。
- **阴影**：新组件一律用语义阴影 `shadow-theme-button / -card / -modal / -dropdown`（值随主题变），配 `--transform-button-hover/active` 变量做按压位移，全套写法照抄任一新页面按钮：
  ```
  shadow-theme-button hover:shadow-theme-button-hover hover:[transform:var(--transform-button-hover)]
  active:shadow-theme-button-active active:[transform:var(--transform-button-active)]
  ```
  旧 `shadow-hard-*` 仅存量维护，不扩散。
- **圆角**：容器 `rounded-md` 徽章/按钮 `rounded`；整站无大圆角（`--radius-*` 变量统一控制，勿写 `rounded-2xl`）。

## 4. 布局惯例（内容页）

照抄 `ArtifactsPage` / `HistoryPage` / `LibraryPage`：

- 容器：`min-h-screen bg-surface-page px-6 md:px-12 py-8` + `max-w-5xl mx-auto`（弹窗内表单页用 `max-w-2xl`）。
- 标题行习语：左侧「`w-2 h-2` 色块 + `///` + 大写标题」，右侧对齐计数/操作，底部 `border-b-2 border-border pb-2`。
- 卡片网格：`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5`；卡片最小高度撑齐（`min-h-[...]`）。
- 弹窗：`createPortal(到 body)` + `Z_INDEX.MODAL`（必须 portal——AppLayout 有层叠上下文，否则被侧边栏 z-index 压住）+ 容器 `bg-surface-card border-2 border-border shadow-theme-modal`。

## 5. 动效规范（v3.4.4 起）

原则：**只做入场与反馈，不做持续动画**；全部时长 ≤300ms；全局 `prefers-reduced-motion` 已自动压平一切动画（`src/index.css`），无需逐处处理。

| 场景 | 做法 |
| --- | --- |
| 页面入场 | 容器加 `.page-enter`（200ms 淡入，`AppLayout` 已统一挂载，新内容页无需自己加） |
| 列表/网格错峰 | 条目加 `.stagger-item` + 内联 `animationDelay: Math.min(i, 8) * 40ms`（步长 40ms、封顶 8 项，见 `ArtifactsPage`） |
| 弹窗/菜单入场 | `tw-animate-css`：`animate-in fade-in zoom-in-95 duration-200` |
| Toast | 已有 `slide-in-from-bottom-2`（`toaster.tsx`），新 toast 不用重复加 |
| hover/按压反馈 | 阴影 + transform 变量（§3），`duration-150` |
| 主题切换 | 全局 `theme-transition` 已覆盖 html/body，组件不自带颜色过渡 |

明确不做：侧边栏折叠宽度补间（结构是条件渲染，硬做要重构）、路由退出动画（React Router 无原生支撑，收益低）、任何循环动画（骨架屏 pulse 除外）。

## 6. 加载态：骨架屏优先

- **禁止**在内容区放裸的"加载中…"文字行；按钮内联 `loading` 文案可以。
- 用 `src/components/ui/skeleton.tsx` 的 `Skeleton`（原子）/ `CardSkeleton` / `RowSkeleton` 组合出**与真实布局同构**的骨架（网格页用卡片骨架 ×6、列表页用行骨架 ×6、两栏面板左右同构，参考 `SkillTemplatePanel`）。
- 骨架必须用语义 token（组件内已是），暗色自动适配。

## 7. 新页面上线检查清单

- [ ] 所有颜色是语义 token？固定色（类型徽章/scrim/白字）逐一过了暗色对比度？
- [ ] 没有 `dark:` 前缀类、没有 `gray-*` 配色？
- [ ] 标题行、容器宽度、网格用了 §4 惯例？
- [ ] 弹窗 `createPortal` + `Z_INDEX.MODAL`？
- [ ] 列表 loading 是同构骨架屏？空态有文案？
- [ ] 列表条目挂了 `.stagger-item` 错峰（≤8 项封顶）？
- [ ] 按钮三态（hover/active/disabled）齐了，危险操作才是红？
- [ ] 文案走了 i18n 三语（zh/en/ja + `TranslationKey` union）？
