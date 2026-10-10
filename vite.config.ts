import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Shared, Firebase-free moderation rules: authoritative in functions, advisory in the client
      '@moderation': fileURLToPath(new URL('./functions/src/moderation/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // Firebase and React change rarely; keep them cacheable apart from app code.
        // Analytics + Performance load only after someone agrees to be counted.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/app-check', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage'],
          telemetry: ['firebase/analytics', 'firebase/performance'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
