const EPOCH = new Date(2026, 8, 14)
const DAY = 86_400_000
const RESULTS_KEY = 'shadow:results'

export interface Result {
  time: number
  match: number
}

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const puzzleNumber = (d = new Date()) => Math.round((midnight(d).getTime() - EPOCH.getTime()) / DAY) + 1

export const msUntilTomorrow = (d = new Date()) => midnight(d).getTime() + DAY - d.getTime()

export function loadResults(): Record<string, Result> {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? '{}') as Record<string, Result>
  } catch {
    return {}
  }
}

export function saveResult(key: string, result: Result) {
  localStorage.setItem(RESULTS_KEY, JSON.stringify({ ...loadResults(), [key]: result }))
}

export function streak(results: Record<string, Result>, today = new Date()): number {
  const d = midnight(today)
  if (!results[dateKey(d)]) d.setDate(d.getDate() - 1)
  let n = 0
  while (results[dateKey(d)]) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
