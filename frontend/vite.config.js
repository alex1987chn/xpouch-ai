import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3002', // Try localhost instead of 127.0.0.1
                changeOrigin: true,
                secure: false,
                rewrite: function (path) { return path; }
            },
            '/health': {
                target: 'http://localhost:3002',
                changeOrigin: true,
                secure: false
            }
        }
    }
});
