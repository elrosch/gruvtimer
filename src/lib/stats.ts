import { formatDay, formatSolve, formatTime } from './format'
import type { LoadedSolve, Solve } from './types'

/*
 * Conventions: times are ms, DNF is Infinity, "no value" is NaN.
 * Averages follow WCA rules: mo3 is a plain mean (any DNF => DNF); aoN drops the best and
 * worst ceil(5%) of the window (1 for ao5/ao12, 3 for ao50, 5 for ao100, 50 for ao1000)
 * and is DNF when there are more DNFs than dropped worst solves.
 */

export const effective = (s: Pick<Solve, 'time' | 'penalty'>): number =>
  s.penalty === 'dnf' ? Infinity : s.penalty === '+2' ? s.time + 2000 : s.time

export const trimCount = (n: number): number => (n < 3 ? 0 : Math.max(1, Math.ceil(n * 0.05)))

export function mean(times: number[]): number {
  if (times.length === 0) return NaN
  let sum = 0
  for (const t of times) {
    if (t === Infinity) return Infinity
    sum += t
  }
  return sum / times.length
}

/** Trimmed average of a list of times (sorted copy is made). */
export function trimmedAverage(times: number[]): number {
  if (times.length < 3) return NaN
  return trimmedFromSorted([...times].sort((a, b) => a - b))
}

function trimmedFromSorted(sorted: number[]): number {
  const k = trimCount(sorted.length)
  let sum = 0
  for (let i = k; i < sorted.length - k; i++) {
    if (sorted[i] === Infinity) return Infinity
    sum += sorted[i]
  }
  return sum / (sorted.length - 2 * k)
}

export type AvgKind = 'mean' | 'avg'

export interface AvgDef {
  label: string
  n: number
  kind: AvgKind
}

export const AVERAGES: AvgDef[] = [
  { label: 'mo3', n: 3, kind: 'mean' },
  { label: 'ao5', n: 5, kind: 'avg' },
  { label: 'ao12', n: 12, kind: 'avg' },
  { label: 'ao50', n: 50, kind: 'avg' },
  { label: 'ao100', n: 100, kind: 'avg' },
  { label: 'ao1000', n: 1000, kind: 'avg' },
]

export const avgDef = (label: string): AvgDef | undefined => AVERAGES.find(a => a.label === label)

function lowerBound(arr: number[], v: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < v) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Rolling average over every window of `n` consecutive times.
 * result[i] is the average of times[i-n+1..i], NaN while fewer than n solves exist.
 * Uses a sorted sliding window, so ao1000 over tens of thousands of solves stays fast.
 */
export function rolling(times: number[], n: number, kind: AvgKind): number[] {
  const out = new Array<number>(times.length).fill(NaN)
  if (times.length < n) return out
  if (kind === 'mean') {
    let sum = 0
    let dnfs = 0
    for (let i = 0; i < times.length; i++) {
      const t = times[i]
      if (t === Infinity) dnfs++
      else sum += t
      if (i >= n) {
        const old = times[i - n]
        if (old === Infinity) dnfs--
        else sum -= old
      }
      if (i >= n - 1) out[i] = dnfs > 0 ? Infinity : sum / n
    }
    return out
  }
  const win: number[] = []
  for (let i = 0; i < times.length; i++) {
    win.splice(lowerBound(win, times[i]), 0, times[i])
    if (i >= n) win.splice(lowerBound(win, times[i - n]), 1)
    if (i >= n - 1) out[i] = trimmedFromSorted(win)
  }
  return out
}

/** Best (lowest) value of a series, ignoring NaN. Returns its index too (-1 if none). */
export function bestOf(series: number[]): { value: number; index: number } {
  let value = NaN
  let index = -1
  for (let i = 0; i < series.length; i++) {
    const v = series[i]
    if (Number.isNaN(v)) continue
    if (index === -1 || v < value) {
      value = v
      index = i
    }
  }
  return { value, index }
}

/** Personal best so far at each point (cumulative minimum). */
export function runningBest(series: number[]): number[] {
  let best = NaN
  return series.map(v => {
    if (!Number.isNaN(v) && (Number.isNaN(best) || v < best)) best = v
    return best
  })
}

export function stdDev(times: number[]): number {
  const ok = times.filter(t => t !== Infinity)
  if (ok.length < 2) return NaN
  const m = ok.reduce((a, b) => a + b, 0) / ok.length
  return Math.sqrt(ok.reduce((a, t) => a + (t - m) ** 2, 0) / (ok.length - 1))
}

export interface AvgStat extends AvgDef {
  current: number
  best: number
  /** Index of the last solve of the best window. */
  bestIndex: number
}

export interface Summary {
  count: number
  dnf: number
  plus2: number
  best: number
  bestIndex: number
  worst: number
  /** Mean of all non-DNF solves. */
  mean: number
  /** Trimmed average of all solves (WCA style, 5% each side). */
  average: number
  stdDev: number
  avgs: AvgStat[]
}

export function summarize(solves: Pick<Solve, 'time' | 'penalty'>[]): Summary {
  const times = solves.map(effective)
  const ok = times.filter(t => t !== Infinity)
  const best = bestOf(times)
  return {
    count: solves.length,
    dnf: solves.filter(s => s.penalty === 'dnf').length,
    plus2: solves.filter(s => s.penalty === '+2').length,
    best: best.value,
    bestIndex: best.index,
    worst: ok.length ? Math.max(...ok) : NaN,
    mean: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : NaN,
    average: trimmedAverage(times),
    stdDev: stdDev(times),
    avgs: AVERAGES.map(def => {
      const series = rolling(times, def.n, def.kind)
      const b = bestOf(series)
      return { ...def, current: series.length ? series[series.length - 1] : NaN, best: b.value, bestIndex: b.index }
    }),
  }
}

// ---- grouping ----

export function groupByDay<T extends { day: string }>(solves: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const s of solves) {
    const arr = m.get(s.day)
    if (arr) arr.push(s)
    else m.set(s.day, [s])
  }
  return m
}

export interface DayStat {
  day: string
  /** Noon of that local day, for plotting on a time axis. */
  ts: number
  count: number
  best: number
  mean: number
  average: number
  bestAo5: number
  bestAo12: number
}

export function dailyStats(solves: LoadedSolve[]): DayStat[] {
  return [...groupByDay(solves)].map(([day, list]) => {
    const times = list.map(effective)
    const ok = times.filter(t => t !== Infinity)
    const [y, m, d] = day.split('-').map(Number)
    return {
      day,
      ts: new Date(y, m - 1, d, 12).getTime(),
      count: list.length,
      best: bestOf(times).value,
      mean: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : NaN,
      average: trimmedAverage(times),
      bestAo5: bestOf(rolling(times, 5, 'avg')).value,
      bestAo12: bestOf(rolling(times, 12, 'avg')).value,
    }
  })
}

// ---- plain text session summary (copy/share) ----

export function sessionText(title: string, day: string, solves: LoadedSolve[]): string {
  const s = summarize(solves)
  const pad = (x: string, n: number) => x.padEnd(n)
  const lines = [
    `${title} – ${formatDay(day)}`,
    '',
    `Solves:  ${s.count}  (DNF ${s.dnf}, +2 ${s.plus2})`,
    `Mean:    ${formatTime(s.mean)}`,
    `Average: ${formatTime(s.average)}`,
    `σ:       ${formatTime(s.stdDev)}`,
    `Best:    ${formatTime(s.best)}`,
    `Worst:   ${formatTime(s.worst)}`,
    '',
    `${pad('', 8)}${pad('current', 11)}best`,
    ...s.avgs.filter(a => s.count >= a.n).map(a => `${pad(a.label, 8)}${pad(formatTime(a.current), 11)}${formatTime(a.best)}`),
    '',
    ...solves.map((x, i) => `${String(i + 1).padStart(3)}. ${pad(formatSolve(x.time, x.penalty), 12)}${x.scramble}${x.comment ? `  // ${x.comment}` : ''}`),
  ]
  return lines.join('\n')
}
