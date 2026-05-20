export interface Goal {
  text: string
  done: boolean
  doneAt?: number
  queued?: boolean
}

export function getActiveDateString(): string {
  const now = new Date()
  if (now.getHours() < 6) {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }
  return now.toISOString().split('T')[0]
}

export function getTomorrowDateString(): string {
  const now = new Date()
  if (now.getHours() < 6) {
    return now.toISOString().split('T')[0]
  }
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function storeGet(key: string): Goal[] | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : null
  } catch { return null }
}

export function storeSet(key: string, value: Goal[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent('goals-changed'))
}

export function storeDelete(key: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(key)
}

export function storeListKeys(prefix: string): string[] {
  if (typeof window === 'undefined') return []
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(prefix)) keys.push(k)
  }
  return keys
}

export function runRollover(activeDate: string): void {
  if (typeof window === 'undefined') return
  const allKeys = storeListKeys('goals:')
  for (const key of allKeys) {
    const date = key.replace('goals:', '')
    if (date >= activeDate) continue
    const goals = storeGet(key) ?? []
    const undone = goals.filter(g => !g.done)
    storeDelete(key)
    if (undone.length === 0) continue
    const todayGoals = storeGet(`goals:${activeDate}`) ?? []
    const existing = new Set(todayGoals.map(g => g.text))
    const toAdd = undone.filter(g => !existing.has(g.text))
    if (toAdd.length > 0) {
      localStorage.setItem(`goals:${activeDate}`, JSON.stringify([
        ...todayGoals,
        ...toAdd.map(g => ({ text: g.text, done: false })),
      ]))
    }
  }
}

export function loadStreak(): number {
  if (typeof window === 'undefined') return 0
  try {
    const saved = JSON.parse(localStorage.getItem('goal_streak_v1') ?? 'null') as {
      count: number; lastProcessedDate: string
    } | null
    let count = saved?.count ?? 0
    let lastProcessed = saved?.lastProcessedDate ?? ''
    const activeDate = getActiveDateString()

    const dates = storeListKeys('goals:')
      .map(k => k.replace('goals:', ''))
      .filter(d => d < activeDate)
      .sort()

    for (const date of dates) {
      if (date <= lastProcessed) continue
      const goals = storeGet(`goals:${date}`) ?? []
      if (goals.length === 0) { lastProcessed = date; continue }
      if (goals.every(g => g.done)) count++
      else count = 0
      lastProcessed = date
    }
    localStorage.setItem('goal_streak_v1', JSON.stringify({ count, lastProcessedDate: lastProcessed }))
    return count
  } catch { return 0 }
}
