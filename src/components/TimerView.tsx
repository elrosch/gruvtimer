import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatSolve, formatTime, keyName } from '../lib/format'
import { perSolveSeries } from '../lib/graph'
import { useScramble } from '../lib/scramble'
import { summarize } from '../lib/stats'
import { useStore } from '../lib/store'
import type { Penalty } from '../lib/types'
import { TimeChart } from './Charts'
import { ScrambleImage } from './ScrambleImage'

type Phase = 'idle' | 'inspecting' | 'running'
type Armed = 'none' | 'tap' | 'holding' | 'ready'

const INSPECTION_MS = 15000

export function TimerView({ active, onFocusMode, onOpenSolve }: {
  active: boolean
  onFocusMode: (on: boolean) => void
  onOpenSolve: (id: string) => void
}) {
  const { settings, session, addSolve, updateSolve, deleteSolve } = useStore()
  const { scramble, next } = useScramble(settings.puzzle)

  const [phase, setPhase] = useState<Phase>('idle')
  const [armed, setArmed] = useState<Armed>('none')
  const [now, setNow] = useState(0)
  const [lastId, setLastId] = useState<string | null>(null)

  // refs mirror state for the input handlers so they never see stale values
  const st = useRef({ phase, armed, start: 0, inspStart: 0, justStopped: false, holdTimer: 0 })
  st.current.phase = phase
  st.current.armed = armed

  const last = session.find(s => s.id === lastId) ?? null

  useEffect(() => onFocusMode(phase !== 'idle'), [phase, onFocusMode])

  useEffect(() => {
    if (phase === 'idle') return
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // a new puzzle/category means a fresh scramble and no "last solve" actions
  useEffect(() => setLastId(null), [settings.puzzle, settings.category])

  // updates the ref immediately: with "tap" keys keydown and keyup can arrive before a re-render
  const arm = useCallback((a: Armed) => {
    st.current.armed = a
    setArmed(a)
  }, [])

  const press = useCallback(() => {
    const s = st.current
    if (s.phase === 'running') {
      const time = Math.round(performance.now() - s.start)
      const insp = s.inspStart ? s.start - s.inspStart : 0
      const penalty: Penalty = insp > INSPECTION_MS + 2000 ? 'dnf' : insp > INSPECTION_MS ? '+2' : 'none'
      const solve = addSolve({ time, penalty, scramble: scramble ?? '' })
      setLastId(solve.id)
      setPhase('idle')
      s.justStopped = true
      next()
      return
    }
    if (s.armed !== 'none') return
    if (s.phase === 'idle' && settings.inspection) {
      arm('tap')
      return
    }
    // 0 ms: a plain tap starts the timer (needed for keys that only send on release, e.g. mod-tap)
    if (settings.holdToStartMs === 0) {
      arm('ready')
      return
    }
    arm('holding')
    clearTimeout(s.holdTimer)
    s.holdTimer = window.setTimeout(() => {
      if (st.current.armed === 'holding') arm('ready')
    }, settings.holdToStartMs)
  }, [addSolve, next, scramble, settings.inspection, settings.holdToStartMs, arm])

  const release = useCallback(() => {
    const s = st.current
    if (s.justStopped) {
      s.justStopped = false
      return
    }
    clearTimeout(s.holdTimer)
    if (s.armed === 'tap') {
      s.inspStart = performance.now()
      setPhase('inspecting')
    } else if (s.armed === 'ready') {
      if (s.phase === 'idle') s.inspStart = 0
      s.start = performance.now()
      setNow(s.start)
      setPhase('running')
      setLastId(null)
    }
    arm('none')
  }, [arm])

  const cancel = useCallback(() => {
    clearTimeout(st.current.holdTimer)
    arm('none')
    setPhase('idle')
  }, [arm])

  useEffect(() => {
    if (!active) return
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest?.('input, textarea, select')
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.code === 'Escape') return cancel()
      // while running any key stops the timer, like Twisty / csTimer
      if (e.code === settings.timerKey || st.current.phase === 'running') {
        e.preventDefault()
        if (!e.repeat) press()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.code === settings.timerKey || st.current.justStopped) {
        e.preventDefault()
        release()
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [active, press, release, cancel, settings.timerKey])

  const stats = useMemo(() => summarize(session), [session])
  // same series selection as the session graph on the Stats page
  const graph = useMemo(
    () => (settings.showTimerGraph && session.length >= 2 ? perSolveSeries(session, settings.graphSeries, (_, i) => i + 1) : null),
    [session, settings.graphSeries, settings.showTimerGraph],
  )
  const avg = (label: string) => stats.avgs.find(a => a.label === label)!

  let display: string
  let displayClass = ''
  if (phase === 'running') {
    display = settings.hideTimeWhileRunning ? 'solve' : formatTime(now - st.current.start)
  } else if (phase === 'inspecting') {
    const left = Math.ceil((INSPECTION_MS - (now - st.current.inspStart)) / 1000)
    display = left > 0 ? String(left) : left > -2 ? '+2' : 'DNF'
    displayClass = left <= 3 ? 'warn' : 'inspect'
  } else {
    display = last ? formatSolve(last.time, last.penalty) : '0.00'
  }
  if (armed === 'holding') displayClass = 'holding'
  if (armed === 'ready') displayClass = 'ready'

  const pointer = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, textarea, input')) return
      e.preventDefault()
      press()
    },
    onPointerUp: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, textarea, input')) return
      release()
    },
  }

  const focus = phase !== 'idle'

  return (
    <div className={`timer-view ${focus ? 'focus' : ''}`} {...pointer}>
      {!focus && (
        <div className="scramble-bar">
          <div className={`scramble-text puzzle-${settings.puzzle}`}>{scramble ?? 'generating scramble…'}</div>
          <div className="scramble-actions">
            <button className="icon-btn" title="New scramble" onClick={() => next()}>⟳</button>
          </div>
        </div>
      )}

      <div className="timer-center">
        <div className={`timer-display ${displayClass}`}>{display}</div>
        {!focus && last && (
          <div className="last-actions">
            <button className={last.penalty === '+2' ? 'on' : ''} onClick={() => updateSolve(last.id, { penalty: last.penalty === '+2' ? 'none' : '+2' })}>+2</button>
            <button className={last.penalty === 'dnf' ? 'on' : ''} onClick={() => updateSolve(last.id, { penalty: last.penalty === 'dnf' ? 'none' : 'dnf' })}>DNF</button>
            <button onClick={() => onOpenSolve(last.id)}>✎</button>
            <button className="danger" onClick={() => { deleteSolve(last.id); setLastId(null) }}>✕</button>
          </div>
        )}
        {!focus && !last && (
          <div className="hint">
            {settings.inspection
              ? `tap ${keyName(settings.timerKey)} / touch to inspect`
              : settings.holdToStartMs === 0
                ? `tap ${keyName(settings.timerKey)} or touch to start`
                : `hold ${keyName(settings.timerKey)} or touch, release to start`}
          </div>
        )}
      </div>

      {!focus && graph && <TimeChart series={graph} xAxis="index" height={180} />}

      {!focus && (
        <div className="timer-bottom">
          <table className="quick-stats">
            <tbody>
              <tr><th>Solves</th><td>{stats.count}</td></tr>
              <tr><th>Best</th><td>{formatTime(stats.best)}</td></tr>
              <tr><th>Mean</th><td>{formatTime(stats.mean)}</td></tr>
              <tr><th>σ</th><td>{formatTime(stats.stdDev)}</td></tr>
            </tbody>
          </table>
          <table className="quick-stats">
            <tbody>
              {['ao5', 'ao12', 'ao50', 'ao100'].map(l => (
                <tr key={l}><th>{l}</th><td>{formatTime(avg(l).current)}</td></tr>
              ))}
            </tbody>
          </table>
          {settings.showScrambleImage && <ScrambleImage className="scramble-image" puzzle={settings.puzzle} scramble={scramble} />}
        </div>
      )}
    </div>
  )
}
