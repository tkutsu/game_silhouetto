import { create } from 'zustand'
import { disposeShape } from '../lib/generateShape'
import type { Level } from '../lib/level'
import * as sound from '../lib/sound'
import { loadStats, saveStats } from '../lib/stats'

/** Seconds of celebration before the next puzzle loads. */
const ADVANCE_MS = 1600
const MUTE_KEY = 'silhouetto:muted'
const HELP_KEY = 'silhouetto:helpSeen'
// kept from the old practice mode so links shared before the redesign still open the same puzzle
const SEED_PREFIX = 'practice-'
export const MAX_SOLVES = 3
const MAX_DIFFICULTY = 12

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
  /** The countdown ran out and spent a Solve (or ended the run). */
  timedOut: boolean
  /** Points awarded for the last solve. */
  points: number
  score: number
  bestScore: number
  difficulty: number
  solvesLeft: number
  /** The Solve button is playing the moves back; the player's input is locked out. */
  autoSolving: boolean
  solvedCount: number
  sessionOver: boolean
  muted: boolean
  helpOpen: boolean
  openHelp: () => void
  closeHelp: () => void
  setLevel: (level: Level) => void
  setMatch: (match: number) => void
  begin: () => void
  solve: (match: number) => void
  autoSolve: () => void
  endRun: () => void
  restart: () => void
  toggleMute: () => void
}

const randomId = () => Math.random().toString(36).slice(2, 10)

function seedFor(difficulty: number, id = randomId()) {
  history.replaceState(null, '', `${location.pathname}?p=${difficulty}.${id}`)
  return `${SEED_PREFIX}${difficulty}.${id}`
}

/** Shared links: `?p=3.k2j4h` (difficulty.id) or a bare legacy id. */
function seedFromUrl(): { seed: string; difficulty: number } | null {
  const p = new URLSearchParams(location.search).get('p')
  if (!p) return null
  const m = p.match(/^(\d+)\.(.+)$/)
  const difficulty = m ? Math.max(1, Math.min(MAX_DIFFICULTY, Number(m[1]))) : 1
  return { seed: SEED_PREFIX + p, difficulty }
}

const parMs = (difficulty: number) => (12 + 8 * difficulty) * 1000

/** A lone object gives the fewest clues, so those puzzles get this much longer. */
const SINGLE_OBJECT_BONUS_MS = 20_000

/** The countdown per puzzle; running out spends a Solve. */
export const timeLimitFor = (level: Level) =>
  2 * parMs(level.difficulty) + (level.kinds.length === 1 ? SINGLE_OBJECT_BONUS_MS : 0)

/**
 * Faster than par earns more; par grows with difficulty so hard puzzles are
 * worth more even when they take a while.
 */
function pointsFor(difficulty: number, timeMs: number): number {
  const par = parMs(difficulty)
  const mult = Math.min(3, Math.max(0.25, par / Math.max(timeMs, 3000)))
  return Math.round(100 * difficulty * mult)
}

const shared = seedFromUrl()
const stats = loadStats()

/**
 * Visual state of the pitch, yaw and roll dials: each spring chases its committed turns,
 * so a dial's ring and knob turn in step with the piece. The blueprints advance them each
 * frame; a new level resets them. `hot` is the hovered or grabbed dial, -1 for none.
 */
export const dials = {
  hot: -1,
  springs: [0, 1, 2].map(() => ({ target: 0, angle: 0, vel: 0 })),
}

export const useGame = create<GameState>((set, get) => ({
  seed: shared?.seed ?? seedFor(1),
  level: null,
  match: 0,
  peak: 0,
  solved: false,
  startedAt: null,
  time: null,
  timedOut: false,
  points: 0,
  score: 0,
  bestScore: stats.bestScore,
  difficulty: shared?.difficulty ?? 1,
  solvesLeft: MAX_SOLVES,
  autoSolving: false,
  solvedCount: 0,
  sessionOver: false,
  muted: localStorage.getItem(MUTE_KEY) === '1',
  helpOpen: localStorage.getItem(HELP_KEY) !== '1',

  openHelp: () => set({ helpOpen: true }),
  closeHelp: () => {
    localStorage.setItem(HELP_KEY, '1')
    set({ helpOpen: false })
  },

  setLevel: (level) => {
    const old = get().level
    if (old && old !== level) {
      disposeShape(old)
      old.targetTexture.dispose()
    }
    set({
      level,
      solved: false,
      match: 0,
      peak: 0,
      startedAt: null,
      time: null,
      timedOut: false,
      points: 0,
      autoSolving: false,
    })
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
    const { startedAt, level, seed } = get()
    if (startedAt !== null || !level) return
    const started = performance.now()
    set({ startedAt: started })
    // the clock runs from the first touch; out of time spends a Solve, or ends the run without one
    setTimeout(() => {
      const s = get()
      if (s.seed !== seed || s.startedAt !== started || s.solved || s.autoSolving || s.sessionOver) return
      set({ timedOut: true })
      if (s.solvesLeft > 0) s.autoSolve()
      else s.endRun()
    }, timeLimitFor(level))
  },

  solve: (match) => {
    const { startedAt, difficulty, score, bestScore, solvedCount, seed, autoSolving } = get()
    const time = startedAt === null ? 0 : performance.now() - startedAt
    // a bought solve moves on to a fresh puzzle at the same level, for nothing
    const points = autoSolving ? 0 : pointsFor(difficulty, time)
    const total = score + points
    const best = Math.max(bestScore, total)
    if (best > bestScore) saveStats({ bestScore: best })
    if (!get().muted) sound.win()
    navigator.vibrate?.([20, 40, 30])
    set({
      solved: true,
      match,
      time,
      points,
      score: total,
      bestScore: best,
      solvedCount: autoSolving ? solvedCount : solvedCount + 1,
      difficulty: autoSolving ? difficulty : Math.min(difficulty + 1, MAX_DIFFICULTY),
    })
    setTimeout(() => {
      if (get().seed === seed && !get().sessionOver) set({ seed: seedFor(get().difficulty) })
    }, ADVANCE_MS)
  },

  autoSolve: () => {
    const { solvesLeft, solved, autoSolving, sessionOver, level } = get()
    if (solvesLeft === 0 || solved || autoSolving || sessionOver || !level) return
    get().begin()
    set({ solvesLeft: solvesLeft - 1, autoSolving: true })
  },

  endRun: () => set({ sessionOver: true }),

  restart: () => {
    set({
      score: 0,
      points: 0,
      solvedCount: 0,
      solvesLeft: MAX_SOLVES,
      difficulty: 1,
      sessionOver: false,
      seed: seedFor(1),
    })
  },

  toggleMute: () => {
    const muted = !get().muted
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    set({ muted })
  },
}))
