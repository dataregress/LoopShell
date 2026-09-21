import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tauri sets TAURI_ENV_PLATFORM while running `tauri dev` / `tauri build`.
const host = process.env.TAURI_DEV_HOST;
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const buildId = process.env.GITHUB_SHA?.slice(0, 7) ?? process.env.BUILD_ID ?? 'dev';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@contracts': fileURLToPath(new URL('./contracts', import.meta.url)),
    },
  },
  // Two HTML entries: `index.html` (panel window, and the browser harness) and
  // `anchor.html` (pill window). See docs/technology.md §5.1.
  build: {
    target: ['es2022', 'chrome117', 'safari16.4'],
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: fileURLToPath(new URL('./index.html', import.meta.url)),
        anchor: fileURLToPath(new URL('./anchor.html', import.meta.url)),
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/tools/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
});
