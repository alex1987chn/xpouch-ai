# React Compiler 配置指南

## 什么是 React Compiler？

React Compiler 是 React 19 的实验性功能，可以**自动优化组件重渲染**，无需手动写 `useMemo`/`useCallback`。

## 工作原理

```tsx
// 优化前 - 需要手动记忆化
const memoizedValue = useMemo(() => computeExpensiveValue(a, b), [a, b]);
const handleClick = useCallback(() => doSomething(a), [a]);

// 优化后 - React Compiler 自动生成等效代码
const value = computeExpensiveValue(a, b);  // 自动记忆化
const handleClick = () => doSomething(a);   // 自动记忆化
```

## 当前项目状态

### 已完成的优化
- ✅ 类型安全改进 (TypeScript any 清理)
- ✅ 乐观更新 (useOptimistic)
- ✅ MCP 工具缓存
- ✅ Suspense 查询模式

### React Compiler 启用步骤

#### 1. 安装依赖

```bash
cd frontend
npm install -D @react-compiler/babel-plugin
# 或
pnpm add -D @react-compiler/babel-plugin
```

#### 2. 配置 Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['@react-compiler/babel-plugin', {
            // 编译器选项
            target: '19',  // React 19
            mode: 'infer', // 自动推断可优化组件
          }]
        ]
      }
    })
  ]
})
```

#### 3. 配置 ESLint (可选)

```javascript
// .eslintrc.cjs
module.exports = {
  plugins: ['react-compiler'],
  rules: {
    'react-compiler/react-compiler': 'error',
  },
}
```

#### 4. 验证编译器工作

添加注释标记需要优化的组件：

```tsx
// 'use memo' 指令告诉编译器优化此组件
'use memo'

function ExpensiveComponent({ data }) {
  // 自动优化：无需 useMemo
  const processed = data.map(item => heavyCompute(item))
  
  // 自动优化：无需 useCallback
  const handleClick = () => doSomething(data)
  
  return <div onClick={handleClick}>{processed}</div>
}
```

## 优化效果预期

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| TaskStore 高频更新 | 多次重渲染 | 自动批处理 |
| 消息列表渲染 | 全列表更新 | 自动 diff |
| Event 处理 | 创建新函数 | 自动记忆化 |

## 注意事项

### 1. 实验性状态
- React Compiler 目前处于 Beta 阶段
- 生产环境使用需谨慎测试

### 2. 不兼容模式
以下写法编译器无法优化：

```tsx
// ❌ 无法优化
const value = useMemo(() => {
  return condition ? a : b  // 条件依赖
}, condition ? [a] : [b])

// ✅ 可以优化
const value = condition ? useMemo(() => a, [a]) : useMemo(() => b, [b])
```

### 3. 调试

```bash
# 查看编译器输出
DEBUG=react-compiler:* npm run build
```

## 建议

1. **现阶段**: 先完成 P0/P1/P2 修复，确保稳定性
2. **测试阶段**: 在开发环境启用 Compiler，观察是否有问题
3. **生产部署**: 等待 React Compiler 正式发布（预计 2025 Q2）

## 参考

- [React Compiler 官方文档](https://react.dev/learn/react-compiler)
- [React 19 新特性](https://react.dev/blog/2024/12/05/react-19)
