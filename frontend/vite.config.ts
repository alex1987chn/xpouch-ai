import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import fs from 'fs'
import path from 'path'

/**
 * 应用版本号的唯一真相源是 `backend/pyproject.toml`——Python 侧由 utils/version.py
 * 读同一个文件，前端在构建期读一次注入 `__APP_VERSION__`（声明见 src/vite-env.d.ts）。
 * 由此"发版只改 pyproject 一处"，两端展示面自动跟随；此前的做法是两端各写一份字面量，
 * 连续两个版本漏改。
 *
 * 不用 `import.meta.url` 定位：Vite 会把本配置文件打包到临时目录再执行，
 * 打包后的 import.meta.url 指向临时文件而不是 frontend/。改为从 cwd 向上找
 * （本地 cwd=frontend、容器内 cwd=/app/frontend，都在仓库/镜像的 frontend 层）。
 */
function readAppVersion(): string {
  let dir = process.cwd()
  for (let i = 0; i < 3; i += 1) {
    const pyproject = path.join(dir, 'backend', 'pyproject.toml')
    if (fs.existsSync(pyproject)) {
      // 取顶层 version 行（[project] 的那条）：行首无缩进即为顶层键，
      // 表内的 version 都带缩进或属于别的键名，不会误匹配。
      const line = fs
        .readFileSync(pyproject, 'utf8')
        .split('\n')
        .find(candidate => candidate.startsWith('version'))
      const value = line?.split('"')[1]
      if (value) return value
      throw new Error('[version] pyproject.toml 里找不到顶层 version 行，构建中止')
    }
    dir = path.dirname(dir)
  }
  // 宁可构建失败，也不要注入 undefined 让界面显示 "vundefined"
  throw new Error('找不到 backend/pyproject.toml（版本号唯一真相源），构建中止')
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion()),
  },
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
  // P4-0: 前端测试基建（vitest 接通孤儿测试）
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    exclude: ['src/test/**', 'node_modules/**', 'dist/**'],
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
            // 图标库
            'ui-vendor': ['lucide-react'],
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
      },
      // 产物分享页（B2）：后端 SSR 路由 GET /s/{token}，若不加代理会被 SPA 回退截胡跳首页。
      // ⚠️ 必须用正则 '^/s/'，不能用字面量 '/s'——Vite 的代理 key 是**路径前缀**匹配，
      // 字面量 '/s' 会把所有以 /s 开头的路径一起转发到后端，包括 /src/**（整个应用的
      // 源码模块），导致页面空白（模块请求被后端 404 吞掉）。
      '^/s/': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
