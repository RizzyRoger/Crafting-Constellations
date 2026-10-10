import { defineConfig } from 'vitest/config'

// Runs inside `firebase emulators:exec` with Auth, Firestore, Functions and Storage (see npm run test:e2e)
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
