import { useEffect, useRef, useState } from 'react'
import type { TwistyPlayer } from 'cubing/twisty'
import { puzzleInfo } from '../lib/puzzles'
import type { PuzzleId } from '../lib/types'

/** 2D net of the puzzle after applying the scramble, drawn by cubing.js. */
export function ScrambleImage({ puzzle, scramble, className }: { puzzle: PuzzleId; scramble: string | null; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [player, setPlayer] = useState<TwistyPlayer | null>(null)

  useEffect(() => {
    let p: TwistyPlayer | null = null
    let cancelled = false
    import('cubing/twisty').then(({ TwistyPlayer }) => {
      if (cancelled || !host.current) return
      p = new TwistyPlayer({
        puzzle: puzzleInfo(puzzle).twisty as never,
        visualization: '2D',
        background: 'none',
        controlPanel: 'none',
        hintFacelets: 'none',
        alg: '',
      })
      p.style.width = '100%'
      p.style.height = '100%'
      host.current.append(p)
      setPlayer(p)
    })
    return () => {
      cancelled = true
      p?.remove()
      setPlayer(null)
    }
  }, [puzzle])

  useEffect(() => {
    if (player) player.experimentalSetupAlg = scramble ?? ''
  }, [player, scramble])

  return <div ref={host} className={className} />
}
