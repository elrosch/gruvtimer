import { avgDef, dailyStats, effective, rolling, runningBest } from './stats'
import type { GraphSeries, LoadedSolve } from './types'

export interface Point { x: number; y: number | null }

export const GAP_MS = 30 * 864e5

/** Inserts a null point wherever consecutive points are more than `maxGap` apart, so the line breaks there. */
export function breakGaps(data: Point[], maxGap = GAP_MS): Point[] {
  const out: Point[] = []
  data.forEach((p, i) => {
    if (i > 0 && p.x - data[i - 1].x > maxGap) out.push({ x: (p.x + data[i - 1].x) / 2, y: null })
    out.push(p)
  })
  return out
}

export interface Series {
  key: string
  label: string
  /** CSS variable holding the colour. */
  color: string
  data: Point[]
  points?: boolean
  stepped?: boolean
}

export const SERIES_COLORS: Record<string, string> = {
  single: '--fg4',
  best: '--yellow',
  mo3: '--aqua',
  ao5: '--blue',
  ao12: '--green',
  ao50: '--purple',
  ao100: '--orange',
  ao1000: '--red',
  mean: '--aqua',
  average: '--blue',
  bestAo5: '--green',
  bestAo12: '--purple',
}

export const SERIES_LABELS: Record<GraphSeries, string> = {
  single: 'Single', best: 'Best (PB)', mo3: 'mo3', ao5: 'ao5', ao12: 'ao12', ao50: 'ao50', ao100: 'ao100', ao1000: 'ao1000',
}

/**
 * Per-solve series. Averages are computed over the full `solves` list (so an ao100 at the
 * start of a window still includes the 99 solves before it) and then cut to `keep`.
 */
export function perSolveSeries(
  solves: LoadedSolve[],
  wanted: GraphSeries[],
  x: (s: LoadedSolve, i: number) => number,
  keep: (s: LoadedSolve) => boolean = () => true,
): Series[] {
  const times = solves.map(effective)
  const build = (key: GraphSeries, values: number[], extra: Partial<Series> = {}): Series => {
    const data: Point[] = []
    values.forEach((y, i) => {
      if (Number.isFinite(y) && keep(solves[i])) data.push({ x: x(solves[i], i), y })
    })
    return { key, label: SERIES_LABELS[key], color: SERIES_COLORS[key], data, ...extra }
  }
  return wanted.map(key => {
    if (key === 'single') return build(key, times, { points: true })
    if (key === 'best') return build(key, runningBest(times), { stepped: true })
    const def = avgDef(key)!
    return build(key, rolling(times, def.n, def.kind))
  })
}

export type DailyKey = 'best' | 'mean' | 'average' | 'bestAo5' | 'bestAo12' | 'pb'

export const DAILY_LABELS: Record<DailyKey, string> = {
  best: 'Best single', mean: 'Mean', average: 'Average', bestAo5: 'Best ao5', bestAo12: 'Best ao12', pb: 'PB single',
}

/** One point per session (day): how each day went, plus the all-time PB progression. */
export function dailySeries(solves: LoadedSolve[], wanted: DailyKey[], keep: (ts: number) => boolean): Series[] {
  const days = dailyStats(solves)
  const pb = runningBest(days.map(d => d.best))
  return wanted.map(key => {
    const values = key === 'pb' ? pb : days.map(d => d[key])
    const data = days.flatMap((d, i) => (Number.isFinite(values[i]) && keep(d.ts) ? [{ x: d.ts, y: values[i] }] : []))
    return {
      key, label: DAILY_LABELS[key], data,
      color: key === 'pb' ? '--yellow' : key === 'best' ? '--fg4' : SERIES_COLORS[key],
      stepped: key === 'pb',
      points: key === 'best',
    }
  })
}

/** Histogram bins with a "nice" width so there are roughly 8–20 bars. */
export function histogram(times: number[]): { label: string; count: number }[] {
  const ok = times.filter(Number.isFinite)
  if (ok.length === 0) return []
  const min = Math.min(...ok)
  const max = Math.max(...ok)
  const steps = [100, 200, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000]
  const width = steps.find(w => (max - min) / w <= 16) ?? 60000
  const start = Math.floor(min / width) * width
  const bins = Array.from({ length: Math.floor((max - start) / width) + 1 }, (_, i) => ({ from: start + i * width, count: 0 }))
  for (const t of ok) bins[Math.floor((t - start) / width)].count++
  const fmt = (ms: number) => (width >= 1000 ? `${ms / 1000}` : (ms / 1000).toFixed(width % 1000 === 0 ? 0 : 1))
  return bins.map(b => ({ label: `${fmt(b.from)}+`, count: b.count }))
}
