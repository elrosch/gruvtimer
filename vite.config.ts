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
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'] },
} as never)
