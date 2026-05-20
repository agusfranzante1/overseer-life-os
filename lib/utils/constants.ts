import { DayType, Priority, Impact, CustomStatus } from '@/types'

export const METRIC_COLORS: Record<string, string> = {
  focus: '#6366f1',
  energy: '#f59e0b',
  sleep: '#3b82f6',
  stress: '#ef4444',
  steps: '#10b981',
  wakeTime: '#8b5cf6',
  sleepDebt: '#f97316',
  workload: '#ec4899',
}

export const DAY_TYPE_CONFIG: Record<DayType, { color: string; icon: string }> = {
  deep_work: { color: '#6366f1', icon: 'Brain' },
  admin: { color: '#94a3b8', icon: 'Briefcase' },
  recovery: { color: '#10b981', icon: 'Heart' },
  legs_day: { color: '#f59e0b', icon: 'Dumbbell' },
  trading: { color: '#3b82f6', icon: 'TrendingUp' },
  content: { color: '#ec4899', icon: 'Camera' },
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: '#6b7280',
  medium: '#f59e0b',
  high: '#f97316',
  urgent: '#ef4444',
}

export const IMPACT_COLORS: Record<Impact, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#6366f1',
  critical: '#ec4899',
}

export const PROJECT_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899',
  '#f97316', '#8b5cf6', '#14b8a6', '#ef4444', '#84cc16',
]

export const DEFAULT_STATUSES: CustomStatus[] = [
  { id: 's1', label: 'To Do', color: '#6b7280', order: 0, countsAsDone: false },
  { id: 's2', label: 'In Progress', color: '#f59e0b', order: 1, countsAsDone: false },
  { id: 's3', label: 'Done', color: '#10b981', order: 2, countsAsDone: true },
  { id: 's4', label: 'Paused', color: '#6366f1', order: 3, countsAsDone: false },
  { id: 's5', label: 'Postponed', color: '#94a3b8', order: 4, countsAsDone: false },
]

export const DEFAULT_STATUSES_ES: CustomStatus[] = [
  { id: 's1', label: 'Hacer', color: '#6b7280', order: 0, countsAsDone: false },
  { id: 's2', label: 'Haciendo', color: '#f59e0b', order: 1, countsAsDone: false },
  { id: 's3', label: 'Hecho', color: '#10b981', order: 2, countsAsDone: true },
  { id: 's4', label: 'Pausado', color: '#6366f1', order: 3, countsAsDone: false },
  { id: 's5', label: 'Pospuesto', color: '#94a3b8', order: 4, countsAsDone: false },
]
