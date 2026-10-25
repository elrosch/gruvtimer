import type { CategoryRecord, SolveRecord } from './types'

/*
 * Local database: IndexedDB on every platform (the Capacitor webview has it too).
 *   solves, categories – one record per solve / category, keyed by id, with sync metadata
 *   kv                 – settings, sync cursors and other small values
 *   files              – legacy v1 storage (whole solves.json as text), read once for migration
 */

export type StoreName = 'solves' | 'categories'
type RecordOf<S extends StoreName> = S extends 'solves' ? SolveRecord : CategoryRecord

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('gruvtimer', 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files')
      for (const name of ['solves', 'categories']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' }).createIndex('dirty', 'dirty')
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

export async function getAll<S extends StoreName>(store: S): Promise<RecordOf<S>[]> {
  const db = await open()
  return result(db.transaction(store).objectStore(store).getAll())
}

export async function getDirty<S extends StoreName>(store: S): Promise<RecordOf<S>[]> {
  const db = await open()
  return result(db.transaction(store).objectStore(store).index('dirty').getAll(1))
}

export async function putMany<S extends StoreName>(store: S, records: RecordOf<S>[]): Promise<void> {
  if (records.length === 0) return
  const db = await open()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const r of records) os.put(r)
  await done(tx)
}

/**
 * Read-modify-write of several records in one transaction. `fn` returns the new record,
 * or null to leave it alone. Returns the written records.
 */
export async function modify<S extends StoreName>(
  store: S,
  ids: string[],
  fn: (current: RecordOf<S> | undefined, id: string) => RecordOf<S> | null,
): Promise<RecordOf<S>[]> {
  const db = await open()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  const written: RecordOf<S>[] = []
  await Promise.all(ids.map(async id => {
    const next = fn(await result<RecordOf<S> | undefined>(os.get(id)), id)
    if (next) {
      os.put(next)
      written.push(next)
    }
  }))
  await done(tx)
  return written
}

/** Marks every record as changed and never synced, e.g. after logging out. */
export async function markAllDirty(): Promise<void> {
  const db = await open()
  const tx = db.transaction(['solves', 'categories'], 'readwrite')
  for (const name of ['solves', 'categories'] as const) {
    const req = tx.objectStore(name).openCursor()
    req.onsuccess = () => {
      const c = req.result
      if (!c) return
      c.update({ ...c.value, dirty: 1, updated: '' })
      c.continue()
    }
  }
  await done(tx)
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open()
  return result(db.transaction('kv').objectStore('kv').get(key))
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open()
  const tx = db.transaction('kv', 'readwrite')
  if (value === undefined) tx.objectStore('kv').delete(key)
  else tx.objectStore('kv').put(value, key)
  await done(tx)
}

export async function legacyFile(name: string): Promise<string | undefined> {
  const db = await open()
  return result(db.transaction('files').objectStore('files').get(name))
}
