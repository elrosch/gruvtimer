import type { PuzzleId } from './types'

export interface PuzzleInfo {
  id: PuzzleId
  name: string
  /** Puzzle id for cubing.js TwistyPlayer. */
  twisty: string
}

export const PUZZLES: PuzzleInfo[] = [
  { id: '222', name: '2x2', twisty: '2x2x2' },
  { id: '333', name: '3x3', twisty: '3x3x3' },
  { id: '444', name: '4x4', twisty: '4x4x4' },
  { id: '555', name: '5x5', twisty: '5x5x5' },
  { id: '666', name: '6x6', twisty: '6x6x6' },
  { id: '777', name: '7x7', twisty: '7x7x7' },
  { id: 'clock', name: 'Clock', twisty: 'clock' },
  { id: 'minx', name: 'Megaminx', twisty: 'megaminx' },
  { id: 'pyram', name: 'Pyraminx', twisty: 'pyraminx' },
  { id: 'skewb', name: 'Skewb', twisty: 'skewb' },
  { id: 'sq1', name: 'Square-1', twisty: 'square1' },
]

export const puzzleInfo = (id: PuzzleId): PuzzleInfo => PUZZLES.find(p => p.id === id) ?? PUZZLES[1]

export const DEFAULT_CATEGORY = 'Normal'
