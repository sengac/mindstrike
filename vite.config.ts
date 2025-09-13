import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Handle SSE requests specifically
            if (req.url?.includes('/api/llm/model-updates') ||
                req.url?.includes('/api/message/stream') ||
                req.url?.includes('/api/local-llm/update-models-stream') ||
                req.url?.includes('/api/local-llm/download-progress-stream') ||
                req.url?.includes('/api/local-llm/models/') && req.url?.includes('/generate-stream')) {
              proxyReq.setHeader('Accept', 'text/event-stream');
              proxyReq.setHeader('Cache-Control', 'no-cache');
            }
          });
        }
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist/client'
  }
})
