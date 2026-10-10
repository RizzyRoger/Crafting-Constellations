import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@moderation': fileURLToPath(new URL('./functions/src/moderation/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'functions/src/**/*.test.ts'],
    environment: 'node',
  },
})
