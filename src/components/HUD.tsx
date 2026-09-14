import { useEffect, useState } from 'react'
import { WIN_IOU } from '../lib/constants'
import { dateKey, formatTime, puzzleNumber } from '../lib/daily'
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
  return <span className="font-mono tabular-nums">{formatTime(elapsed)}</span>
}

function MatchMeter() {
  const match = useGame((s) => s.match)
  const solved = useGame((s) => s.solved)
  const pct = Math.round(match * 100)
  const hue = Math.round(200 - Math.min(match / WIN_IOU, 1) * 160)

  return (
    <div className="w-72 max-w-[80vw]">
      <div className="mb-1.5 flex items-baseline justify-between text-xs uppercase tracking-widest text-slate-400">
        <span>{solved ? 'Matched' : 'Match'}</span>
        <span className="font-mono text-base text-slate-100">{pct}%</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${pct}%`, background: solved ? '#f5c451' : `hsl(${hue} 85% 60%)` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-slate-300/60" style={{ left: `${WIN_IOU * 100}%` }} />
      </div>
    </div>
  )
}

export function HUD() {
  const mode = useGame((s) => s.mode)
  const level = useGame((s) => s.level)
  const play = useGame((s) => s.play)

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shadow</h1>
          <p className="text-sm text-slate-400">
            {mode === 'daily' ? `Daily #${puzzleNumber()} · ${dateKey()}` : 'Practice'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Timer />
          <button
            className="pointer-events-auto rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500 hover:text-white"
            onClick={() => play(mode === 'daily' ? 'practice' : 'daily')}
          >
            {mode === 'daily' ? 'Random puzzle' : 'Back to daily'}
          </button>
        </div>
      </header>

      {!level && (
        <p className="self-center animate-pulse text-sm tracking-widest text-slate-400 uppercase">Casting shadows…</p>
      )}

      <footer className="flex flex-col items-center gap-3">
        <MatchMeter />
        <p className="text-center text-xs text-slate-500">
          Fit the shadow into the outline · scroll or Q/E also spins
        </p>
      </footer>
    </div>
  )
}
