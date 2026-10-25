#!/usr/bin/env node
// Sanity checks on the production build that unit tests cannot catch.
//
//   node scripts/check-build.mjs [dist]
//
// cubing.js generates scrambles in a module worker started from its `search-worker-entry` chunk.
// That chunk (and what it loads) must not depend on the app's entry bundle and must not ask Vite's
// helper to preload anything – both touch `document` and crash the worker, so production builds
// silently get no scrambles (see the `build` section of vite.config.ts).

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] ?? 'dist'
const assets = join(dist, 'assets')
const files = readdirSync(assets)
const errors = []

const entry = readFileSync(join(dist, 'index.html'), 'utf8').match(/src="\.\/assets\/([^"]+\.js)"/)?.[1]
if (!entry) errors.push('could not find the entry script in index.html')

const workerEntry = files.find(f => /^search-worker-entry-.*\.js$/.test(f))
if (!workerEntry) errors.push('no search-worker-entry chunk in the build')

if (entry && workerEntry) {
  const code = readFileSync(join(assets, workerEntry), 'utf8')
  if (code.includes(`"./${entry}"`)) errors.push(`${workerEntry} imports the app entry ${entry}`)
  if (code.includes('__vite__mapDeps')) errors.push(`${workerEntry} preloads dependencies (needs \`document\`)`)
  const inside = code.match(/import\("\.\/(inside-[^"]+\.js)"\)/)?.[1]
  if (inside && readFileSync(join(assets, inside), 'utf8').includes(`"./${entry}"`)) {
    errors.push(`${inside} imports the app entry ${entry}`)
  }
}

if (errors.length) {
  console.error(`build check failed:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log(`build check ok (${workerEntry} is independent of ${entry})`)
