import { useEffect, useState } from 'react'
import { WIN_IOU } from '../lib/constants'
import { formatTime } from '../lib/stats'
import { useGame } from '../state/store'

function Timer() {
  const startedAt = useGame((s) => s.startedAt)
  const time = useGame((s) => s.time)
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (time !== null || startedAt === null) return
    const id = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(id)
  }, [startedAt, time])

  const elapsed = time ?? (startedAt === null ? 0 : now - startedAt)
  return <span className="font-mono text-lg tabular-nums">{formatTime(elapsed)}</span>
}

function MatchMeter() {
  const match = useGame((s) => s.match)
  const peak = useGame((s) => s.peak)
  const solved = useGame((s) => s.solved)
  const pct = Math.round(match * 100)
  const n = Math.min(Math.max((match - 0.35) / (WIN_IOU - 0.35), 0), 1)
  const color = solved ? '#f5c451' : `hsl(${210 - 165 * n} 85% ${60 + 10 * n}%)`

  return (
    <div className="w-72 max-w-[80vw]">
      <div className="mb-1.5 flex items-baseline justify-between text-xs uppercase tracking-widest text-slate-400">
        <span>{solved ? 'Matched' : n > 0.85 ? 'So close' : n > 0.5 ? 'Warmer' : 'Match'}</span>
        <span key={peak} className="animate-pop font-mono text-2xl" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 ${4 + 14 * n}px ${color}` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-slate-300/60" style={{ left: `${WIN_IOU * 100}%` }} />
      </div>
    </div>
  )
}

function SolvedToast() {
  const solved = useGame((s) => s.solved)
  const time = useGame((s) => s.time)
  const newBest = useGame((s) => s.newBest)
  if (!solved || time === null) return null
  return (
    <div className="animate-pop absolute top-20 left-1/2 -translate-x-1/2 rounded-2xl border border-amber-400/40 bg-slate-900/80 px-6 py-3 text-center backdrop-blur-sm">
      <div className="font-mono text-3xl text-amber-300">{formatTime(time)}</div>
      <div className="text-xs tracking-widest text-slate-300 uppercase">{newBest ? 'New best!' : 'Solved'}</div>
    </div>
  )
}

export function HUD() {
  const level = useGame((s) => s.level)
  const best = useGame((s) => s.best)
  const solvedCount = useGame((s) => s.solvedCount)
  const totalTime = useGame((s) => s.totalTime)
  const muted = useGame((s) => s.muted)
  const next = useGame((s) => s.next)
  const toggleMute = useGame((s) => s.toggleMute)

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Silhouetto</h1>
          <p className="flex flex-wrap gap-x-3 text-sm whitespace-nowrap text-slate-400">
            <span>
              Best <span className="font-mono text-amber-300">{best === null ? '-:--' : formatTime(best)}</span>
            </span>
            <span>
              Avg <span className="font-mono text-slate-200">{solvedCount ? formatTime(totalTime / solvedCount) : '-:--'}</span>
            </span>
            {solvedCount > 0 && <span>{solvedCount} solved</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Timer />
          <button
            className="pointer-events-auto rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500 hover:text-white"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            className="pointer-events-auto rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500 hover:text-white"
            onClick={next}
          >
            Skip
          </button>
        </div>
      </header>

      {!level && (
        <p className="self-center animate-pulse text-sm tracking-widest text-slate-400 uppercase">Casting shadows…</p>
      )}
      <SolvedToast />

      <footer className="flex flex-col items-center gap-3">
        <MatchMeter />
        <p className="text-center text-xs text-slate-500">
          Fit the shadow into the outline · scroll or Q/E also spins
        </p>
      </footer>
    </div>
  )
}
