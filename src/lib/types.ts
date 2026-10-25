export type PuzzleId =
  | '222' | '333' | '444' | '555' | '666' | '777'
  | 'clock' | 'minx' | 'pyram' | 'skewb' | 'sq1'

export type Penalty = 'none' | '+2' | 'dnf'

/** One solve as stored in the JSON file. */
export interface Solve {
  id: string
  puzzle: PuzzleId
  category: string
  /** Raw timer value in milliseconds, without penalty. */
  time: number
  penalty: Penalty
  scramble: string
  /** ISO 8601 timestamp of when the solve finished. */
  date: string
  comment?: string
}

/** Solve plus derived fields, kept in memory only. */
export interface LoadedSolve extends Solve {
  /** Epoch ms of `date`. */
  ts: number
  /** Local calendar day, `yyyy-mm-dd`. A session = one day on one puzzle + category. */
  day: string
}

/** Bookkeeping for offline-first sync, stored next to each local record. */
export interface SyncMeta {
  /** Tombstone: deleted records are kept until the deletion has been synced. */
  deleted: boolean
  /** 1 while the record has local changes the server has not seen (IndexedDB cannot index booleans). */
  dirty: 0 | 1
  /** Incremented on every local change, so a push only marks the version it sent as clean. */
  rev: number
  /** Server `updated` timestamp of the last synced version, '' if never synced. */
  updated: string
}

export type SolveRecord = Solve & SyncMeta

export interface Category {
  id: string
  puzzle: PuzzleId
  name: string
}

export type CategoryRecord = Category & SyncMeta

/** Export/import file format (also what older versions stored locally). */
export interface SolvesFile {
  format: 'gruvtimer-solves'
  version: 1
  categories: Partial<Record<PuzzleId, string[]>>
  solves: Solve[]
}

export type ThemeMode = 'dark' | 'light' | 'system'

export interface Settings {
  puzzle: PuzzleId
  category: string
  inspection: boolean
  holdToStartMs: number
  /** KeyboardEvent.code of the key that starts/stops the timer. */
  timerKey: string
  hideTimeWhileRunning: boolean
  showScrambleImage: boolean
  showTimerGraph: boolean
  theme: ThemeMode
  graphSeries: GraphSeries[]
}

export type GraphSeries = 'single' | 'best' | 'mo3' | 'ao5' | 'ao12' | 'ao50' | 'ao100' | 'ao1000'
