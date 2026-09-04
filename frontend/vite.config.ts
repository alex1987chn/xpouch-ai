import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Tailwind v4 官方 Vite 插件（替代原 postcss + autoprefixer 链路）
    tailwindcss(),
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
  preview: {
    // index.html 不缓存：重新构建后，已打开的页面刷新即拿到新入口，
    // 避免旧入口引用已删除的旧哈希 chunk（懒加载路由 404）
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
    },
  },
  build: {
    // 🔥 细致的代码分割配置，按类别分包
    // 注意：vite 8 (rolldown) 只支持函数形式的 manualChunks
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined

          const vendorChunks: Record<string, string[]> = {
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
            'markdown': ['react-markdown', 'remark-gfm', 'rehype-katex', 'katex'],
            // 状态管理
            'state': ['zustand', 'immer', '@tanstack/react-query'],
            // 工具库
            'utils': ['date-fns', 'clsx', 'class-variance-authority', 'tailwind-merge'],
            // 图表可视化 (Mermaid) - 延迟加载
            'mermaid': ['mermaid'],
            // 代码高亮 - 延迟加载
            'prism': ['prism-react-renderer'],
            // ⚠️ PDF 库已改为动态导入，不再打包到主 bundle
          }

          // pnpm 的两種存储路径都需要匹配：
          // node_modules/<pkg>/... 与 node_modules/.pnpm/<pkg 中 / 换成 +>@版本/...
          const matchPkg = (pkg: string): boolean =>
            id.includes(`node_modules/${pkg}/`) ||
            id.includes(`node_modules/.pnpm/${pkg.replace(/\//g, '+')}@`)

          for (const [chunk, pkgs] of Object.entries(vendorChunks)) {
            if (pkgs.some(matchPkg)) return chunk
          }
          return undefined
        },
      },
    },
    // 🔥 启用 Terser 压缩，移除 console 和 debugger
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      format: {
        comments: false,
      },
    },
    // 块大小警告限制 (KB) - 提高到 600KB，因为 PDF/Mermaid  chunk 本身就大
    chunkSizeWarningLimit: 600,
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
