# React 19 优化检查清单

**检查日期**: 2026-02-11  
**React 版本**: 19.2.4

---

## ✅ 已正确实现的

| 检查项 | 状态 | 说明 |
|--------|------|------|
| useRef 初始值 | ✅ 全部正确 | 所有 useRef 都有初始值 |
| 废弃 API | ✅ 未发现 | 没有使用 ReactDOM.render 等废弃 API |
| Context 使用 | ✅ 正确 | createContext/useContext 使用正确 |
| 事件处理 | ✅ 现代方式 | 使用标准 React 事件 |

---

## 🔧 建议优化（按优先级排序）

### 高优先级 - 避免闪烁问题

#### 1. ChatStreamPanel 自动滚动改用 useLayoutEffect

**文件**: `components/chat/ChatStreamPanel/index.tsx:156`

**当前代码**:
```tsx
useEffect(() => {
  if (scrollRef.current) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }
}, [messages, isStreaming])
```

**优化后**:
```tsx
import { useLayoutEffect } from 'react'

// 使用 useLayoutEffect 避免滚动闪烁
useLayoutEffect(() => {
  if (scrollRef.current) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }
}, [messages, isStreaming])
```

#### 2. ThinkingProcess 滚动改用 useLayoutEffect

**文件**: `components/chat/ThinkingProcess/index.tsx:256`

**当前代码**:
```tsx
useEffect(() => {
  if (scrollContainerRef.current && isExpanded) {
    const container = scrollContainerRef.current
    container.scrollTop = container.scrollHeight
  }
}, [steps, isExpanded])
```

**优化后**:
```tsx
import { useLayoutEffect } from 'react'

useLayoutEffect(() => {
  if (scrollContainerRef.current && isExpanded) {
    const container = scrollContainerRef.current
    container.scrollTop = container.scrollHeight
  }
}, [steps, isExpanded])
```

---

### 中优先级 - 代码简化

#### 3. AppProvider 使用 React 19 Context 简化语法

**文件**: `providers/AppProvider.tsx`

**已完成 ✅** - 已在迁移时更新：
```tsx
// 旧语法
<AppContext.Provider value={contextValue}>

// React 19 新语法（已更新）
<AppContext value={contextValue}>
```

---

### 低优先级 - 可选优化

#### 4. forwardRef 迁移（44个组件）

React 19 支持 ref 作为普通 prop，可以逐步迁移。但现有代码兼容，**不迁移也可以**。

**示例迁移**（以 Button 为例）：

**当前代码** (React 18 方式):
```tsx
// components/ui/button.tsx
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
```

**React 19 新方式** (可选):
```tsx
// 新方式 - ref 作为普通 prop
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  ref?: React.Ref<HTMLButtonElement>
}

const Button = ({ className, variant, size, asChild = false, ref, ...props }: ButtonProps) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
}
```

**涉及的 44 个组件列表**:

**UI 组件** (在 `components/ui/` 目录):
- avatar.tsx - Avatar, AvatarImage, AvatarFallback
- button.tsx - Button
- bauhaus-button.tsx - BauhausButton
- bauhaus-input.tsx - BauhausInput, BauhausTextarea, BauhausLabel
- dialog.tsx - DialogOverlay, DialogContent, DialogContentCentered, DialogContentFullscreen, DialogContentPositioned, DialogContentBauhaus, DialogTitle, DialogDescription
- input.tsx - Input
- separator.tsx - Separator
- label.tsx - Label
- scroll-area.tsx - ScrollArea, ScrollBar
- card.tsx - Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- select.tsx - SelectTrigger, SelectScrollUpButton, SelectScrollDownButton, SelectContent, SelectLabel, SelectItem, SelectSeparator
- bauhaus-card.tsx - BauhausCard, BauhausCardHeader, BauhausCardTitle, BauhausCardDescription, BauhausCardContent, BauhausCardFooter
- switch.tsx - Switch
- textarea.tsx - Textarea
- toggle-group.tsx - ToggleGroup, ToggleGroupItem
- toggle.tsx - Toggle

**建议**: 这些组件都是 shadcn/ui 的组件，可以保持现状。等 shadcn/ui 官方迁移到 React 19 新语法后再跟随更新。

---

## 🚀 立即执行的优化

### 第一步：修复 useLayoutEffect 问题

创建修复脚本：

```typescript
// components/chat/ChatStreamPanel/index.tsx
// 将第 156 行的 useEffect 改为 useLayoutEffect

import { useLayoutEffect } from 'react'

// ... 其他代码

// 在组件内：
useLayoutEffect(() => {
  if (scrollRef.current) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }
}, [messages, isStreaming])
```

```typescript
// components/chat/ThinkingProcess/index.tsx
// 将第 256 行的 useEffect 改为 useLayoutEffect

import { useLayoutEffect } from 'react'

// ... 其他代码

// 在组件内：
useLayoutEffect(() => {
  if (scrollContainerRef.current && isExpanded) {
    const container = scrollContainerRef.current
    container.scrollTop = container.scrollHeight
  }
}, [steps, isExpanded])
```

---

## 📊 优化收益

| 优化项 | 收益 | 工作量 |
|--------|------|--------|
| useLayoutEffect 修复 | 消除滚动闪烁 | 5 分钟 |
| forwardRef 迁移 | 代码简化 | 2-3 小时 |
| Context 简化 | 已完成 ✅ | - |

---

## ⏱️ 建议执行顺序

1. **立即执行** (5 分钟): 修复两个 useLayoutEffect 问题
2. **等待官方更新**: forwardRef 迁移等 shadcn/ui 官方更新后再跟进

---

## 🔗 参考

- [React 19 useLayoutEffect](https://react.dev/reference/react/useLayoutEffect)
- [React 19 ref as prop](https://react.dev/blog/2024/12/05/react-19#ref-as-a-prop)
