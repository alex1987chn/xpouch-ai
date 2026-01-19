# ArtifactRenderer 组件

## 概述
ArtifactRenderer 是一个中央调度器组件，用于渲染不同类型的内容，确保每种类型都有适当的样式和功能。

## 支持的内容类型

### 1. code - 语法高亮代码块
- **库**: react-syntax-highlighter
- **主题**: vscDarkPlus (深色高对比度主题)
- **功能**:
  - 复制按钮（右上角）
  - 语言标签（左上角）
  - 圆角容器 (rounded-lg)
  - 横向滚动支持

### 2. search - 双列信息卡片
- **布局**: 响应式网格 (grid-cols-1 → md:grid-cols-2 → lg:grid-cols-2)
- **卡片元素**:
  - Favicon (如果有)
  - 可点击标题（链接到来源）
  - 简短描述（带截断）
  - 来源URL（小号文本）
- **样式**: rounded-xl, bg-white/5, 边框, hover效果

### 3. report / markdown - 富文本文档
- **库**: react-markdown + remark-gfm (GitHub Flavored Markdown)
- **功能**:
  - 支持表格和任务列表 (GFM)
  - 自定义标题样式 (h1, h2, h3) - text-violet-400
  - 自定义链接样式 - text-blue-400, hover:underline
  - 自定义代码样式 - bg-gray-700 区分于正文
  - 自定义列表样式 - 清晰缩进和项目符号

### 4. html - 嵌入式Web内容
- **渲染**: `<iframe>` 元素
- **安全**: sandbox="allow-scripts allow-same-origin"
- **窗口模拟**: 浏览器窗口外观（三个点控制按钮、URL栏占位符）
- **容器**: rounded-xl, overflow-hidden

### 5. 未知类型（Fallback）
- 显示不支持的类型提示
- 图标: FileText (lucide-react)
- 容器: rounded-xl bg-gray-800/60

## 通用特性

### 动画
- 所有内容类型都使用 Framer Motion 的 spring 动画
- 入场: `initial={{ opacity: 0, y: 10 }}`
- 出场: `animate={{ opacity: 1, y: 0 }}`
- 过渡: `transition={{ type: 'spring', stiffness: 30, damping: 20 }}`

### 共享样式
- **外层容器**: rounded-xl, bg-gray-800/60, p-4/p-6
- **统一动画**: 柔和的入场效果
- **暗色主题**: 适配 XPouch 深蓝/紫色调

## 使用示例

```tsx
import ArtifactRenderer from '@/components/ArtifactRenderer'

// 在聊天消息中使用
{artifact.type && (
  <ArtifactRenderer
    type={artifact.type}
    content={artifact.content}
  />
)}
```

## 内容类型格式

### type: 'code'
```json
{
  "type": "code",
  "content": {
    "language": "typescript",
    "code": "const greeting = 'Hello World';"
  }
}
```

### type: 'search'
```json
{
  "type": "search",
  "content": {
    "results": [
      {
        "title": "搜索结果标题",
        "snippet": "搜索结果的简短描述...",
        "url": "https://example.com",
        "favicon": "https://example.com/favicon.ico"
      }
    ]
  }
}
```

### type: 'report' / 'markdown'
```json
{
  "type": "report",
  "content": "# 标题\n\n内容..."
}
```

### type: 'html'
```json
{
  "type": "html",
  "content": "<!DOCTYPE html>..."
}
```

## 依赖项

```json
{
  "react-syntax-highlighter": "^15.5.0",
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0",
  "@tailwindcss/typography": "^0.5.0"
}
```

## 注意事项

1. **安全性**: HTML 类型使用 sandbox iframe，确保内容可信
2. **响应式**: search 类型使用响应式网格布局
3. **可访问性**: 所有交互元素都有 hover 状态和适当的标签
4. **性能**: 使用 memo 或 useCallback 优化重复渲染
5. **主题**: 自动适配暗色模式（prose-invert）
