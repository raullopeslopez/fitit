import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy /api → the backend so the browser hits one origin. In docker compose the
// target is the `backend` service; on the host it's localhost:8000.
const apiTarget = process.env.VITE_API_PROXY || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
