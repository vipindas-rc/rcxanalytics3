import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/analytics/',
  plugins: [react()],
  server: {
    host: process.env.REPLIT_DEV_DOMAIN ? '0.0.0.0' : '127.0.0.1',
    proxy: {
      '/api/analytics': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
        rewrite: requestPath => requestPath.replace(/^\/api\/analytics(?=\/|$)/, '/api'),
      },
    },
  },
})
