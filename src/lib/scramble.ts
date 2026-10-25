import { useCallback, useEffect, useRef, useState } from 'react'
import type { PuzzleId } from './types'

// cubing.js is large; load it lazily so the first paint is not blocked
const scrambler = () => import('cubing/scramble')

async function generate(puzzle: PuzzleId): Promise<string> {
  const { randomScrambleForEvent } = await scrambler()
  return (await randomScrambleForEvent(puzzle)).toString()
}

/**
 * Current scramble for a puzzle. The following scramble is generated in the background
 * while solving, so `next()` is usually instant.
 */
export function useScramble(puzzle: PuzzleId) {
  const [scramble, setScramble] = useState<string | null>(null)
  const queued = useRef<{ puzzle: PuzzleId; p: Promise<string> } | null>(null)
  const generation = useRef(0)

  const take = useCallback(async () => {
    const gen = ++generation.current
    setScramble(null)
    const q = queued.current?.puzzle === puzzle ? queued.current.p : generate(puzzle)
    queued.current = { puzzle, p: q.then(() => generate(puzzle)) }
    try {
      const s = await q
      if (gen === generation.current) setScramble(s)
    } catch (e) {
      if (gen === generation.current) setScramble(`(scramble failed: ${e})`)
    }
  }, [puzzle])

  useEffect(() => {
    take()
  }, [take])

  return { scramble, next: take }
}
