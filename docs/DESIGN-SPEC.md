# XPouch AI — 组件语法字典与硬规范

> 本文件是 UI 实现层的**规则集**：组件语法、位置规范、交互态语言、禁则与
> 「有意不抽象」清单。设计原则 / 主题机制 / token 全表见根目录 [DESIGN.md](../DESIGN.md)；
> token 代码实现 = `frontend/src/styles/tokens/`，基础件 = `frontend/src/components/ui/`。
>
> 规则的演变过程与拍板记录不在仓库内（私有笔记）；本文件只保留**当前有效的结论**。

## 布局

- 应用壳：52px 顶栏 + 60px 图标栏 + 内容 + 28px 环境状态栏（`WorkbenchLayout`）。
- 内容页统一布局：`SubPageLayout`（168px 侧边子菜单，浅底圆角选中；窄屏横向页签）
  + `SubPageHeader`（17px 粗体标题 + 1px 分隔 + 右插槽）。资源库 / 系统管理 / 运行统计共用。
- 内容页正文宽度统一 `max-w-6xl`（切页时内容区宽度不跳变）。
- 对话列：居中 `max-w-760px`（消息流 / 审批卡 / 输入台同列）。**宽度已拍板保持不动。**

## 圆角与线条

- 圆角档：sm 6 / md 10 / lg 14 / xl 18；无直角（spinner 环、滑杆 thumb 等控件几何除外）。
- 线条一律 1px：容器 `border + border-border-divider`；分隔 `border-t + divider`。
- 边线 = 墨色透明线在卡片底上的**精确预混合**（soft：9%→236 235 232、20%→213 212 208；
  dark 同法 10%/24%）。发现色差先查预混合公式，勿逐组件调。
- 禁用：`///` 装饰串、uppercase 大写间距、mono 标签（代码/命令行/kbd 除外）、2px 边框
  （spinner 环 / checkbox 方块 / toggle 轨道 / 滑杆 / 品牌几何合法保留）。

## 色彩语义（token 唯一真相源，禁止字面量色）

- 品牌黄 `--accent-brand #f2c00f`（双主题同值，品牌资产不随明暗漂移；蓝本原值
  `#eab308` 偏深，实机拍板保留 450 亮档——**唯一有意偏离蓝本的色彩决策**）。
  黄底文字一律 `accent-ink`（与主色成对定义），禁止用 content-primary 顶替。
- 中性按钮 hover = 边框加深 + surface-tint，**不得黄染**；阴影禁止用 accent-brand。
- 辅色（专家识别三色系）：雾蓝 / 鼠尾草 / 陶土，与 `lib/expertIdentity` 受控色板同源；
  accent-info/success/destructive 复用同组——「身份色 = 状态色」全站一致。
- 功能色两档：点/底纹用 `accent-*`，小字/图标用 `status-*`（文字级加深保对比）。
- 状态四色胶囊：success 鼠尾草绿 / warning 琥珀 / destructive 红 / info 雾蓝，
  一律 12% 透明底 + 实色文字；**危险才用红**。
- 选中底 `surface-tint`（暖调浅底，非灰）。
- 遮罩统一 `surface-scrim` + `/45`，全站弹窗/抽屉/移动端归一。
- muted 文字必须过 AA 4.5:1（2026-09-14 起为 `#746d5f`）；禁用字走 `content-disabled`，不借用 muted。

## 组件语法字典

- 按钮：主 = 黄胶囊；次 = 描边胶囊（hover 边框加深）；危险 = 红胶囊。统一走 Button kit。
- 搜索：唯一组件 `SearchInput`（胶囊 + 前置图标；compact 变体用于窄栏）。
- 开关：`PillSwitch`（34×19 轨道，开 = 品牌黄）。
- 徽章/chip：`rounded-full + px-2 + 12% 底`；运行状态用 `RunStatusBadge`。
- 弹窗：`ModalShell`（Portal + 遮罩 + 焦点陷阱 + Esc）+ **锁头三段**——
  header/footer `shrink-0` 固定，仅正文区滚动（长内容不得把按钮顶出首屏）。
- 通知：`Toaster` 全局单系统（成功绿勾/失败红叹号）；**禁止页面级本地 toast**。
- 空态：圆形图标底 + 主文案 + 副引导；列表空态用虚线卡。**空态三分口径**：
  还没有内容（EmptyState）≠ 搜不到（SearchX）≠ 打不开（FileQuestion 态 + 重试/回工作台）。
- 产物动作二分：**文件 = 下载**（扩展名按 language 细分），**文档 = 导出 PDF**（打印流）；
  同一份数据不提供两个入口。
- 产物类型色 / 图标 / 能力位（可编辑/可导出/扩展名）：单一真相源 `lib/artifactPresentation`。
- 滚动条：全局 5px / 18% 透明（hover 40%）。

## 位置规范

- 搜索住**标题行右槽**（w-64/w-72），禁全宽浮动条。
- 标题行右槽基准高度 h-9：右槽内容可为搜索/计数/徽章，标题自身占 `h-9 items-end`
  盒——标题垂直位置与右槽高度解耦（跨页切换不跳动；border-box 下只靠行的
  min-h 兜不住，实测踩过）。
- 列表型管理面：卡片栅格 / 行卡 + 点卡推入编辑视图；**禁主从双栏**。
- 正文标题必须跟随子菜单分区名。

## 字体与字号

- 正文 13.5px/1.75；气泡 1.65；数字/ID `font-display`（Space Grotesk）；代码/命令 `font-mono`。
- 字号档：nano 9 / micro 10 / tiny 11 / 11.5 辅助 / 13.5 正文 / 17 页题 / 19 统计大数。
  **禁止 `text-[Npx]` 任意值**（见 DESIGN.md §3）。
- 字体栈走系统 fallback（Geist + system-ui）；CJK 专用字体（Noto Sans SC）已试验并
  **否决**（加载成本）；未来要中文质感 = 全部字体自托管进镜像。
- 层级靠字号字重，不靠色带/tint bar：面板头 14 bold > 组头 12 semibold > 步骤 12 regular。

## 交互态语言

- **hover**：边框加深一档；可浮起件 -1px 上浮 + 卡片阴影；列表行 tint/60 浅染，不浮起。
- **active**：浮起件回位 + 阴影清零（按下的物理反馈）。
- **选中**：surface-tint 底；图标栏 3px 圆角品牌黄左条；分段胶囊选中加粗。
- **聚焦**：输入 border-focus；全局 focus-visible 2px accent 描边。
- **光晕**：品牌黄 accent 光晕仅两处——输入台聚焦、主按钮 hover；右缘琥珀光晕
  专属「待裁决」，不挪作他用。
- **危险**：唯一红色语义；破坏性小按钮 hover 才浮现（opacity 预留空间防抖动）。
- 动效：fast 100ms / normal 200ms；禁用 >2px 位移的装饰动画（顶栏 logo 除外）；
  尊重 prefers-reduced-motion。

## 品牌图形（禁则）

- 唯一品牌图形 = **卡片进口袋**（The4DPocketLogo：黄卡落进蓝口袋，下落+回弹动画）。
  slogan：*Initial minds, one pouch*；字标 `[XPOUCH]`（括号墨色、X 品牌黄）。
- **禁止**自创圆角块/几何底充当品牌标记（黄底块已全站清除过一轮，勿再犯）；
  黄色块仅作为卡片元素存在于 logo 内。
- 品牌位：顶栏（0.52 缩放 + 字标）、登录弹窗（原尺寸）、聊天空态（原尺寸）、
  加载占位（0.62 缩放，下落动画即加载指示）。

## 类名卫生

- 幽灵 token 黑名单（不存在的类名，写了静默失效）：`border-border-strong` /
  `border-border-dashed` / `text-content-tertiary` / `bg-panel` / `text-accent-primary` /
  `status-warning` / `accent-primary` / `surface-hover` / `shadow-soft` / `shadow-glow-accent` /
  `accent-foreground`（status-success 用 accent-success）。
- 新类名先查 `tailwind.config.ts` 是否存在；全站扫描器 `frontend/tools/scan-ghost-classes.mjs`
  （真值 = 构建 CSS，先 build 再跑）。

## 有意不抽象清单（防止过度抽象的反模式）

- `ModalShell` 不做头部/动作位插槽——两个主弹窗头部结构差异大，强行插槽成为配置项垃圾。
- SettingsHubDialog / DeleteConfirmDialog 等老弹窗不强迁 ModalShell（页面级壳/特化形态，
  迁移收益低）；**新弹窗一律 ModalShell**，旧的随触碰随迁移。
- 弹窗内 ghost/primary 胶囊按钮类名串不抽变体（各弹窗尺寸语义不同）；等真实第三处
  同规格出现再考虑。
- `components/brand/` 目录曾名 bauhaus，与已退役主题无关，仅为品牌组件所在。

## 快捷键

- ⌘K / Ctrl+K 命令面板（命令 + 会话模糊搜索）；G W/L/A/S 两段跳转。
