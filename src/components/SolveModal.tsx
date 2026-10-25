import { useEffect, useState } from 'react'
import { formatSolve } from '../lib/format'
import { puzzleInfo } from '../lib/puzzles'
import { useStore } from '../lib/store'
import type { Penalty } from '../lib/types'
import { ScrambleImage } from './ScrambleImage'

export function SolveModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { allSolves, updateSolve, deleteSolve } = useStore()
  const solve = allSolves.find(s => s.id === id)
  const [comment, setComment] = useState(solve?.comment ?? '')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  if (!solve) return null

  const setPenalty = (p: Penalty) => updateSolve(id, { penalty: solve.penalty === p ? 'none' : p })
  const close = () => {
    if ((solve.comment ?? '') !== comment) updateSolve(id, { comment: comment.trim() || undefined })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-time">{formatSolve(solve.time, solve.penalty)}</div>
        <div className="muted small center">
          {puzzleInfo(solve.puzzle).name} · {solve.category} · {new Date(solve.ts).toLocaleString()}
        </div>
        <div className="seg center">
          <button className={solve.penalty === '+2' ? 'on' : ''} onClick={() => setPenalty('+2')}>+2</button>
          <button className={solve.penalty === 'dnf' ? 'on' : ''} onClick={() => setPenalty('dnf')}>DNF</button>
        </div>
        <div className="scramble-text">{solve.scramble}</div>
        <ScrambleImage className="scramble-image big" puzzle={solve.puzzle} scramble={solve.scramble} />
        <textarea placeholder="comment" value={comment} onChange={e => setComment(e.target.value)} rows={2} />
        <div className="modal-actions">
          <button onClick={() => navigator.clipboard?.writeText(solve.scramble)}>Copy scramble</button>
          <button className="danger" onClick={() => { if (confirm('Delete this solve?')) { deleteSolve(id); onClose() } }}>Delete</button>
          <button className="primary" onClick={close}>Done</button>
        </div>
      </div>
    </div>
  )
}
