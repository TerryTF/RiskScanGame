import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

const backend = process.env.RISKSCAN_BACKEND_URL ?? 'http://127.0.0.1:8000';
const proxy = { '/api': backend, '/health': backend };

// Vite deletes and recreates its dependency cache. In a OneDrive folder macOS then renames the new folder to "deps 2",
// every pre-bundled file answers 504 "Outdated Optimize Dep" and the page stays blank. Keep the cache out of the project.
const cacheDir = join(tmpdir(), `riskscan-vite-${createHash('sha1').update(import.meta.dirname).digest('hex').slice(0, 8)}`);

export default defineConfig({
  cacheDir,
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    exclude: [...configDefaults.exclude],
  },
});
