import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.cjs',
    };
  },
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  outDir: 'dist',
  minify: false,
  platform: 'node',
});
