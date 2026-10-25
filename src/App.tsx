import { useCallback, useEffect, useState } from 'react'
import { HistoryView } from './components/HistoryView'
import { Icon } from './components/Icon'
import { SettingsView } from './components/SettingsView'
import { SolveModal } from './components/SolveModal'
import { StatsView } from './components/StatsView'
import { TimerView } from './components/TimerView'
import { DEFAULT_CATEGORY, PUZZLES } from './lib/puzzles'
import { useStore } from './lib/store'
import type { PuzzleId } from './lib/types'

type Tab = 'timer' | 'history' | 'stats' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'timer', label: 'Timer' },
  { id: 'history', label: 'History' },
  { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' },
]

function useResolvedTheme(): 'dark' | 'light' {
  const { settings } = useStore()
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystemDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return theme
}

export default function App() {
  const { loaded, settings, setSettings, categoriesFor, sync } = useStore()
  const [tab, setTab] = useState<Tab>('timer')
  const [focus, setFocus] = useState(false)
  const [openSolve, setOpenSolve] = useState<string | null>(null)
  const theme = useResolvedTheme()
  const onFocusMode = useCallback((on: boolean) => setFocus(on), [])

  if (!loaded) return <div className="loading">loading…</div>

  const selectPuzzle = (p: PuzzleId) =>
    setSettings({ puzzle: p, category: categoriesFor(p).includes(settings.category) ? settings.category : DEFAULT_CATEGORY })

  return (
    <div className={`app ${focus ? 'focus' : ''}`} key={theme}>
      <header className="topbar">
        <span className="logo">gruv<b>timer</b></span>
        {sync.email && (
          <button className={`sync-dot ${sync.phase}`} title={`sync: ${sync.phase}${sync.message ? ` – ${sync.message}` : ''}`} onClick={() => setTab('settings')} />
        )}
        <select value={settings.puzzle} onChange={e => selectPuzzle(e.target.value as PuzzleId)}>
          {PUZZLES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={settings.category} onChange={e => setSettings({ category: e.target.value })}>
          {categoriesFor(settings.puzzle).map(c => <option key={c}>{c}</option>)}
        </select>
      </header>

      <main>
        {/* kept mounted so the scramble and last solve survive tab switches */}
        <div className="timer-host" hidden={tab !== 'timer'}>
          <TimerView active={tab === 'timer' && !openSolve} onFocusMode={onFocusMode} onOpenSolve={setOpenSolve} />
        </div>
        {tab === 'history' && <HistoryView onOpenSolve={setOpenSolve} />}
        {tab === 'stats' && <StatsView />}
        {tab === 'settings' && <SettingsView />}
      </main>

      <nav className="tabbar">
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Icon name={t.id} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {openSolve && <SolveModal id={openSolve} onClose={() => setOpenSolve(null)} />}
    </div>
  )
}
