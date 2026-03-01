import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 🔥 Bundle 分析器 - 运行 pnpm build:analyze 生成报告
    visualizer({
      open: false,           // 构建后不自动打开浏览器
      gzipSize: true,        // 显示 gzip 压缩后大小
      brotliSize: true,      // 显示 brotli 压缩后大小
      filename: 'dist/stats.html',  // 输出文件位置
    }) as any,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // 🔥 细致的代码分割配置，按类别分包
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心生态
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // UI 动画和图标
          'ui-vendor': ['framer-motion', 'lucide-react'],
          // Radix UI 组件库
          'radix-ui': [
            '@radix-ui/react-avatar',
            '@radix-ui/react-dialog',
            '@radix-ui/react-label',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
          ],
          // 图表库
          'charts': ['recharts'],
          // Markdown 渲染相关
          'markdown': [
            'react-markdown',
            'remark-gfm',
            'rehype-highlight',
            'rehype-katex',
            'katex',
          ],
          // 状态管理
          'state': ['zustand', 'immer', '@tanstack/react-query'],
          // 工具库
          'utils': ['date-fns', 'uuid', 'clsx', 'class-variance-authority', 'tailwind-merge'],
          // 图表可视化 (Mermaid)
          'mermaid': ['mermaid'],
          // PDF 生成相关
          'pdf': ['jspdf', 'html2canvas'],
          // 代码高亮
          'prism': ['prism-react-renderer', 'prismjs'],
          // 监控
          'sentry': ['@sentry/react'],
        },
      },
    },
    // 块大小警告限制 (KB)
    chunkSizeWarningLimit: 500,
    // 清理旧的构建文件
    emptyOutDir: true,
    // 源映射（生产调试用）
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[Vite Proxy] Request:', req.method, req.url, '->', options.target + req.url)
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[Vite Proxy] Response:', proxyRes.statusCode, req.url)
          })
          proxy.on('error', (err, req, res) => {
            console.error('[Vite Proxy] Error:', err.message)
          })
        }
      },
      '/health': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
