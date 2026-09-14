const STATS_KEY = 'silhouetto:stats'

export interface Stats {
  best: number | null
  solved: number
}

export function loadStats(): Stats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') as Partial<Stats>
    return { best: raw.best ?? null, solved: raw.solved ?? 0 }
  } catch {
    return { best: null, solved: 0 }
  }
}

export const saveStats = (stats: Stats) => localStorage.setItem(STATS_KEY, JSON.stringify(stats))

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
