# XPouch AI 主题系统最佳实践

> **v3.5.1 现状**：主题枚举为 **soft（柔和·默认）/ dark（黑暗）** 双主题，bauhaus 等历史主题已退役
> （存量 localStorage 值由 themeStore 迁移映射自动归入 soft）。本文的 token 机制说明仍然有效；
> 主题相关的视觉规范以 [DESIGN.md](./DESIGN.md) 为准。

## 架构概览

```
主题变量 (CSS Custom Properties)
    ↓
语义化工具类 (Tailwind)
    ↓
主题感知组件 (使用语义化类名)
    ↓
业务页面 (使用组件，不直接写样式)
```

---

## 1. 主题文件结构

```
frontend/src/styles/tokens/
├── _semantic.css          # 颜色、字体、圆角基础变量（:root 即 soft 主题值）
├── _layout.css            # 阴影、边框宽度、变换效果变量（双主题共用）
└── themes/
    └── _dark.css          # Dark 主题（仅覆盖颜色变量，材质继承 :root）
```

---

## 2. 如何添加新主题

### 步骤 1: 创建主题文件

```css
/* frontend/src/styles/tokens/themes/_neon.css */

[data-theme="neon"] {
    /* ========== 颜色 ========== */
    --surface-page: 10 10 20;
    --surface-card: 20 20 40;
    --surface-elevated: 30 30 60;

    --content-primary: 255 255 255;
    --content-secondary: 180 180 200;
    --content-muted: 120 120 150;

    --border-default: 255 0 255;      /* 洋红边框 */
    --border-hover: 255 100 255;
    --border-focus: 255 0 255;

    --accent-brand: 255 0 255;        /* 洋红强调 */
    --accent-hover: 255 100 255;

    --shadow-color: 255 0 255;
    --shadow-opacity: 0.3;

    /* ========== 字体 ========== */
    --font-sans: 'Inter', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;

    /* ========== 圆角 ========== */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;

    /* ========== 边框宽度 ========== */
    --border-width-thin: 1px;
    --border-width-thick: 2px;
    --border-width-card: 1px;         /* 细边框 */
    --border-width-button: 1px;
    --border-width-input: 1px;

    /* ========== 阴影 ========== */
    --shadow-card: 0 0 20px rgb(255 0 255 / 0.2);
    --shadow-card-hover: 0 0 40px rgb(255 0 255 / 0.4);
    --shadow-card-accent: 0 0 60px rgb(255 0 255 / 0.5);

    --shadow-button-sm: 0 0 10px rgb(255 0 255 / 0.15);
    --shadow-button: 0 0 15px rgb(255 0 255 / 0.2);
    --shadow-button-lg: 0 0 25px rgb(255 0 255 / 0.3);
    --shadow-button-sm-hover: 0 0 15px rgb(255 0 255 / 0.25);
    --shadow-button-hover: 0 0 25px rgb(255 0 255 / 0.35);
    --shadow-button-lg-hover: 0 0 40px rgb(255 0 255 / 0.5);
    --shadow-button-active: inset 0 0 10px rgb(255 0 255 / 0.2);

    --shadow-dropdown: 0 10px 40px rgb(255 0 255 / 0.2);
    --shadow-modal: 0 20px 60px rgb(255 0 255 / 0.3);
    --shadow-input: inset 0 0 5px rgb(255 0 255 / 0.1);
    --shadow-focus: 0 0 0 3px rgb(255 0 255 / 0.3);

    /* ========== 变换 ========== */
    --transform-card-hover: translateY(-4px);
    --transform-button-sm-hover: translateY(-2px);
    --transform-button-hover: translateY(-3px);
    --transform-button-lg-hover: translateY(-4px);
    --transform-button-active: translateY(0);
}
```

### 步骤 2: 注册主题

```ts
// frontend/src/store/themeStore.ts

export const THEMES: ThemeMeta[] = [
  { id: 'soft', name: 'Soft', description: '柔和亮色 - 暖中性、漫射阴影、细边框', icon: 'Sun' },
  { id: 'dark', name: 'Dark', description: '暖暗色 - 暖炭黑基底，夜间护眼', icon: 'Moon' },
  { id: 'neon', name: 'Neon', description: '赛博霓虹', icon: 'Zap' },  // ← 新增
]
```

### 步骤 3: 导入 CSS

```css
/* frontend/src/index.css */
@import './styles/tokens/themes/_neon.css';
```

**完成！不需要写任何 compat 覆盖（如果所有组件都已语义化）。**

---

## 3. 组件开发规范

### ❌ 错误写法（硬编码具体风格）

```tsx
// ❌ 不要把具体样式写死在组件里
<button className="border-2 shadow-hard-5 hover:-translate-x-1 hover:-translate-y-1" />
```

### ✅ 正确写法（使用语义化类名）

```tsx
// ✅ 使用语义化工具类
<button
  className="
    border-2 border-border-default
    shadow-theme-button
    hover:[transform:var(--transform-button-hover)]
    hover:shadow-theme-button-hover
  "
/>
```

### ✅ 推荐写法（使用封装组件）

```tsx
// components/ui/button.tsx
import { cva } from 'class-variance-authority'

const buttonVariants = cva(
  "inline-flex items-center justify-center transition-all",
  {
    variants: {
      variant: {
        default: [
          "bg-surface-card border-2 border-border-default text-content-primary",
          "shadow-theme-button",
          "hover:[transform:var(--transform-button-hover)]",
          "hover:shadow-theme-button-hover",
          "active:[transform:var(--transform-button-active)]",
          "active:shadow-theme-button-active",
        ],
        primary: [
          "bg-accent text-content-inverted border-2 border-border-focus",
          "shadow-theme-button-lg",
          "hover:[transform:var(--transform-button-lg-hover)]",
          "hover:shadow-theme-button-lg-hover",
        ],
      },
    },
  }
)
```

---

## 4. 完整的主题变量清单

### 颜色变量
```css
--surface-page, --surface-card, --surface-elevated, --surface-input
--content-primary, --content-secondary, --content-muted, --content-inverted
--border-default, --border-hover, --border-focus, --border-divider
--accent-brand, --accent-hover, --accent-active, --accent-subtle
--shadow-color, --shadow-opacity
```

### 字体变量
```css
--font-sans: 'Geist', system-ui, sans-serif;  /* 正文 */
--font-mono: 'Space Mono', monospace;         /* 等宽（编号、代码、状态胶囊） */
```

### 圆角变量
```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-xl: 18px;
--radius-none: 0;
--radius-full: 9999px;
```

### 边框宽度变量
```css
/* 柔和材质体系下全部为 1px；改用变量的意义是拿回集中管控权，
   需要时只改 token 即可全站生效（不要在组件里写 border-2） */
--border-width-thin: 1px;
--border-width-thick: 1px;
--border-width-card: 1px;
--border-width-button: 1px;
--border-width-input: 1px;
```

### 阴影变量（细化层级）

```css
/* 卡片阴影 */
--shadow-card
--shadow-card-hover
--shadow-card-accent

/* 按钮阴影 - 三级层次 */
--shadow-button-sm         /* 小按钮 */
--shadow-button            /* 普通按钮 */
--shadow-button-lg         /* 重要按钮 */

/* 按钮 hover 阴影 */
--shadow-button-sm-hover
--shadow-button-hover
--shadow-button-lg-hover   /* 通常带强调色 */

/* 按钮 active 阴影 */
--shadow-button-active

/* 其他 */
--shadow-dropdown
--shadow-modal
--shadow-input
--shadow-focus
```

### 变换变量（细化层级）

```css
--transform-card-hover: translate(-4px, -4px) | translateY(-2px) | translateY(-0.5px);

/* 按钮位移 - 三级层次 */
--transform-button-sm-hover: translate(-1px, -1px) | translateY(-1px) | translateY(-0.5px);
--transform-button-hover: translate(-2px, -2px) | translateY(-1px) | translateY(-0.5px);
--transform-button-lg-hover: translate(-3px, -3px) | translateY(-2px) | translateY(-1px);

--transform-button-active: translate(2px, 2px) | translateY(0) | translateY(0.5px);
```

---

## 5. Tailwind 语义化工具类

在 `tailwind.config.ts` 中已配置：

```js
boxShadow: {
  // 卡片
  'theme-card': 'var(--shadow-card)',
  'theme-card-hover': 'var(--shadow-card-hover)',
  'theme-card-accent': 'var(--shadow-card-accent)',

  // 按钮 - 三级层次
  'theme-button-sm': 'var(--shadow-button-sm)',
  'theme-button': 'var(--shadow-button)',
  'theme-button-lg': 'var(--shadow-button-lg)',
  'theme-button-sm-hover': 'var(--shadow-button-sm-hover)',
  'theme-button-hover': 'var(--shadow-button-hover)',
  'theme-button-lg-hover': 'var(--shadow-button-lg-hover)',
  'theme-button-active': 'var(--shadow-button-active)',

  // 其他
  'theme-dropdown': 'var(--shadow-dropdown)',
  'theme-modal': 'var(--shadow-modal)',
  'theme-input': 'var(--shadow-input)',
  'theme-focus': 'var(--shadow-focus)',
}
```

---

## 6. 主题风格指南

| 风格 | 边框 | 阴影 | 位移 | 字体 |
|-----|------|------|------|------|
| **Soft**（默认，`:root`） | 1px 细边 | 漫射浅阴影 1-3px | 微浮动 0.5-1px | Geist 无衬线 |
| **Dark** | 1px 细边（预混合亮色线） | 深黑系阴影、对比加强 | 微浮动 0.5-1px | Geist 无衬线 |

> 材质（边框宽度、阴影、位移）双主题共用同一套值，只换颜色；历史风格
> Bauhaus / Glass / Kyoto 及其 compat 覆盖文件均已退役（v3.5.1）。

---

## 7. 快速检查清单

添加新组件前检查：

- [ ] 边框宽度用语义类（`border-theme-card` / `border-theme-button` / `border-theme-input`），
      颜色用 `border-border-default` / `border-border-divider`——**不要写 `border-2` 等字面量**
- [ ] 阴影使用 `shadow-theme-*` 系列
- [ ] 位移使用 `-translate-y-px`（或 `[transform:var(--transform-*)]`）
- [ ] 没有硬编码的 `shadow-hard`, `border-2 border-black` 等
- [ ] 圆角用 `rounded-md` / `rounded-lg` 等 token 类，不写 `rounded-[14px]`

---

## 8. 常见问题

### Q: 边框到底该用哪套类名？
A: 分两件事——
- **宽度**走语义类：`border-theme-card`（卡片/面板/模态）、`border-theme-button`（按钮）、`border-theme-input`（输入类控件），
  它们指向 `--border-width-*`（柔和体系下都是 1px），改 token 即全站生效
- **颜色**走 `border-border-default`（静止）/ `border-border-hover`（悬停）/ `border-border-focus`（聚焦）/ `border-border-divider`（分隔线）

不要写 `border-2`：那会绕过 token，主题一改就漏网（历史 Bauhaus 的 2px 风格即由此而来）。

### Q: 细化的阴影层级有什么用？
A: 提供视觉层次感：
- 小按钮用 `shadow-button-sm`
- 普通按钮用 `shadow-button`
- 重要操作（保存、提交）用 `shadow-button-lg`

### Q: 新主题需要写 compat 文件吗？
A: 不需要。compat 覆盖是历史遗留的过渡方案（Bauhaus/Glass/Kyoto 时期），已随那些主题一并删除。
新组件都应该使用语义化类名，新主题只需定义 CSS 变量 + 在 `themeStore` 注册元数据即可。

### Q: 如何调试主题变量？
A: 在浏览器 DevTools 中：
1. 选中元素
2. 查看 Computed → 搜索 `--`
3. 在 Console 输入 `getComputedStyle(document.documentElement).getPropertyValue('--shadow-card')`
