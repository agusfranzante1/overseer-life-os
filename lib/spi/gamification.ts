import type { SPISession } from './types'

/** XP earned by closing a single SPI session. Components:
 *
 *  - 100 XP base for closing the session at all (showing up wins).
 *  - Score bonus: scaled by the auto-computed 0-100 score.
 *      ≥90 → +100, ≥80 → +60, ≥70 → +30, ≥50 → +10
 *  - Mood bonus: high mood = good week.
 *      mood 9-10 → +30, mood 7-8 → +15
 *  - Task bonus: +5 XP per Pareto-flagged task that got linked
 *    (the more weighty tasks you committed to the manager, the more).
 *
 *  Returns the total + a breakdown for the celebration UI to display. */
export interface SessionXP {
  base: number
  scoreBonus: number
  moodBonus: number
  taskBonus: number
  total: number
}

export function computeSessionXP(session: SPISession): SessionXP {
  const base = 100

  const score = session.score ?? 0
  const scoreBonus = score >= 90 ? 100 : score >= 80 ? 60 : score >= 70 ? 30 : score >= 50 ? 10 : 0

  const mood = session.mood ?? 0
  const moodBonus = mood >= 9 ? 30 : mood >= 7 ? 15 : 0

  const paretoLinked = session.tasks.filter((t) => t.important && !!t.linkedTaskId).length
  const taskBonus = paretoLinked * 5

  return {
    base,
    scoreBonus,
    moodBonus,
    taskBonus,
    total: base + scoreBonus + moodBonus + taskBonus,
  }
}

/** Sum of XP across all closed sessions. */
export function totalXPFromSessions(sessions: SPISession[]): number {
  return sessions
    .filter((s) => !!s.closedAt)
    .reduce((acc, s) => acc + computeSessionXP(s).total, 0)
}

/** Quadratic levelling: each level costs 100 more XP than the previous.
 *
 *  Level 1 → 100 XP
 *  Level 2 → 400 XP   (cumulative)
 *  Level 3 → 900 XP
 *  Level 4 → 1600 XP
 *  Level N → N² × 100 XP
 *
 *  Steep enough that consistency matters; gentle enough that early
 *  levels feel rewarding. */
export function levelFromXP(xp: number): {
  level: number
  currentLevelXP: number   // XP earned within the current level
  nextLevelXP: number      // XP needed to reach next level
  progress: number         // 0-1
} {
  if (xp <= 0) return { level: 0, currentLevelXP: 0, nextLevelXP: 100, progress: 0 }
  const level = Math.floor(Math.sqrt(xp / 100))
  const levelStart = level * level * 100
  const nextStart = (level + 1) * (level + 1) * 100
  const inLevel = xp - levelStart
  const span = nextStart - levelStart
  return {
    level,
    currentLevelXP: inLevel,
    nextLevelXP: span,
    progress: inLevel / span,
  }
}

/** Returns true if closing `closedSession` (already with its XP applied)
 *  would have caused the user to cross into a new level vs the state
 *  BEFORE the close. Used by the UI to decide whether to show the
 *  level-up celebration. */
export function didLevelUp(beforeXP: number, afterXP: number): boolean {
  return levelFromXP(afterXP).level > levelFromXP(beforeXP).level
}

/** Title shown next to the level number. Mostly flavor — keeps progression
 *  feeling like something. */
export function titleForLevel(level: number): string {
  if (level === 0) return 'Iniciado'
  if (level <= 2) return 'Aprendiz'
  if (level <= 4) return 'Operador'
  if (level <= 7) return 'Practicante'
  if (level <= 10) return 'Estratega'
  if (level <= 14) return 'Arquitecto'
  if (level <= 19) return 'Maestro'
  if (level <= 25) return 'Sabio'
  return 'Leyenda'
}
