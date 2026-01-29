import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/memory/index.ts',
    'src/embedding/index.ts',
    'src/crypto/index.ts',
    'src/sync/index.ts',
    'src/secrets/index.ts',
    'src/indexing/index.ts',
    'src/llm/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: [
    'better-sqlite3',
    'sqlite-vec',
    'keytar',
    'onnxruntime-node',
    '@xenova/transformers',
  ],
});
