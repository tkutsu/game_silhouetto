import { create } from 'zustand'
import { dateKey, loadResults, saveResult } from '../lib/daily'
import type { Level } from '../lib/level'

type Mode = 'daily' | 'practice'

interface GameState {
  mode: Mode
  seed: string
  level: Level | null
  match: number
  solved: boolean
  startedAt: number | null
  /** Final solve time in ms. */
  time: number | null
  didTumble: boolean
  didSpin: boolean
  markTumble: () => void
  markSpin: () => void
  setLevel: (level: Level) => void
  setMatch: (match: number) => void
  begin: () => void
  solve: (match: number) => void
  play: (mode: Mode) => void
}

export const PRACTICE_PREFIX = 'practice-'

const seedFor = (mode: Mode) =>
  mode === 'daily' ? `daily-${dateKey()}` : PRACTICE_PREFIX + Math.random().toString(36).slice(2, 10)

const sharedSeed = new URLSearchParams(location.search).get('p')
const dailyDone = () => Boolean(loadResults()[dateKey()])

export const useGame = create<GameState>((set, get) => ({
  mode: sharedSeed || dailyDone() ? 'practice' : 'daily',
  seed: sharedSeed ? PRACTICE_PREFIX + sharedSeed : dailyDone() ? seedFor('practice') : seedFor('daily'),
  level: null,
  match: 0,
  solved: false,
  startedAt: null,
  time: null,
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
    set({ level, solved: false, match: 0, startedAt: null, time: null })
  },

  setMatch: (match) => set({ match }),

  begin: () => {
    if (get().startedAt === null) set({ startedAt: performance.now() })
  },

  solve: (match) => {
    const { startedAt, mode } = get()
    const time = startedAt === null ? 0 : performance.now() - startedAt
    set({ solved: true, match, time })
    if (mode === 'daily') saveResult(dateKey(), { time, match })
  },

  play: (mode) => {
    const { level } = get()
    level?.geometry.dispose()
    level?.targetTexture.dispose()
    history.replaceState(null, '', location.pathname)
    set({ mode, seed: seedFor(mode), level: null })
  },
}))
