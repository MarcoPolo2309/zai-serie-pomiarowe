import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://zai:zai@localhost:55432/zai_test',
      ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'test-password', LOG_LEVEL: 'silent', FORCE_HTTPS: 'false' },
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
