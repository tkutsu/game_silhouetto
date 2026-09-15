import { useEffect, useState } from 'react'
import { WIN_IOU } from '../lib/constants'
import { formatTime } from '../lib/stats'
import { timeLimitFor, useGame } from '../state/store'
import { Help } from './Help'

/** Counts down from the puzzle's time limit once the player first touches it. */
function Countdown() {
  const startedAt = useGame((s) => s.startedAt)
  const time = useGame((s) => s.time)
  const level = useGame((s) => s.level)
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (time !== null || startedAt === null) return
    const id = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(id)
  }, [startedAt, time])

  const elapsed = time ?? (startedAt === null ? 0 : now - startedAt)
  if (!level) return null
  const left = Math.max(0, timeLimitFor(level) - elapsed)
  return (
    <span className={`font-mono text-lg tabular-nums ${left < 10_000 && time === null ? 'text-rose-400' : ''}`}>
      {formatTime(left)}
    </span>
  )
}

function NoteIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M9 17.5a3 3 0 1 1-2-2.83V5l12-2.5v12a3 3 0 1 1-2-2.83V6.9l-8 1.66z" />
      {muted && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}

const SEGMENTS = 10

function MatchMeter() {
  const match = useGame((s) => s.match)
  const peak = useGame((s) => s.peak)
  const solved = useGame((s) => s.solved)
  const n = Math.min(Math.max((match - 0.35) / (WIN_IOU - 0.35), 0), 1)
  const lit = solved ? SEGMENTS : Math.floor(n * SEGMENTS)
  const color = solved ? '#f5c451' : `hsl(${210 - 165 * n} 85% ${60 + 10 * n}%)`
  // past 55% the whole meter starts to rumble, harder and faster the closer you get
  const amp = solved ? 0 : Math.max(0, (n - 0.55) * 9)
  const rumble = amp > 0 ? `rumble ${Math.max(0.08, 0.28 - 0.2 * n)}s linear infinite` : undefined

  return (
    <div className="w-72 max-w-[80vw]" style={{ ['--amp' as never]: amp.toFixed(2), animation: rumble }}>
      <div
        key={peak}
        className="animate-pop mb-1.5 text-center text-xs uppercase tracking-widest"
        style={{
          color: solved || n > 0.4 ? color : 'rgb(148 163 184)',
          transform: `scale(${1 + n * 0.35})`,
          textShadow: n > 0.4 ? `0 0 ${18 * n}px ${color}` : undefined,
          animation: !solved && n > 0.88 ? 'flicker 0.12s linear infinite' : undefined,
        }}
      >
        {solved ? 'Matched' : n > 0.85 ? 'So close!' : n > 0.5 ? 'Warmer' : 'Match'}
      </div>
      <div className="flex h-2.5 gap-1">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <div
            key={i}
            className="flex-1 rounded-full bg-slate-800"
            style={
              i < lit
                ? {
                    background: color,
                    boxShadow: `0 0 ${4 + 26 * n}px ${1 + 7 * n}px ${color}`,
                    animation: !solved && n > 0.75 ? 'flicker 0.22s linear infinite' : undefined,
                  }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}

function SolvedToast() {
  const solved = useGame((s) => s.solved)
  const time = useGame((s) => s.time)
  const points = useGame((s) => s.points)
  const autoSolving = useGame((s) => s.autoSolving)
  const timedOut = useGame((s) => s.timedOut)
  if (!solved || time === null) return null
  return (
    <div className="animate-pop absolute top-24 left-1/2 -translate-x-1/2 rounded-2xl border border-amber-400/40 bg-slate-900/80 px-7 py-3 text-center backdrop-blur-sm">
      <div className="font-mono text-3xl text-amber-300">{timedOut ? "Time's up" : autoSolving ? 'Solved' : `+${points}`}</div>
      <div className="text-xs tracking-widest text-slate-300 uppercase">{formatTime(time)}</div>
    </div>
  )
}

function SessionOver() {
  const score = useGame((s) => s.score)
  const bestScore = useGame((s) => s.bestScore)
  const solvedCount = useGame((s) => s.solvedCount)
  const restart = useGame((s) => s.restart)
  const timedOut = useGame((s) => s.timedOut)
  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[3px]">
      <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900/95 p-7 text-center shadow-2xl">
        <p className="text-xs tracking-widest text-amber-400 uppercase">{timedOut ? 'Out of time' : 'Session over'}</p>
        <div className="my-5">
          <div className="font-mono text-5xl text-amber-300">{score}</div>
          <div className="mt-1 text-xs tracking-widest text-slate-400 uppercase">points</div>
        </div>
        <p className="mb-6 text-sm text-slate-400">
          {solvedCount} solved · best {bestScore}
        </p>
        <button
          className="w-full rounded-full bg-amber-400 py-2.5 font-medium text-slate-900 hover:bg-amber-300"
          onClick={restart}
        >
          Play again
        </button>
      </div>
    </div>
  )
}

export function HUD() {
  const level = useGame((s) => s.level)
  const score = useGame((s) => s.score)
  const bestScore = useGame((s) => s.bestScore)
  const difficulty = useGame((s) => s.difficulty)
  const solvesLeft = useGame((s) => s.solvesLeft)
  const canSolve = useGame((s) => s.solvesLeft > 0 && !s.solved && !s.autoSolving && s.level !== null)
  const sessionOver = useGame((s) => s.sessionOver)
  const muted = useGame((s) => s.muted)
  const endRun = useGame((s) => s.endRun)
  const autoSolve = useGame((s) => s.autoSolve)
  const toggleMute = useGame((s) => s.toggleMute)
  const openHelp = useGame((s) => s.openHelp)

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Silhouetto</h1>
          <p className="flex flex-wrap gap-x-3 text-sm whitespace-nowrap text-slate-400">
            <span>
              LV <span className="font-mono text-slate-200">{difficulty}</span>
            </span>
            <span>
              Score <span className="font-mono text-amber-300">{score}</span>
            </span>
            {bestScore > 0 && (
              <span>
                Best <span className="font-mono text-slate-200">{bestScore}</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Countdown />
          <button
            className="pointer-events-auto rounded-full px-3 py-1.5 text-slate-300 hover:text-white"
            onClick={openHelp}
            aria-label="How to play"
          >
            ?
          </button>
          <button
            className={`pointer-events-auto rounded-full px-3 py-1.5 hover:text-white ${muted ? 'text-slate-500' : 'text-slate-300'}`}
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            <NoteIcon muted={muted} />
          </button>
          {solvesLeft > 0 ? (
            <button
              className="pointer-events-auto rounded-full px-3 py-1.5 text-slate-300 enabled:hover:text-white disabled:opacity-40"
              onClick={autoSolve}
              disabled={!canSolve}
              title="Turns the piece into place for you. No points."
            >
              Solve <span className="font-mono text-amber-300">{solvesLeft}</span>
            </button>
          ) : (
            <button
              className="pointer-events-auto rounded-full px-3 py-1.5 text-rose-300 hover:text-rose-200"
              onClick={endRun}
            >
              End run
            </button>
          )}
        </div>
      </header>

      {!level && (
        <p className="self-center animate-pulse text-sm tracking-widest text-slate-400 uppercase">Casting shadows…</p>
      )}
      <SolvedToast />
      {sessionOver && <SessionOver />}
      <Help />

      <footer className="flex flex-col items-center gap-3">
        <MatchMeter />
        <p className="text-center text-xs text-slate-500">
          Fit the shadow into the outline · the dial clicks in 15° steps · running out of time spends a solve
        </p>
      </footer>
    </div>
  )
}
