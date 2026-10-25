import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'
import * as db from './db'
import type { StoreName } from './db'
import type { CategoryRecord, Penalty, PuzzleId, SolveRecord } from './types'

/*
 * Offline-first sync with PocketBase (same approach as casa-pazza):
 * - local writes mark records dirty; push upserts them (batch API) under their client id
 * - pull fetches everything with `updated >= cursor` per collection
 * - realtime events, coming online, returning to the app and a timer trigger syncs
 * - conflicts resolve last-write-wins; pending local changes are never overwritten by a pull
 */

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  url: string
  email: string
  lastSync?: number
  message?: string
}

export interface RemoteChanges {
  solves: SolveRecord[]
  categories: CategoryRecord[]
}

const BATCH = 200
const PERIODIC_MS = 5 * 60_000
const RETRY_MS = 30_000

interface Mapping<R> {
  toBody: (r: R) => Record<string, unknown>
  fromRecord: (m: RecordModel) => R
}

const pbDate = (iso: string) => new Date(iso).toISOString().replace('T', ' ')
const isoDate = (pb: string) => new Date(pb.replace(' ', 'T')).toISOString()

const clean = { dirty: 0 as const, rev: 0 }

const MAPPINGS: { solves: Mapping<SolveRecord>; categories: Mapping<CategoryRecord> } = {
  solves: {
    toBody: s => ({
      puzzle: s.puzzle, category: s.category, time: s.time, penalty: s.penalty,
      scramble: s.scramble, date: pbDate(s.date), comment: s.comment ?? '', deleted: s.deleted,
    }),
    fromRecord: m => {
      const s: SolveRecord = {
        id: m.id, puzzle: m.puzzle as PuzzleId, category: m.category, time: m.time, penalty: m.penalty as Penalty,
        scramble: m.scramble, date: isoDate(m.date), deleted: m.deleted, updated: m.updated, ...clean,
      }
      if (m.comment) s.comment = m.comment
      return s
    },
  },
  categories: {
    toBody: c => ({ puzzle: c.puzzle, name: c.name, deleted: c.deleted }),
    fromRecord: m => ({ id: m.id, puzzle: m.puzzle as PuzzleId, name: m.name, deleted: m.deleted, updated: m.updated, ...clean }),
  },
}

const COLLECTIONS: StoreName[] = ['categories', 'solves']

const errorText = (e: unknown) =>
  e instanceof ClientResponseError ? (e.response?.message as string) || e.message : String(e)

export class SyncEngine {
  private pb: PocketBase | null = null
  private status: SyncStatus = { phase: 'off', url: '', email: '' }
  private running: Promise<void> | null = null
  private again = false
  private debounce = 0
  private periodic = 0
  private unsubscribers: (() => Promise<void>)[] = []

  constructor(
    private onRemote: (changes: RemoteChanges) => void,
    private onStatus: (status: SyncStatus) => void,
  ) {}

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch }
    this.onStatus(this.status)
  }

  private initialized: Promise<void> | null = null

  /** Resumes a previous login, if any. Safe to call more than once. */
  init(): Promise<void> {
    this.initialized ??= this.resume()
    return this.initialized
  }

  private async resume() {
    const url = await db.kvGet<string>('syncUrl')
    const lastSync = await db.kvGet<number>('lastSync')
    if (!url) return
    this.pb = this.client(url)
    if (!this.pb.authStore.isValid) {
      this.setStatus({ phase: 'off', url })
      return
    }
    this.setStatus({ url, email: this.pb.authStore.record?.email ?? '', lastSync })
    await this.start()
  }

  private client(url: string) {
    const pb = new PocketBase(url)
    pb.autoCancellation(false)
    return pb
  }

  async login(url: string, email: string, password: string, register = false) {
    url = url.trim().replace(/\/+$/, '')
    const pb = this.client(url)
    if (register) await pb.collection('users').create({ email, password, passwordConfirm: password })
    await pb.collection('users').authWithPassword(email, password)
    await this.stop()
    this.pb = pb
    await db.kvSet('syncUrl', url)
    this.setStatus({ url, email, message: undefined })
    await this.start()
  }

  async logout() {
    await this.stop()
    this.pb?.authStore.clear()
    // everything counts as unsynced again, so the next login uploads it to that account
    await db.markAllDirty()
    for (const c of COLLECTIONS) await db.kvSet(`cursor:${c}`, undefined)
    await db.kvSet('lastSync', undefined)
    this.setStatus({ phase: 'off', email: '', lastSync: undefined, message: undefined })
  }

  private async start() {
    const pb = this.pb!
    this.setStatus({ phase: 'idle' })
    window.addEventListener('online', this.onWake)
    document.addEventListener('visibilitychange', this.onWake)
    this.periodic = window.setInterval(() => this.request(0), PERIODIC_MS)
    try {
      // fires on every (re)connect, e.g. when the server is back after an outage
      this.unsubscribers.push(await pb.realtime.subscribe('PB_CONNECT', () => this.request(0)))
      for (const c of COLLECTIONS) this.unsubscribers.push(await pb.collection(c).subscribe('*', () => this.request(500)))
    } catch { /* realtime is a nice-to-have; periodic sync and retries still run */ }
    this.request(0)
  }

  private async stop(waitForRun = true) {
    window.removeEventListener('online', this.onWake)
    document.removeEventListener('visibilitychange', this.onWake)
    clearInterval(this.periodic)
    clearTimeout(this.debounce)
    await Promise.all(this.unsubscribers.splice(0).map(u => u().catch(() => {})))
    if (waitForRun) await this.running?.catch(() => {})
  }

  private onWake = () => {
    if (document.visibilityState === 'visible') this.request(0)
  }

  /** Schedules a sync; local changes call this after every write. */
  request(delayMs = 1500) {
    if (!this.pb?.authStore.isValid) return
    clearTimeout(this.debounce)
    this.debounce = window.setTimeout(() => void this.run(), delayMs)
  }

  async run(): Promise<void> {
    if (!this.pb?.authStore.isValid) return
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.again = false
        this.setStatus({ phase: 'syncing' })
        try {
          await this.push()
          await this.pull()
          const lastSync = Date.now()
          await db.kvSet('lastSync', lastSync)
          this.setStatus({ phase: 'idle', lastSync, message: undefined })
        } catch (e) {
          const offline = e instanceof ClientResponseError && e.status === 0
          if (e instanceof ClientResponseError && e.status === 401) {
            this.pb?.authStore.clear()
            void this.stop(false) // called from inside run(): must not wait for itself
            this.setStatus({ phase: 'off', message: 'Session expired, please log in again' })
            return
          }
          this.setStatus({ phase: offline ? 'offline' : 'error', message: offline ? undefined : errorText(e) })
          if (offline) this.request(RETRY_MS)
          return
        }
      } while (this.again)
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async push() {
    const pb = this.pb!
    const user = pb.authStore.record!.id
    for (const name of COLLECTIONS) {
      const map = MAPPINGS[name] as Mapping<SolveRecord | CategoryRecord>
      const dirty = await db.getDirty(name)
      for (let i = 0; i < dirty.length; i += BATCH) {
        const chunk = dirty.slice(i, i + BATCH)
        let saved: (RecordModel | null)[]
        try {
          const batch = pb.createBatch()
          for (const r of chunk) batch.collection(name).upsert({ id: r.id, user, ...map.toBody(r) })
          saved = (await batch.send()).map(res => res.body as RecordModel)
        } catch (e) {
          if (!(e instanceof ClientResponseError) || e.status === 0 || e.status === 401) throw e
          // a batch is all-or-nothing: retry one by one so a single bad record cannot block the rest
          saved = []
          for (const r of chunk) {
            try {
              const one = pb.createBatch()
              one.collection(name).upsert({ id: r.id, user, ...map.toBody(r) })
              saved.push((await one.send())[0].body as RecordModel)
            } catch (err) {
              if (!(err instanceof ClientResponseError) || err.status === 0 || err.status === 401) throw err
              console.warn(`sync: server rejected ${name}/${r.id}, keeping it local only`, err.response)
              saved.push(null)
            }
          }
        }
        // only the exact version that was sent becomes clean; newer local edits stay dirty
        const byId = new Map(chunk.map((r, j) => [r.id, { sent: r, saved: saved[j] }]))
        await db.modify(name, [...byId.keys()], (cur, id) => {
          const { sent, saved: s } = byId.get(id)!
          if (!cur || cur.rev !== sent.rev) return null
          return { ...cur, dirty: 0, updated: s?.updated ?? cur.updated }
        })
      }
    }
  }

  private async pull() {
    const pb = this.pb!
    const changes: RemoteChanges = { solves: [], categories: [] }
    for (const name of COLLECTIONS) {
      const map = MAPPINGS[name] as Mapping<SolveRecord | CategoryRecord>
      const cursor = await db.kvGet<string>(`cursor:${name}`)
      const records = await pb.collection(name).getFullList({
        batch: 1000,
        sort: 'updated',
        filter: cursor ? pb.filter('updated >= {:c}', { c: cursor }) : '',
      })
      if (records.length === 0) continue
      const incoming = new Map(records.map(m => [m.id, map.fromRecord(m)]))
      const applied = await db.modify(name, [...incoming.keys()], (cur, id) => {
        const next = incoming.get(id)!
        if (cur?.dirty) return null // local change wins, it is pushed next
        if (cur && cur.updated === next.updated) return null // already have this version
        return next
      })
      ;(changes[name] as typeof applied).push(...applied)
      await db.kvSet(`cursor:${name}`, records[records.length - 1].updated)
    }
    if (changes.solves.length || changes.categories.length) this.onRemote(changes)
  }
}
