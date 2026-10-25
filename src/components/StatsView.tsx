import { useMemo, useState } from 'react'
import { dayKey, formatDay, formatTime } from '../lib/format'
import { DAILY_LABELS, dailySeries, histogram, perSolveSeries, SERIES_LABELS, type DailyKey } from '../lib/graph'
import { puzzleInfo } from '../lib/puzzles'
import { effective, sessionText, summarize, type Summary } from '../lib/stats'
import { useStore } from '../lib/store'
import type { GraphSeries } from '../lib/types'
import { Histogram, TimeChart } from './Charts'

const ALL_SERIES = Object.keys(SERIES_LABELS) as GraphSeries[]
const ALL_DAILY = Object.keys(DAILY_LABELS) as DailyKey[]

type Preset = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom'
const PRESET_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }

export function StatsView() {
  const { settings, setSettings, solves, today } = useStore()

  // ---- session ----
  const days = useMemo(() => {
    const set = new Set(solves.map(s => s.day))
    set.add(today)
    return [...set].sort().reverse()
  }, [solves, today])
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const day = pickedDay && days.includes(pickedDay) ? pickedDay : today
  const session = useMemo(() => solves.filter(s => s.day === day), [solves, day])
  const sessionSummary = useMemo(() => summarize(session), [session])
  const sessionGraph = useMemo(
    () => perSolveSeries(session, settings.graphSeries, (_, i) => i + 1),
    [session, settings.graphSeries],
  )
  const bins = useMemo(() => histogram(session.map(effective)), [session])

  // ---- all solves ----
  const [preset, setPreset] = useState<Preset>('all')
  const [from, setFrom] = useState(() => dayKey(new Date(Date.now() - 30 * 864e5)))
  const [to, setTo] = useState(today)
  const [mode, setMode] = useState<'solve' | 'day'>('solve')
  const [dailyKeys, setDailyKeys] = useState<DailyKey[]>(['best', 'mean', 'bestAo5', 'pb'])

  const range = useMemo(() => {
    if (preset === 'all') return { lo: -Infinity, hi: Infinity }
    if (preset === 'custom') {
      const [fy, fm, fd] = from.split('-').map(Number)
      const [ty, tm, td] = to.split('-').map(Number)
      return { lo: new Date(fy, fm - 1, fd).getTime(), hi: new Date(ty, tm - 1, td + 1).getTime() }
    }
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - PRESET_DAYS[preset] + 1)
    return { lo: start.getTime(), hi: Infinity }
  }, [preset, from, to])
  const inRange = (ts: number) => ts >= range.lo && ts < range.hi

  const windowSolves = useMemo(() => solves.filter(s => inRange(s.ts)), [solves, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const windowSummary = useMemo(() => summarize(windowSolves), [windowSolves])
  const overallGraph = useMemo(
    () => mode === 'solve'
      ? perSolveSeries(solves, settings.graphSeries, s => s.ts, s => inRange(s.ts))
      : dailySeries(solves, dailyKeys, inRange),
    [solves, settings.graphSeries, mode, dailyKeys, range], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const toggleSeries = (k: GraphSeries) =>
    setSettings({ graphSeries: settings.graphSeries.includes(k) ? settings.graphSeries.filter(x => x !== k) : ALL_SERIES.filter(x => x === k || settings.graphSeries.includes(x)) })
  const toggleDaily = (k: DailyKey) =>
    setDailyKeys(d => (d.includes(k) ? d.filter(x => x !== k) : ALL_DAILY.filter(x => x === k || d.includes(x))))

  const title = `${puzzleInfo(settings.puzzle).name} · ${settings.category}`

  const copySummary = async () => {
    const text = sessionText(title, day, session)
    try {
      await navigator.clipboard.writeText(text)
      alert('Session summary copied')
    } catch {
      prompt('Copy the session summary:', text)
    }
  }

  const seriesChips = (
    <div className="chips">
      {ALL_SERIES.map(k => (
        <button key={k} className={`chip ${settings.graphSeries.includes(k) ? 'on' : ''}`} style={{ ['--chip' as string]: `var(--${seriesVar(k)})` }} onClick={() => toggleSeries(k)}>
          {SERIES_LABELS[k]}
        </button>
      ))}
    </div>
  )

  return (
    <div className="page stats-view">
      <section className="card">
        <div className="card-head">
          <h2>Session</h2>
          <select value={day} onChange={e => setPickedDay(e.target.value)}>
            {days.map(d => <option key={d} value={d}>{d === today ? `Today (${formatDay(d)})` : formatDay(d)}</option>)}
          </select>
          <button onClick={copySummary} disabled={session.length === 0}>Copy summary</button>
        </div>
        <SummaryTable s={sessionSummary} />
        {seriesChips}
        <TimeChart series={sessionGraph} xAxis="index" />
        <h3>Distribution</h3>
        <Histogram bins={bins} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>All solves</h2>
          <div className="seg">
            {(['7d', '30d', '90d', '1y', 'all', 'custom'] as Preset[]).map(p => (
              <button key={p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>{p}</button>
            ))}
          </div>
        </div>
        {preset === 'custom' && (
          <div className="range">
            <label>from <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
            <label>to <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
          </div>
        )}
        <SummaryTable s={windowSummary} />
        <div className="seg">
          <button className={mode === 'solve' ? 'on' : ''} onClick={() => setMode('solve')}>per solve</button>
          <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>per session</button>
        </div>
        {mode === 'solve' ? seriesChips : (
          <div className="chips">
            {ALL_DAILY.map(k => (
              <button key={k} className={`chip ${dailyKeys.includes(k) ? 'on' : ''}`} style={{ ['--chip' as string]: `var(--${dailyVar(k)})` }} onClick={() => toggleDaily(k)}>
                {DAILY_LABELS[k]}
              </button>
            ))}
          </div>
        )}
        <TimeChart series={overallGraph} xAxis="time" height={300} />
      </section>
    </div>
  )
}

const seriesVar = (k: GraphSeries) =>
  ({ single: 'fg4', best: 'yellow', mo3: 'aqua', ao5: 'blue', ao12: 'green', ao50: 'purple', ao100: 'orange', ao1000: 'red' })[k]
const dailyVar = (k: DailyKey) =>
  ({ best: 'fg4', mean: 'aqua', average: 'blue', bestAo5: 'green', bestAo12: 'purple', pb: 'yellow' })[k]

export function SummaryTable({ s }: { s: Summary }) {
  return (
    <div className="summary">
      <table className="kv">
        <tbody>
          <tr><th>Solves</th><td>{s.count}{s.dnf || s.plus2 ? <span className="muted"> ({s.dnf} DNF, {s.plus2} +2)</span> : null}</td></tr>
          <tr><th>Best</th><td className="best">{formatTime(s.best)}</td></tr>
          <tr><th>Worst</th><td>{formatTime(s.worst)}</td></tr>
          <tr><th>Mean</th><td>{formatTime(s.mean)}</td></tr>
          <tr><th>Average</th><td>{formatTime(s.average)}</td></tr>
          <tr><th>σ</th><td>{formatTime(s.stdDev)}</td></tr>
        </tbody>
      </table>
      <table className="avgs">
        <thead><tr><th /><th>current</th><th>best</th></tr></thead>
        <tbody>
          {s.avgs.map(a => (
            <tr key={a.label} className={s.count < a.n ? 'dim' : ''}>
              <th>{a.label}</th>
              <td>{formatTime(a.current)}</td>
              <td className="best">{formatTime(a.best)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
