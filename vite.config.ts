/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 9897,
    strictPort: true,
    host: true,
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-simd-compat'],
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
});
