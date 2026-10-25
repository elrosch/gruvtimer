#!/usr/bin/env node
// Converts a csTimer export (.txt / .json) into gruvtimer's solves.json.
//
//   node scripts/import-cstimer.mjs <cstimer-export.txt> [out.json]
//
// csTimer stores each solve as [[penalty, time, ...splits], scramble, unixSeconds, comment]
// with penalty 0 = ok, 2000 = +2, -1 = DNF. Every csTimer session becomes a puzzle + category,
// derived from the session name ("3x3x3 OH" -> puzzle 333, category OH) or its scrType option.
// Solve ids are derived from session/index/timestamp, so re-importing the same export is a no-op.

import { readFileSync, writeFileSync } from 'node:fs'

const [input, output = 'solves.json'] = process.argv.slice(2)
if (!input) {
  console.error('usage: node scripts/import-cstimer.mjs <cstimer-export.txt> [out.json]')
  process.exit(1)
}

const data = JSON.parse(readFileSync(input, 'utf8'))
const props = data.properties ?? {}
const sessionData = typeof props.sessionData === 'string' ? JSON.parse(props.sessionData) : props.sessionData ?? {}

const NAME_RULES = [
  [/2x2|222/i, '222'], [/3x3|333/i, '333'], [/4x4|444/i, '444'], [/5x5|555/i, '555'],
  [/6x6|666/i, '666'], [/7x7|777/i, '777'], [/clock/i, 'clock'], [/pyra/i, 'pyram'], // before minx: "Pyraminx" contains "minx"
  [/mega|minx/i, 'minx'], [/skewb/i, 'skewb'], [/sq(uare)?[- ]?1/i, 'sq1'],
]
// csTimer scrType prefixes -> gruvtimer puzzle
const SCRTYPE_RULES = [
  [/^222/, '222'], [/^333/, '333'], [/^444/, '444'], [/^555/, '555'], [/^666/, '666'], [/^777/, '777'],
  [/^clk/, 'clock'], [/^mgm|^minx/, 'minx'], [/^pyr/, 'pyram'], [/^skb/, 'skewb'], [/^sq/, 'sq1'],
]

function classify(name, scrType) {
  const rule = NAME_RULES.find(([re]) => re.test(name))
  const puzzle = rule?.[1] ?? SCRTYPE_RULES.find(([re]) => re.test(scrType ?? ''))?.[1]
  if (!puzzle) return null
  // whatever is left of the name after the puzzle part becomes the category ("3x3x3 OH" -> "OH")
  const rest = rule ? name.replace(/\b\d+x\d+(x\d+)?\b|\bmegaminx\b|\bpyraminx\b|\bskewb\b|\bclock\b|\bsquare[- ]?1\b|\bsq[- ]?1\b/gi, '').trim() : ''
  let category = rest || 'Normal'
  if (scrType && /oh$/i.test(scrType) && category === 'Normal') category = 'OH'
  if (scrType && /ni$|bld/i.test(scrType) && category === 'Normal') category = 'BLD'
  return { puzzle, category }
}

const categories = {}
const solves = []
const skipped = []

for (const key of Object.keys(data).filter(k => /^session\d+$/.test(k))) {
  const n = key.slice('session'.length)
  const meta = sessionData[n] ?? {}
  const name = String(meta.name ?? n)
  const target = classify(name, meta.opt?.scrType)
  if (!target) {
    skipped.push(`${key} "${name}" (${data[key].length} solves): unknown puzzle`)
    continue
  }
  const list = (categories[target.puzzle] ??= ['Normal'])
  if (!list.includes(target.category)) list.push(target.category)

  data[key].forEach((s, i) => {
    const [[pen, time], scramble, ts, comment] = s
    const solve = {
      id: `cstimer-${n}-${i}-${ts}`,
      puzzle: target.puzzle,
      category: target.category,
      time,
      penalty: pen === -1 ? 'dnf' : pen > 0 ? '+2' : 'none',
      scramble: scramble ?? '',
      date: new Date(ts * 1000).toISOString(),
    }
    if (comment) solve.comment = comment
    solves.push(solve)
  })
  console.log(`${key.padEnd(10)} "${name}" -> ${target.puzzle} / ${target.category}: ${data[key].length} solves`)
}

solves.sort((a, b) => a.date.localeCompare(b.date))

// same layout as the app writes (src/lib/storage.ts serializeSolves): one solve per line
const lines = solves.map(s => '    ' + JSON.stringify(s))
writeFileSync(
  output,
  `{\n  "format": "gruvtimer-solves",\n  "version": 1,\n  "categories": ${JSON.stringify(categories)},\n  "solves": [\n${lines.join(',\n')}\n  ]\n}\n`,
)
console.log(`\nwrote ${solves.length} solves to ${output}`)
if (skipped.length) console.log(`skipped:\n  ${skipped.join('\n  ')}`)
