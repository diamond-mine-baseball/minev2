import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
  port: 3000,
  host: '0.0.0.0',   // ← add this
  proxy: {
    '/api': {
      target: 'http://localhost:5001',
      rewrite: path => path.replace(/^\/api/, ''),
    },
  },
},
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
  },
  optimizeDeps: {
    esbuildOptions: { loader: { '.js': 'jsx' } },
  },
})
