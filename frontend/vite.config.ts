import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // 🔥 减少代码分割，避免动态导入问题
    rollupOptions: {
      output: {
        // 将 node_modules 打包成一个 vendor chunk
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', 'lucide-react', '@radix-ui/react-dialog'],
        },
      },
    },
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
