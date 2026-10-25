import { describe, expect, it } from 'vitest'
import { isRecordId } from './ids'
import { importableSolves, parseSolvesFile, serializeSolves } from './storage'
import type { Solve } from './types'

const solve = (over: Partial<Solve> = {}): Solve => ({
  id: 'abcdefghijklmno', puzzle: '333', category: 'Normal', time: 12345, penalty: 'none',
  scramble: "R U R'", date: '2026-10-24T18:00:00.000Z', ...over,
})

describe('importableSolves', () => {
  it('skips solves already present by id or by puzzle + date + time', () => {
    const existing = [solve()]
    const incoming = [
      solve(), // same id
      solve({ id: 'cstimer-8-0-1', category: 'OH' }), // same moment and time, other id
      solve({ id: 'cstimer-8-1-2', time: 999 }), // new
    ]
    const out = importableSolves(existing, incoming)
    expect(out).toHaveLength(1)
    expect(out[0].time).toBe(999)
  })

  it('gives non-PocketBase ids a fresh record id and marks records for upload', () => {
    const [r] = importableSolves([], [solve({ id: 'cstimer-8-1-2' })])
    expect(isRecordId(r.id)).toBe(true)
    expect(r).toMatchObject({ dirty: 1, deleted: false, rev: 1, updated: '' })
  })

  it('does not import the same solve twice from one file', () => {
    expect(importableSolves([], [solve({ id: 'a' }), solve({ id: 'b' })])).toHaveLength(1)
  })
})

describe('solves.json', () => {
  it('round-trips and leaves sync fields out of the file', () => {
    const record = { ...solve({ comment: 'pb!' }), dirty: 1, rev: 3, deleted: false, updated: 'x' }
    const text = serializeSolves({ '333': ['Normal', 'OH'] }, [record])
    expect(text).not.toMatch(/dirty|rev|updated/)
    const file = parseSolvesFile(text)
    expect(file.solves).toEqual([solve({ comment: 'pb!' })])
    expect(file.categories).toEqual({ '333': ['Normal', 'OH'] })
  })
})
