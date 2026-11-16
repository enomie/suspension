/// <reference types="vitest/config" />
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

/** COEP `require-corp`: Vite serves many module chunks — without CORP the browser blocks worker imports (hung startup). */
function crossOriginResourcePolicy(): Plugin {
  const use = (_req: unknown, res: { setHeader: (n: string, v: string) => void }, next: () => void) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  };
  return {
    name: 'cross-origin-resource-policy',
    configureServer(server) {
      server.middlewares.use(use);
    },
    configurePreviewServer(server) {
      server.middlewares.use(use);
    },
  };
}

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const;

export default defineConfig({
  base: './',
  plugins: [crossOriginResourcePolicy()],
  server: {
    port: 9897,
    strictPort: true,
    host: true,
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-simd-compat'],
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
});
