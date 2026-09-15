const STATS_KEY = 'silhouetto:stats'

export interface Stats {
  bestScore: number
}

export function loadStats(): Stats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') as Partial<Stats>
    return { bestScore: raw.bestScore ?? 0 }
  } catch {
    return { bestScore: 0 }
  }
}

export const saveStats = (stats: Stats) => localStorage.setItem(STATS_KEY, JSON.stringify(stats))

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
