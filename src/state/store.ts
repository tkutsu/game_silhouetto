import { create } from 'zustand'
import type { Level } from '../lib/level'
import * as sound from '../lib/sound'
import { loadStats, saveStats } from '../lib/stats'

/** Seconds of celebration before the next puzzle loads. */
const ADVANCE_MS = 1600
const MUTE_KEY = 'silhouetto:muted'
// kept from the old practice mode so links shared before the redesign still open the same puzzle
const SEED_PREFIX = 'practice-'

interface GameState {
  seed: string
  level: Level | null
  match: number
  /** Highest closeness step reached on this puzzle; each new one gets a chime. */
  peak: number
  solved: boolean
  startedAt: number | null
  /** Final solve time in ms. */
  time: number | null
  newBest: boolean
  best: number | null
  solvedCount: number
  muted: boolean
  didTumble: boolean
  didSpin: boolean
  markTumble: () => void
  markSpin: () => void
  setLevel: (level: Level) => void
  setMatch: (match: number) => void
  begin: () => void
  solve: (match: number) => void
  next: () => void
  toggleMute: () => void
}

const randomId = () => Math.random().toString(36).slice(2, 10)

function seedFromUrl(id: string) {
  history.replaceState(null, '', `${location.pathname}?p=${id}`)
  return SEED_PREFIX + id
}

const stats = loadStats()

export const useGame = create<GameState>((set, get) => ({
  seed: seedFromUrl(new URLSearchParams(location.search).get('p') ?? randomId()),
  level: null,
  match: 0,
  peak: 0,
  solved: false,
  startedAt: null,
  time: null,
  newBest: false,
  best: stats.best,
  solvedCount: stats.solved,
  muted: localStorage.getItem(MUTE_KEY) === '1',
  didTumble: false,
  didSpin: false,

  markTumble: () => {
    if (!get().didTumble) set({ didTumble: true })
  },
  markSpin: () => {
    if (!get().didSpin) set({ didSpin: true })
  },

  setLevel: (level) => {
    const old = get().level
    if (old && old !== level) {
      old.geometry.dispose()
      old.targetTexture.dispose()
    }
    set({ level, solved: false, match: 0, peak: 0, startedAt: null, time: null, newBest: false })
  },

  setMatch: (match) => {
    const step = Math.floor((match - 0.4) / 0.05)
    if (step > get().peak && get().startedAt !== null) {
      if (!get().muted) sound.closer(step)
      navigator.vibrate?.(8)
      set({ match, peak: step })
    } else {
      set({ match })
    }
  },

  begin: () => {
    if (get().startedAt === null) set({ startedAt: performance.now() })
  },

  solve: (match) => {
    const { startedAt, best, solvedCount, seed } = get()
    const time = startedAt === null ? 0 : performance.now() - startedAt
    const newBest = best === null || time < best
    const next = { best: newBest ? time : best, solved: solvedCount + 1 }
    saveStats(next)
    if (!get().muted) sound.win()
    navigator.vibrate?.([20, 40, 30])
    set({ solved: true, match, time, newBest, best: next.best, solvedCount: next.solved })
    setTimeout(() => {
      if (get().seed === seed) get().next()
    }, ADVANCE_MS)
  },

  next: () => {
    set({ seed: seedFromUrl(randomId()) })
  },

  toggleMute: () => {
    const muted = !get().muted
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    set({ muted })
  },
}))
