export type Language = 'en' | 'es'

export type DayType =
  | 'deep_work'
  | 'admin'
  | 'recovery'
  | 'legs_day'
  | 'trading'
  | 'content'

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Impact = 'low' | 'medium' | 'high' | 'critical'
export type StatusType = 'active' | 'done' | 'paused'

export interface CustomStatus {
  id: string
  label: string
  color: string
  order: number
  countsAsDone: boolean
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
  status: string
  order: number
  notes?: string
  priority?: Priority
  /** ID of parent subtask (for grouping). Only 1 level of nesting allowed. */
  parentId?: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  description?: string
  status: string
  priority: Priority
  importance: Impact
  dueDate?: string
  energyEstimate?: number
  notes?: string
  subtasks: Subtask[]
  createdAt: string
  scheduledFor?: 'today' | 'tomorrow'
  completedAt?: string
  updatedAt: string
  postponedCount?: number
  category?: string
}

export interface Project {
  id: string
  name: string
  color: string
  icon?: string
  description?: string
  statuses: CustomStatus[]
  taskIds: string[]
  createdAt: string
  archived: boolean
}

export interface MetricEntry {
  focus: number
  energy: number
  sleep: number
  stress: number
  steps: number
  wakeTime: string
  sleepDebt: number
  workload: number
}

export interface ChatActionCard {
  type: 'confirm_task' | 'confirm_move' | 'confirm_postpone' | 'ask_project' | 'plan_2h'
  payload: Record<string, unknown>
  confirmed?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  actionCard?: ChatActionCard
}

export interface DayData {
  date: string
  dayType?: DayType
  energyScore: number
  focusScore: number
  progressScore: number
  notes?: string
}

export interface Memory {
  id: string
  title: string
  content: string
  category: string
  createdAt: string
  updatedAt: string
}

export interface FrictionLog {
  id: string
  taskId?: string
  projectId?: string
  type: string
  description: string
  createdAt: string
}
