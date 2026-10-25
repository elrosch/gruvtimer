import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as db from './db'
import { dayKey } from './format'
import { newRecordId } from './ids'
import { DEFAULT_CATEGORY } from './puzzles'
import {
  DEFAULT_SETTINGS, importableSolves, loadSettings, loadSolve, migrateLegacy, newCategoryRecord, newSolveRecord,
  parseSolvesFile, saveSettings,
} from './storage'
import { SyncEngine, type SyncStatus } from './sync'
import type { CategoryRecord, LoadedSolve, Penalty, PuzzleId, Settings, Solve, SolveRecord, SolvesFile } from './types'

type Loaded = LoadedSolve & SolveRecord

interface Store {
  loaded: boolean
  settings: Settings
  setSettings: (patch: Partial<Settings>) => void
  allSolves: Loaded[]
  /** Category names per puzzle, in the export file's shape. */
  categories: SolvesFile['categories']
  categoriesFor: (p: PuzzleId) => string[]
  /** Solves of the selected puzzle + category, oldest first. */
  solves: Loaded[]
  /** Today's session for the selected puzzle + category. */
  session: Loaded[]
  today: string
  addSolve: (s: { time: number; penalty: Penalty; scramble: string }) => Loaded
  updateSolve: (id: string, patch: Partial<Pick<Solve, 'penalty' | 'comment'>>) => void
  deleteSolve: (id: string) => void
  addCategory: (name: string) => void
  renameCategory: (from: string, to: string) => void
  deleteCategory: (name: string) => void
  importText: (text: string) => Promise<number>
  sync: SyncStatus
  login: (url: string, email: string, password: string, register?: boolean) => Promise<void>
  logout: () => Promise<void>
  syncNow: () => void
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

const byTs = (a: Loaded, b: Loaded) => a.ts - b.ts
const touch = <R extends SolveRecord | CategoryRecord>(r: R, patch: Partial<R>): R =>
  ({ ...r, ...patch, dirty: 1, rev: r.rev + 1 })

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)
  const [allSolves, setAllSolves] = useState<Loaded[]>([])
  const [categoryRecords, setCategoryRecords] = useState<CategoryRecord[]>([])
  const [today, setToday] = useState(() => dayKey(new Date()))
  const [sync, setSync] = useState<SyncStatus>({ phase: 'off', url: '', email: '' })
  const settingsDirty = useRef(false)

  /** Merges written/pulled records into state; deleted ones disappear. */
  const applySolves = useCallback((records: SolveRecord[]) => {
    if (records.length === 0) return
    setAllSolves(list => {
      const map = new Map(list.map(s => [s.id, s]))
      for (const r of records) {
        if (r.deleted) map.delete(r.id)
        else map.set(r.id, loadSolve(r))
      }
      return [...map.values()].sort(byTs)
    })
  }, [])

  const applyCategories = useCallback((records: CategoryRecord[]) => {
    if (records.length === 0) return
    setCategoryRecords(list => {
      const map = new Map(list.map(c => [c.id, c]))
      for (const r of records) {
        if (r.deleted) map.delete(r.id)
        else map.set(r.id, r)
      }
      return [...map.values()]
    })
  }, [])

  const [engine] = useState(() => new SyncEngine(
    changes => {
      applySolves(changes.solves)
      applyCategories(changes.categories)
    },
    setSync,
  ))

  useEffect(() => {
    (async () => {
      await migrateLegacy()
      const [solves, cats, s] = await Promise.all([db.getAll('solves'), db.getAll('categories'), loadSettings()])
      setAllSolves(solves.filter(r => !r.deleted).map(r => loadSolve(r)).sort(byTs))
      setCategoryRecords(cats.filter(c => !c.deleted))
      setSettingsState(s)
      setLoaded(true)
      await engine.init()
    })().catch(e => alert(`Loading data failed: ${e}`))
  }, [engine])

  // the session rolls over at local midnight even while the app stays open
  useEffect(() => {
    const t = setInterval(() => setToday(dayKey(new Date())), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!loaded || !settingsDirty.current) return
    const t = setTimeout(() => {
      settingsDirty.current = false
      saveSettings(settings).catch(e => alert(`Saving settings failed: ${e}`))
    }, 300)
    return () => clearTimeout(t)
  }, [settings, loaded])

  const setSettings = useCallback((patch: Partial<Settings>) => {
    settingsDirty.current = true
    setSettingsState(s => ({ ...s, ...patch }))
  }, [])

  // ---- writes: local database first, then let the sync engine pick them up ----

  const saved = (p: Promise<unknown>) => {
    p.then(() => engine.request()).catch(e => alert(`Saving failed: ${e}`))
  }

  const writeSolves = (ids: string[], patch: (r: SolveRecord) => Partial<SolveRecord>) =>
    saved(db.modify('solves', ids, cur => (cur ? touch(cur, patch(cur)) : null)).then(applySolves))

  const writeCategories = (ids: string[], patch: Partial<CategoryRecord>) =>
    saved(db.modify('categories', ids, cur => (cur ? touch(cur, patch) : null)).then(applyCategories))

  const categoriesFor = useCallback(
    (p: PuzzleId) => [...new Set([DEFAULT_CATEGORY, ...categoryRecords.filter(c => c.puzzle === p).map(c => c.name)])],
    [categoryRecords],
  )

  const categories = useMemo(() => {
    const out: SolvesFile['categories'] = {}
    for (const c of categoryRecords) out[c.puzzle] = [...new Set([DEFAULT_CATEGORY, ...(out[c.puzzle] ?? []), c.name])]
    return out
  }, [categoryRecords])

  const solves = useMemo(
    () => allSolves.filter(s => s.puzzle === settings.puzzle && s.category === settings.category),
    [allSolves, settings.puzzle, settings.category],
  )
  const session = useMemo(() => solves.filter(s => s.day === today), [solves, today])

  const addSolve: Store['addSolve'] = ({ time, penalty, scramble }) => {
    const record = newSolveRecord({
      id: newRecordId(), puzzle: settings.puzzle, category: settings.category,
      time, penalty, scramble, date: new Date().toISOString(),
    })
    applySolves([record])
    saved(db.putMany('solves', [record]))
    return loadSolve(record)
  }

  const updateSolve: Store['updateSolve'] = (id, patch) => writeSolves([id], () => patch)

  const deleteSolve: Store['deleteSolve'] = id => writeSolves([id], () => ({ deleted: true }))

  const puzzleCategoryIds = (name: string) =>
    categoryRecords.filter(c => c.puzzle === settings.puzzle && c.name === name).map(c => c.id)
  const puzzleSolveIds = (category: string) =>
    allSolves.filter(s => s.puzzle === settings.puzzle && s.category === category).map(s => s.id)

  const addCategory: Store['addCategory'] = name => {
    if (!name || categoriesFor(settings.puzzle).includes(name)) return
    const record = newCategoryRecord(settings.puzzle, name)
    applyCategories([record])
    saved(db.putMany('categories', [record]))
  }

  const renameCategory: Store['renameCategory'] = (from, to) => {
    if (!to || from === to || categoriesFor(settings.puzzle).includes(to)) return
    writeCategories(puzzleCategoryIds(from), { name: to })
    writeSolves(puzzleSolveIds(from), () => ({ category: to }))
    if (settings.category === from) setSettings({ category: to })
  }

  const deleteCategory: Store['deleteCategory'] = name => {
    if (name === DEFAULT_CATEGORY) return
    writeCategories(puzzleCategoryIds(name), { deleted: true })
    writeSolves(puzzleSolveIds(name), () => ({ deleted: true }))
    if (settings.category === name) setSettings({ category: DEFAULT_CATEGORY })
  }

  const importText: Store['importText'] = async text => {
    const file = parseSolvesFile(text)
    const fresh = importableSolves(allSolves, file.solves)
    const known = new Set(categoryRecords.map(c => `${c.puzzle}|${c.name}`))
    const newCats: CategoryRecord[] = []
    const wanted = [
      ...Object.entries(file.categories).flatMap(([p, names]) => (names ?? []).map(n => [p, n])),
      ...fresh.map(s => [s.puzzle, s.category]),
    ] as [PuzzleId, string][]
    for (const [p, n] of wanted) {
      if (n === DEFAULT_CATEGORY || known.has(`${p}|${n}`)) continue
      known.add(`${p}|${n}`)
      newCats.push(newCategoryRecord(p, n))
    }
    await db.putMany('solves', fresh)
    await db.putMany('categories', newCats)
    applySolves(fresh)
    applyCategories(newCats)
    engine.request()
    return fresh.length
  }

  const value: Store = {
    loaded, settings, setSettings, allSolves, categories, categoriesFor, solves, session, today,
    addSolve, updateSolve, deleteSolve, addCategory, renameCategory, deleteCategory, importText,
    sync,
    login: (url, email, password, register) => engine.login(url, email, password, register),
    logout: () => engine.logout(),
    syncNow: () => void engine.run(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
