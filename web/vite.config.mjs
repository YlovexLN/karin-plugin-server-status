import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const webRoot = path.dirname(fileURLToPath(import.meta.url))
const apiTarget = process.env.KARIN_API || 'http://localhost:7777'

// https://vite.dev/config/
export default defineConfig({
  root: webRoot,
  base: '/server-status/assets/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(webRoot, 'src')
    }
  },
  server: {
    host: true,
    port: 5176,
    proxy: {
      '/server-status/v1': {
        target: apiTarget,
        changeOrigin: true
      },
      '/api/v1': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: path.join(webRoot, '..', 'web-dist'),
    emptyOutDir: true
  }
})
