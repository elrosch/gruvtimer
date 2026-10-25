import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CATEGORY, puzzleInfo } from '../lib/puzzles'
import { keyName } from '../lib/format'
import { exportSolves } from '../lib/storage'
import { useStore } from '../lib/store'
import type { ThemeMode } from '../lib/types'

export function SettingsView() {
  const store = useStore()
  const { settings, setSettings, categoriesFor, categories, allSolves } = store
  const fileInput = useRef<HTMLInputElement>(null)

  const onImport = async (f: File | undefined) => {
    if (!f) return
    try {
      const added = await store.importText(await f.text())
      alert(`Imported ${added} new solves`)
    } catch (e) {
      alert(`Import failed: ${e}`)
    }
  }

  return (
    <div className="page settings-view">
      <section className="card">
        <h2>Timer</h2>
        <label className="row">
          <span>WCA inspection (15 s)</span>
          <input type="checkbox" checked={settings.inspection} onChange={e => setSettings({ inspection: e.target.checked })} />
        </label>
        <TimerKeyRow />
        <label className="row">
          <span>Hold to start: {settings.holdToStartMs === 0 ? 'off (tap to start)' : `${settings.holdToStartMs} ms`}</span>
          <input type="range" min={0} max={1000} step={50} value={settings.holdToStartMs} onChange={e => setSettings({ holdToStartMs: Number(e.target.value) })} />
        </label>
        <label className="row">
          <span>Hide time while running</span>
          <input type="checkbox" checked={settings.hideTimeWhileRunning} onChange={e => setSettings({ hideTimeWhileRunning: e.target.checked })} />
        </label>
        <label className="row">
          <span>Show scramble image</span>
          <input type="checkbox" checked={settings.showScrambleImage} onChange={e => setSettings({ showScrambleImage: e.target.checked })} />
        </label>
        <label className="row">
          <span>Show session graph on timer</span>
          <input type="checkbox" checked={settings.showTimerGraph} onChange={e => setSettings({ showTimerGraph: e.target.checked })} />
        </label>
        <label className="row">
          <span>Theme</span>
          <select value={settings.theme} onChange={e => setSettings({ theme: e.target.value as ThemeMode })}>
            <option value="dark">Gruvbox dark</option>
            <option value="light">Gruvbox light</option>
            <option value="system">System</option>
          </select>
        </label>
      </section>

      <section className="card">
        <h2>Categories · {puzzleInfo(settings.puzzle).name}</h2>
        {categoriesFor(settings.puzzle).map(c => (
          <div className="row" key={c}>
            <span>{c} <span className="muted">({allSolves.filter(s => s.puzzle === settings.puzzle && s.category === c).length})</span></span>
            {c !== DEFAULT_CATEGORY && (
              <span>
                <button onClick={() => { const n = prompt('Rename category', c); if (n) store.renameCategory(c, n.trim()) }}>Rename</button>
                <button className="danger" onClick={() => confirm(`Delete "${c}" and all its solves?`) && store.deleteCategory(c)}>Delete</button>
              </span>
            )}
          </div>
        ))}
        <button onClick={() => { const n = prompt('New category name (e.g. OH, BLD, feet)'); if (n) store.addCategory(n.trim()) }}>+ Add category</button>
      </section>

      <SyncCard />

      <section className="card">
        <h2>Data</h2>
        <p className="muted small">
          {allSolves.length} solves on this device. Export writes them all as plain JSON (<code>solves.json</code>) for backups. Import skips solves you already have, so importing twice is safe.
        </p>
        <div className="row-buttons">
          <button onClick={() => exportSolves(categories, allSolves)}>Export solves.json</button>
          <button onClick={() => fileInput.current?.click()}>Import…</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e => { onImport(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      </section>
    </div>
  )
}

function SyncCard() {
  const { sync, login, logout, syncNow } = useStore()
  // the web app served by the PocketBase container syncs with that same server
  const servedByServer = location.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(location.hostname)
  const [url, setUrl] = useState(sync.url || (servedByServer ? location.origin : ''))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (register: boolean) => {
    setBusy(true)
    setError('')
    try {
      await login(url, email, password, register)
      setPassword('')
    } catch (e) {
      const data = (e as { response?: { message?: string; data?: Record<string, { message: string }> } }).response
      const details = data?.data ? Object.entries(data.data).map(([k, v]) => `${k}: ${v.message}`).join(', ') : ''
      setError([data?.message ?? String(e), details].filter(Boolean).join(' – '))
    } finally {
      setBusy(false)
    }
  }

  if (sync.email) {
    const state = {
      off: 'not syncing', idle: 'up to date', syncing: 'syncing…', offline: 'offline – will retry', error: 'error',
    }[sync.phase]
    return (
      <section className="card">
        <h2>Sync</h2>
        <div className="row"><span className="muted">Account</span><span>{sync.email}</span></div>
        <div className="row"><span className="muted">Server</span><span className="small">{sync.url}</span></div>
        <div className="row">
          <span className="muted">Status</span>
          <span className={`sync-state ${sync.phase}`}>
            {state}{sync.lastSync ? <span className="muted small"> · {new Date(sync.lastSync).toLocaleString()}</span> : null}
          </span>
        </div>
        {sync.message && <p className="error small">{sync.message}</p>}
        <div className="row-buttons">
          <button onClick={syncNow} disabled={sync.phase === 'syncing'}>Sync now</button>
          <button onClick={() => confirm('Log out? Your solves stay on this device and upload again with the next login.') && logout()}>Log out</button>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Sync</h2>
      <p className="muted small">Sync your solves between devices through your own PocketBase server.</p>
      <form className="sync-form" onSubmit={e => { e.preventDefault(); submit(false) }}>
        <input type="url" placeholder="https://timer.example.com" value={url} onChange={e => setUrl(e.target.value)} required />
        <input type="email" placeholder="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
        {(error || sync.message) && <p className="error small">{error || sync.message}</p>}
        <div className="row-buttons">
          <button type="submit" className="primary" disabled={busy}>Log in</button>
          <button type="button" disabled={busy || !email || password.length < 8} onClick={() => submit(true)}>Create account</button>
        </div>
      </form>
    </section>
  )
}

/**
 * Lets the user pick the timer key by pressing it, and measures how long the browser saw it held.
 * Keyboards with mod-tap/layer-tap on a key (common on split keyboards) send the key only on
 * release, so it looks held for ~0 ms and hold-to-start can never arm.
 */
function TimerKeyRow() {
  const { settings, setSettings } = useStore()
  const [capturing, setCapturing] = useState(false)
  const [result, setResult] = useState<{ code: string; heldMs: number } | null>(null)

  useEffect(() => {
    if (!capturing) return
    let down: { code: string; t: number } | null = null
    const onDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') return setCapturing(false)
      if (!e.repeat) down = { code: e.code, t: performance.now() }
    }
    const onUp = (e: KeyboardEvent) => {
      if (!down || e.code !== down.code) return
      e.preventDefault()
      const heldMs = Math.round(performance.now() - down.t)
      setSettings({ timerKey: down.code })
      setResult({ code: down.code, heldMs })
      setCapturing(false)
    }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
    }
  }, [capturing, setSettings])

  const sentOnRelease = result && result.heldMs < 40
  return (
    <>
      <div className="row">
        <span>Timer key</span>
        <span>
          <code>{keyName(settings.timerKey)}</code>
          <button onClick={() => { setResult(null); setCapturing(true) }} className={capturing ? 'primary' : ''}>
            {capturing ? 'hold the key for ~1 s…' : 'Change / test'}
          </button>
        </span>
      </div>
      {result && (
        <p className={`small ${sentOnRelease ? 'error' : 'muted'}`}>
          {sentOnRelease
            ? `The browser saw "${result.code}" held for only ${result.heldMs} ms although you held it longer: your keyboard sends this key only when you let go (mod-tap / layer-tap in the firmware). Pick a key without a hold function, or set "Hold to start" to off.`
            : `"${result.code}" held for ${result.heldMs} ms – works with hold to start.`}
        </p>
      )}
    </>
  )
}
