import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: '../www', emptyOutDir: true, chunkSizeWarningLimit: 1500, target: 'es2020' },
});
