import { useState } from 'react'
import { formatTime, loadResults, msUntilTomorrow, puzzleNumber, streak } from '../lib/daily'
import { PRACTICE_PREFIX, useGame } from '../state/store'

function shareText(mode: 'daily' | 'practice', seed: string, time: number, match: number) {
  const base = `${location.origin}${location.pathname}`
  const stats = `⏱ ${formatTime(time)} · 🎯 ${(match * 100).toFixed(1)}%`
  if (mode === 'practice') {
    return `Shadow practice 🌗\n${stats}\n${base}?p=${seed.slice(PRACTICE_PREFIX.length)}`
  }
  const days = streak(loadResults())
  return `Shadow #${puzzleNumber()} 🌑\n${stats}${days > 1 ? `\n🔥 ${days}-day streak` : ''}\n${base}`
}

export function WinModal() {
  const { solved, time, match, mode, seed, play } = useGame()
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)

  if (!solved || time === null) return null

  if (!open) {
    return (
      <button
        className="absolute top-20 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-1.5 text-sm font-medium text-slate-900 shadow-lg"
        onClick={() => setOpen(true)}
      >
        Results
      </button>
    )
  }

  const share = async () => {
    await navigator.clipboard.writeText(shareText(mode, seed, time, match))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const hours = Math.floor(msUntilTomorrow() / 3_600_000)
  const minutes = Math.floor((msUntilTomorrow() % 3_600_000) / 60_000)

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900/95 p-6 text-center shadow-2xl">
        <p className="text-xs tracking-widest text-amber-400 uppercase">
          {mode === 'daily' ? `Daily #${puzzleNumber()}` : 'Practice'} solved
        </p>
        <div className="my-5 grid grid-cols-2 gap-3">
          <div>
            <div className="font-mono text-3xl">{formatTime(time)}</div>
            <div className="text-xs text-slate-400">time</div>
          </div>
          <div>
            <div className="font-mono text-3xl">{Math.round(match * 100)}%</div>
            <div className="text-xs text-slate-400">match</div>
          </div>
        </div>
        {mode === 'daily' && (
          <p className="mb-5 text-sm text-slate-400">
            🔥 {streak(loadResults())}-day streak · next in {hours}h {minutes}m
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            className="rounded-full bg-amber-400 py-2 font-medium text-slate-900 hover:bg-amber-300"
            onClick={share}
          >
            {copied ? 'Copied!' : 'Share result'}
          </button>
          <button
            className="rounded-full border border-slate-700 py-2 text-slate-300 hover:border-slate-500"
            onClick={() => play('practice')}
          >
            {mode === 'daily' ? 'Play a random puzzle' : 'Another one'}
          </button>
          <button className="text-sm text-slate-500 hover:text-slate-300" onClick={() => setOpen(false)}>
            Admire it
          </button>
        </div>
      </div>
    </div>
  )
}
