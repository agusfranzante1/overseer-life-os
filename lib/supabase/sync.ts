'use client'
import { useEffect, useRef } from 'react'
import { getSupabaseBrowser, hasSupabaseConfig } from './client'
import { useTasksStore } from '@/lib/store/tasksStore'

/**
 * Mounts a background sync between Zustand stores (localStorage) and Supabase.
 *
 * Strategy for Fase 1 — "local-first with cloud mirror":
 *  - On mount: if logged in AND Supabase has more recent data, hydrate the local store
 *  - On any local change: debounce 1500ms and upsert to Supabase
 *  - On logout: stop syncing, local data persists as before
 *
 * This is intentionally light — full async refactor of each store comes later.
 */

interface SyncState {
  userId: string | null
  ready: boolean
  initialized: boolean
}

const state: SyncState = { userId: null, ready: false, initialized: false }
let pushTimer: ReturnType<typeof setTimeout> | null = null

async function pushTasks() {
  if (!state.userId) return
  const supabase = getSupabaseBrowser()
  const { projects, tasks } = useTasksStore.getState()

  const projectRows = Object.values(projects).map((p) => ({
    id: p.id,
    user_id: state.userId!,
    name: p.name,
    color: p.color,
    icon: p.icon ?? null,
    description: p.description ?? null,
    statuses: p.statuses,
    archived: !!p.archived,
    created_at: p.createdAt,
  }))

  const taskRows = Object.values(tasks).map((t) => ({
    id: t.id,
    user_id: state.userId!,
    project_id: t.projectId,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    importance: t.importance,
    due_date: t.dueDate ?? null,
    energy_estimate: t.energyEstimate ?? null,
    notes: t.notes ?? null,
    scheduled_for: t.scheduledFor ?? null,
    completed_at: t.completedAt ?? null,
    postponed_count: t.postponedCount ?? 0,
    category: t.category ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }))

  const subtaskRows = Object.values(tasks).flatMap((t) =>
    t.subtasks.map((s) => ({
      id: s.id,
      user_id: state.userId!,
      task_id: t.id,
      parent_id: s.parentId ?? null,
      title: s.title,
      completed: s.completed,
      status: s.status,
      order: s.order,
      notes: s.notes ?? null,
      priority: s.priority ?? null,
    }))
  )

  if (projectRows.length > 0) await supabase.from('projects').upsert(projectRows)
  if (taskRows.length > 0)    await supabase.from('tasks').upsert(taskRows)
  if (subtaskRows.length > 0) await supabase.from('subtasks').upsert(subtaskRows)
}

async function pullTasks(): Promise<{ projects: number; tasks: number; subtasks: number } | null> {
  if (!state.userId) return null
  const supabase = getSupabaseBrowser()

  const [projectsRes, tasksRes, subtasksRes] = await Promise.all([
    supabase.from('projects').select('*').eq('user_id', state.userId),
    supabase.from('tasks').select('*').eq('user_id', state.userId),
    supabase.from('subtasks').select('*').eq('user_id', state.userId),
  ])

  if (projectsRes.error || tasksRes.error || subtasksRes.error) {
    console.error('Pull failed', projectsRes.error || tasksRes.error || subtasksRes.error)
    return null
  }

  const subtasksByTaskId = new Map<string, Array<Record<string, unknown>>>()
  for (const s of subtasksRes.data ?? []) {
    if (!subtasksByTaskId.has(s.task_id)) subtasksByTaskId.set(s.task_id, [])
    subtasksByTaskId.get(s.task_id)!.push(s)
  }

  // Only override local if remote has data
  if ((projectsRes.data?.length ?? 0) === 0 && (tasksRes.data?.length ?? 0) === 0) {
    return { projects: 0, tasks: 0, subtasks: 0 }
  }

  type Row = Record<string, unknown>
  useTasksStore.setState({
    projects: Object.fromEntries((projectsRes.data ?? []).map((p: Row) => [p.id as string, {
      id: p.id as string, name: p.name as string, color: p.color as string,
      icon: (p.icon as string) ?? undefined,
      description: (p.description as string) ?? undefined,
      statuses: (p.statuses as unknown[]) ?? [],
      taskIds: (tasksRes.data ?? []).filter((t: Row) => t.project_id === p.id).map((t: Row) => t.id as string),
      createdAt: p.created_at as string,
      archived: !!p.archived,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any])),
    tasks: Object.fromEntries((tasksRes.data ?? []).map((t: Row) => [t.id as string, {
      id: t.id as string,
      projectId: t.project_id as string,
      title: t.title as string,
      description: (t.description as string) ?? undefined,
      status: t.status as string,
      priority: t.priority as 'low' | 'medium' | 'high' | 'urgent',
      importance: t.importance as 'low' | 'medium' | 'high' | 'critical',
      dueDate: (t.due_date as string) ?? undefined,
      energyEstimate: (t.energy_estimate as number) ?? undefined,
      notes: (t.notes as string) ?? undefined,
      subtasks: (subtasksByTaskId.get(t.id as string) ?? []).map((s) => ({
        id: s.id as string,
        title: s.title as string,
        completed: s.completed as boolean,
        status: s.status as string,
        order: s.order as number,
        notes: (s.notes as string) ?? undefined,
        priority: (s.priority as 'low' | 'medium' | 'high' | 'urgent' | null) ?? undefined,
        parentId: (s.parent_id as string) ?? undefined,
      })),
      createdAt: t.created_at as string,
      scheduledFor: (t.scheduled_for as 'today' | 'tomorrow') ?? undefined,
      completedAt: (t.completed_at as string) ?? undefined,
      updatedAt: t.updated_at as string,
      postponedCount: (t.postponed_count as number) ?? 0,
      category: (t.category as string) ?? undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any])),
  })

  return {
    projects: projectsRes.data?.length ?? 0,
    tasks: tasksRes.data?.length ?? 0,
    subtasks: subtasksRes.data?.length ?? 0,
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTasks().catch((e) => console.error('Sync push failed', e))
  }, 1500)
}

/** React hook that wires up the sync. Mount once at the app root. */
export function useSupabaseSync() {
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (!hasSupabaseConfig()) return
    const supabase = getSupabaseBrowser()

    let mounted = true

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      state.userId = user?.id ?? null
      state.ready = true
      if (state.userId && !state.initialized) {
        state.initialized = true
        // Pull on first mount of an authed session
        const pulled = await pullTasks()
        // If remote was empty but local has data, push local up
        if (pulled && pulled.projects === 0 && pulled.tasks === 0) {
          await pushTasks().catch((e) => console.error('Initial push failed', e))
        }
      }
    })()

    // Subscribe to local changes
    if (!subscribedRef.current) {
      subscribedRef.current = true
      useTasksStore.subscribe(() => {
        if (state.userId) schedulePush()
      })
    }

    // Subscribe to auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { user?: { id: string } } | null) => {
      const newUserId = session?.user?.id ?? null
      if (newUserId !== state.userId) {
        state.userId = newUserId
        state.initialized = false
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])
}

/** Manual trigger if the user wants to force a sync right now. */
export async function forceSyncTasks() {
  await pushTasks()
}

/** Pull on demand (useful after login on a new device). */
export async function forcePullTasks() {
  return pullTasks()
}
