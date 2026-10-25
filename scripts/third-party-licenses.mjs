#!/usr/bin/env node
// Writes the license notices of every third-party package that ships with the app.
//
//   node scripts/third-party-licenses.mjs [out.txt]     (default: dist/THIRD_PARTY_LICENSES.txt)
//
// Runs after `vite build`, so the file is part of the web build, the Docker image and the APK.
// Covers all production npm dependencies (including transitive ones, from package-lock.json)
// plus @capacitor/android, whose native code is compiled into the APK.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'dist/THIRD_PARTY_LICENSES.txt'
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const EXTRA = ['node_modules/@capacitor/android']

const paths = Object.entries(lock.packages)
  .filter(([path, info]) => path.startsWith('node_modules/') && (!info.dev || EXTRA.includes(path)))
  .map(([path]) => path)

const repoUrl = repo => {
  const url = typeof repo === 'string' ? repo : repo?.url
  if (!url) return ''
  if (/^[\w-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`
  return url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '')
}

const seen = new Set()
const entries = []
for (const path of paths) {
  const pkgFile = join(path, 'package.json')
  if (!existsSync(pkgFile)) continue // optional dependency for another platform
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  const id = `${pkg.name}@${pkg.version}`
  if (seen.has(id)) continue
  seen.add(id)
  const licenseFile = readdirSync(path).find(f => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f))
  entries.push({
    id,
    license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'see source',
    source: repoUrl(pkg.repository) || pkg.homepage || `https://www.npmjs.com/package/${pkg.name}`,
    text: licenseFile ? readFileSync(join(path, licenseFile), 'utf8').trim() : '',
  })
}
entries.sort((a, b) => a.id.localeCompare(b.id))

const rule = '='.repeat(78)
const header = `gruvtimer – third-party software

gruvtimer is licensed under the GNU General Public License v3.0 or later (see LICENSE).
It includes the following third-party packages, each under its own license.
The source code of every package is available at the address listed with it.
The Android app also contains AndroidX and other Android support libraries
(Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0).
The colour palette follows Gruvbox by Pavel Pertsev (MIT, https://github.com/morhetz/gruvbox).

Packages: ${entries.length}
`
const body = entries.map(e =>
  `${rule}\n${e.id}\nLicense: ${e.license}\nSource:  ${e.source}\n${rule}\n\n${e.text || '(no license file in the package; see the source)'}\n`)

writeFileSync(out, [header, ...body].join('\n'))
console.log(`wrote ${entries.length} package notices to ${out}`)
