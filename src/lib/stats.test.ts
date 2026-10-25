import { describe, expect, it } from 'vitest'
import { formatTime } from './format'
import { bestOf, mean, rolling, runningBest, summarize, trimCount, trimmedAverage } from './stats'

const D = Infinity

describe('trimCount', () => {
  it('matches WCA/csTimer conventions', () => {
    expect([5, 12, 50, 100, 1000].map(trimCount)).toEqual([1, 1, 3, 5, 50])
  })
})

describe('averages', () => {
  it('ao5 drops best and worst', () => {
    expect(trimmedAverage([10000, 12000, 11000, 15000, 9000])).toBe(11000)
  })
  it('ao5 with one DNF counts it as worst', () => {
    expect(trimmedAverage([10000, D, 11000, 12000, 9000])).toBe(11000)
  })
  it('ao5 with two DNFs is DNF', () => {
    expect(trimmedAverage([10000, D, 11000, D, 9000])).toBe(D)
  })
  it('mo3 with a DNF is DNF', () => {
    expect(mean([1, 2, D])).toBe(D)
    expect(mean([1000, 2000, 3000])).toBe(2000)
  })
})

describe('rolling', () => {
  const times = [10, 20, 30, 40, 50, 60, D, 5]
  it('matches the naive computation for every window', () => {
    for (const n of [3, 5]) {
      const r = rolling(times, n, 'avg')
      times.forEach((_, i) => {
        if (i < n - 1) expect(r[i]).toBeNaN()
        else expect(r[i]).toBe(trimmedAverage(times.slice(i - n + 1, i + 1)))
      })
    }
    const m = rolling(times, 3, 'mean')
    expect(m.slice(2)).toEqual([20, 30, 40, 50, D, D])
  })
  it('handles large windows on random data', () => {
    const big = Array.from({ length: 3000 }, (_, i) => (i % 97 === 0 ? D : 8000 + ((i * 7919) % 5000)))
    const r = rolling(big, 100, 'avg')
    for (const i of [99, 500, 2999]) expect(r[i]).toBeCloseTo(trimmedAverage(big.slice(i - 99, i + 1)), 6)
  })
})

describe('best helpers', () => {
  it('bestOf ignores NaN', () => {
    expect(bestOf([NaN, 5, 3, D])).toEqual({ value: 3, index: 2 })
  })
  it('runningBest is a cumulative minimum', () => {
    expect(runningBest([NaN, 5, 7, 3, D])).toEqual([NaN, 5, 5, 3, 3])
  })
})

describe('summarize', () => {
  it('computes session stats', () => {
    const s = summarize([
      { time: 10000, penalty: 'none' },
      { time: 11000, penalty: '+2' },
      { time: 9000, penalty: 'none' },
      { time: 12000, penalty: 'dnf' },
      { time: 8000, penalty: 'none' },
    ])
    expect(s.count).toBe(5)
    expect(s.dnf).toBe(1)
    expect(s.plus2).toBe(1)
    expect(s.best).toBe(8000)
    expect(s.worst).toBe(13000)
    expect(s.mean).toBe(10000)
    expect(s.avgs.find(a => a.label === 'ao5')!.current).toBeCloseTo(32000 / 3)
  })
})

describe('formatTime', () => {
  it('formats', () => {
    expect(formatTime(9876)).toBe('9.87')
    expect(formatTime(61230)).toBe('1:01.23')
    expect(formatTime(D)).toBe('DNF')
    expect(formatTime(NaN)).toBe('–')
  })
})

describe('breakGaps', () => {
  it('inserts a null point only between points more than 30 days apart', async () => {
    const { breakGaps, GAP_MS } = await import('./graph')
    const out = breakGaps([{ x: 0, y: 1 }, { x: 1000, y: 2 }, { x: 1000 + GAP_MS + 1, y: 3 }])
    expect(out.map(p => p.y)).toEqual([1, 2, null, 3])
  })
})
