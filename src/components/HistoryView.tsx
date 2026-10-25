import { useMemo, useState } from 'react'
import { formatDay, formatSolve, formatTime } from '../lib/format'
import { effective, groupByDay, rolling } from '../lib/stats'
import { useStore } from '../lib/store'

export function HistoryView({ onOpenSolve }: { onOpenSolve: (id: string) => void }) {
  const { solves, session } = useStore()
  const [scope, setScope] = useState<'session' | 'all'>('session')
  const list = scope === 'session' ? session : solves

  // ao5/ao12 as of each solve, within its own session (day)
  const rows = useMemo(() => {
    const groups = [...groupByDay(list)].reverse()
    return groups.map(([day, items]) => {
      const times = items.map(effective)
      const ao5 = rolling(times, 5, 'avg')
      const ao12 = rolling(times, 12, 'avg')
      return { day, items: items.map((s, i) => ({ s, n: i + 1, ao5: ao5[i], ao12: ao12[i] })).reverse() }
    })
  }, [list])

  return (
    <div className="page history-view">
      <div className="seg">
        <button className={scope === 'session' ? 'on' : ''} onClick={() => setScope('session')}>Session</button>
        <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All ({solves.length})</button>
      </div>
      {list.length === 0 && <p className="muted center">No solves yet.</p>}
      {rows.map(({ day, items }) => (
        <section key={day} className="card">
          <h3>{formatDay(day)} <span className="muted">· {items.length} solves</span></h3>
          <table className="history">
            <thead><tr><th>#</th><th>time</th><th>ao5</th><th>ao12</th><th /></tr></thead>
            <tbody>
              {items.map(({ s, n, ao5, ao12 }) => (
                <tr key={s.id} onClick={() => onOpenSolve(s.id)}>
                  <td className="muted">{n}</td>
                  <td className={s.penalty === 'dnf' ? 'dnf' : ''}>{formatSolve(s.time, s.penalty)}</td>
                  <td>{formatTime(ao5)}</td>
                  <td>{formatTime(ao12)}</td>
                  <td className="muted small">
                    {new Date(s.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {s.comment ? ' 💬' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
