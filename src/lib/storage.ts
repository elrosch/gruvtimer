import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import * as db from './db'
import { dayKey } from './format'
import { isRecordId, newRecordId } from './ids'
import { DEFAULT_CATEGORY } from './puzzles'
import type { CategoryRecord, LoadedSolve, PuzzleId, Settings, Solve, SolveRecord, SolvesFile } from './types'

/*
 * Solves live as records in the local database (db.ts) and sync to PocketBase (sync.ts).
 * The plain-text solves.json format below is used for export/import, and is what
 * versions before sync stored locally (migrated once by migrateLegacy).
 */

const native = Capacitor.isNativePlatform()

// ---- records ----

export function loadSolve<T extends Solve>(s: T): T & LoadedSolve {
  const d = new Date(s.date)
  return { ...s, ts: d.getTime(), day: dayKey(d) }
}

export const newSolveRecord = (s: Solve): SolveRecord => ({ ...s, deleted: false, dirty: 1, rev: 1, updated: '' })

export const newCategoryRecord = (puzzle: PuzzleId, name: string): CategoryRecord =>
  ({ id: newRecordId(), puzzle, name, deleted: false, dirty: 1, rev: 1, updated: '' })

/** Same moment, puzzle and time: the same solve, even if it came in under another id. */
export const fingerprint = (s: Pick<Solve, 'puzzle' | 'date' | 'time'>) => `${s.puzzle}|${new Date(s.date).getTime()}|${s.time}`

// ---- solves.json (export / import) ----

export function parseSolvesFile(text: string): SolvesFile {
  const data = JSON.parse(text) as SolvesFile
  if (data.format !== 'gruvtimer-solves' || !Array.isArray(data.solves)) {
    throw new Error('Not a gruvtimer solves.json file')
  }
  data.categories ??= {}
  return data
}

/** Strips sync/derived fields so only the documented Solve shape ends up in the file. */
function toStored({ id, puzzle, category, time, penalty, scramble, date, comment }: Solve): Solve {
  return comment ? { id, puzzle, category, time, penalty, scramble, date, comment } : { id, puzzle, category, time, penalty, scramble, date }
}

export function serializeSolves(categories: SolvesFile['categories'], solves: Solve[]): string {
  // one solve per line: readable, diff-friendly, still valid JSON
  const lines = solves.map(s => '    ' + JSON.stringify(toStored(s)))
  return `{\n  "format": "gruvtimer-solves",\n  "version": 1,\n  "categories": ${JSON.stringify(categories)},\n  "solves": [\n${lines.join(',\n')}\n  ]\n}\n`
}

export async function exportSolves(categories: SolvesFile['categories'], solves: Solve[]): Promise<void> {
  const text = serializeSolves(categories, solves)
  const name = `gruvtimer-solves-${dayKey(new Date())}.json`
  if (native) {
    const r = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: name, url: r.uri, dialogTitle: 'Export solves' })
    return
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * New records for the solves of an imported file that are not already present
 * (matched by id or fingerprint). Ids that PocketBase cannot use are replaced.
 */
export function importableSolves(existing: Solve[], incoming: Solve[]): SolveRecord[] {
  const ids = new Set(existing.map(s => s.id))
  const prints = new Set(existing.map(fingerprint))
  const out: SolveRecord[] = []
  for (const s of incoming) {
    const fp = fingerprint(s)
    if (ids.has(s.id) || prints.has(fp)) continue
    ids.add(s.id)
    prints.add(fp)
    out.push(newSolveRecord({ ...toStored(s), id: isRecordId(s.id) ? s.id : newRecordId() }))
  }
  return out
}

// ---- settings ----

export const DEFAULT_SETTINGS: Settings = {
  puzzle: '333',
  category: DEFAULT_CATEGORY,
  inspection: false,
  holdToStartMs: 300,
  timerKey: 'Space',
  hideTimeWhileRunning: false,
  showScrambleImage: true,
  showTimerGraph: true,
  theme: 'dark',
  graphSeries: ['single', 'best', 'ao5', 'ao12', 'ao100'],
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await db.kvGet<Partial<Settings>>('settings')) }
}

export const saveSettings = (s: Settings) => db.kvSet('settings', s)

// ---- one-time migration from the file-based storage ----

async function readLegacy(name: string): Promise<string | undefined> {
  if (native) {
    try {
      const r = await Filesystem.readFile({ path: name, directory: Directory.Data, encoding: Encoding.UTF8 })
      return typeof r.data === 'string' ? r.data : await r.data.text()
    } catch {
      return undefined
    }
  }
  return db.legacyFile(name)
}

let migration: Promise<void> | null = null

/** Runs once per app start even if called concurrently (React StrictMode runs effects twice). */
export function migrateLegacy(): Promise<void> {
  migration ??= runMigration()
  return migration
}

async function runMigration(): Promise<void> {
  if (await db.kvGet('migratedV2')) return
  const solvesText = await readLegacy('solves.json')
  if (solvesText) {
    const file = parseSolvesFile(solvesText)
    await db.putMany('solves', importableSolves([], file.solves))
    const cats = Object.entries(file.categories).flatMap(([p, names]) =>
      (names ?? []).filter(n => n !== DEFAULT_CATEGORY).map(n => newCategoryRecord(p as PuzzleId, n)))
    await db.putMany('categories', cats)
  }
  const settingsText = await readLegacy('settings.json')
  if (settingsText) {
    try {
      await db.kvSet('settings', JSON.parse(settingsText))
    } catch { /* keep defaults */ }
  }
  await db.kvSet('migratedV2', true)
}
