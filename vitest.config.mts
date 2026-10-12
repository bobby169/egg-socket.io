import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/test/fixtures/**'],
    // 每个用例都会 fork 一个真实的 egg cluster（多进程 + 真实端口），启动较慢。
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'app/**', 'config/**', 'app.js'],
    },
  },
});
