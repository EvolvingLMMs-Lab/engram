import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60000,
    // Use forked processes to avoid SIGSEGV from native modules
    // (sqlite-vec + shamir WASM conflict in shared threads)
    pool: 'forks',
  },
});
