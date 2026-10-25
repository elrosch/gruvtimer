import type { Penalty } from './types'

/** Formats ms as `s.cc`, `m:ss.cc` or `h:mm:ss.cc`. Infinity means DNF, NaN means no value. */
export function formatTime(ms: number): string {
  if (Number.isNaN(ms)) return '–'
  if (ms === Infinity) return 'DNF'
  const cs = Math.floor(ms / 10)
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = String(cs % 100).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${c}`
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}.${c}`
  return `${s}.${c}`
}

export function formatSolve(time: number, penalty: Penalty): string {
  if (penalty === 'dnf') return `DNF(${formatTime(time)})`
  if (penalty === '+2') return `${formatTime(time + 2000)}+`
  return formatTime(time)
}

/** Local calendar day `yyyy-mm-dd`. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  })
}

/** KeyboardEvent.code for display: 'Space' -> 'space', 'KeyF' -> 'F', 'Tab' -> 'Tab' */
export const keyName = (code: string) => (code === 'Space' ? 'space' : code.replace(/^Key|^Digit/, ''))
