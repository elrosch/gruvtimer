import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  // relative paths so the build also works inside the Capacitor webview
  base: './',
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['cubing'] },
  // cubing.js runs its scramble search in a module worker that loads cubing's own chunks. By
  // default those chunks import Vite's dynamic-import helper from the main bundle (booting the
  // whole app inside the worker) and the helper adds <link rel=modulepreload> tags via `document`;
  // both crash the worker ("document is not defined") and production builds get no scrambles.
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // the helper in its own chunk, so cubing's chunks never import the main bundle
        manualChunks: (id: string) => (id.includes('vite/preload-helper') ? 'preload-helper' : undefined),
      },
    },
    // no preload lists, so the helper never touches `document` inside the worker
    modulePreload: false,
  },
  test: { include: ['src/**/*.test.ts'] },
} as never)
