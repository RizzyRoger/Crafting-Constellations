import { defineConfig } from 'vitest/config'

// Runs inside `firebase emulators:exec` (see npm run test:rules)
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
