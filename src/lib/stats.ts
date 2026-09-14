const STATS_KEY = 'silhouetto:stats'

export interface Stats {
  best: number | null
  solved: number
  /** Sum of solve times in ms, for the average. */
  totalTime: number
}

export function loadStats(): Stats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') as Partial<Stats>
    const solved = raw.solved ?? 0
    // saves from before the average existed have no total; seed it so the average starts at the best time
    const totalTime = raw.totalTime ?? (raw.best ?? 0) * solved
    return { best: raw.best ?? null, solved, totalTime }
  } catch {
    return { best: null, solved: 0, totalTime: 0 }
  }
}

export const saveStats = (stats: Stats) => localStorage.setItem(STATS_KEY, JSON.stringify(stats))

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
