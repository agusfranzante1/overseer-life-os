'use client'
/**
 * Snapshots manuales del task manager — antes de probar cambios riesgosos
 * o de migrar a otro dispositivo, el user clickea "Guardar ahora" y se
 * arma una copia local + remota de TODOS los proyectos y tareas. Si algo
 * rompe, "Cargar última versión" restaura el snapshot más reciente.
 *
 * - Local: localStorage vía zustand persist (sobrevive a reloads).
 * - Remota: tabla `task_snapshots` en Supabase (sobrevive a perder el
 *   browser). El sync es manual — no hay auto-push como tasks/projects,
 *   porque el punto es justamente tener un punto fijo controlado por el
 *   user.
 *
 * Cada snapshot tiene: id, createdAt, label, projects (full map),
 * tasks (full map). El restore reemplaza ambos maps en tasksStore.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, Task } from '@/types'
import { useTasksStore } from './tasksStore'
import { getSupabaseBrowser } from '@/lib/supabase/client'
const getSupabase = getSupabaseBrowser

export interface TaskSnapshot {
  id: string
  createdAt: string
  label?: string
  projects: Record<string, Project>
  tasks: Record<string, Task>
}

interface State {
  snapshots: TaskSnapshot[]
  /** Capacidad máxima — anti-bloat. El más viejo se descarta cuando se
   *  agrega uno nuevo. Suficiente para tener varios puntos de restore. */
  maxLocal: number
}

interface Actions {
  /** Captura el estado actual de projects + tasks en un nuevo snapshot.
   *  Lo persiste local Y lo sube a Supabase si el user está logueado. */
  saveNow: (label?: string) => Promise<TaskSnapshot>
  /** Restaura el snapshot pasado por id. Reemplaza projects + tasks en
   *  tasksStore. NO toca otros stores. */
  restore: (snapshotId: string) => boolean
  /** Borra un snapshot local + remoto. */
  remove: (snapshotId: string) => Promise<void>
  /** Pull desde Supabase — mergea con los locales por id. Útil al
   *  reabrir la app en otro device. */
  pullRemote: () => Promise<number>
}

function genId() {
  return 'snap_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
}

export const useTaskSnapshotsStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      snapshots: [],
      maxLocal: 10,

      saveNow: async (label) => {
        const { projects, tasks } = useTasksStore.getState()
        const snap: TaskSnapshot = {
          id: genId(),
          createdAt: new Date().toISOString(),
          label: label?.trim() || undefined,
          // Deep-clone vía JSON para que mutaciones futuras no contaminen.
          projects: JSON.parse(JSON.stringify(projects)),
          tasks: JSON.parse(JSON.stringify(tasks)),
        }
        set((s) => {
          const next = [snap, ...s.snapshots]
          if (next.length > s.maxLocal) next.length = s.maxLocal
          return { snapshots: next }
        })
        // Subida remota — fire-and-forget; si el user no está logueado
        // no pasa nada, queda solo local.
        try {
          const sb = getSupabase()
          const { data: u } = await sb.auth.getUser()
          if (u?.user) {
            await sb.from('task_snapshots').insert({
              id: snap.id,
              user_id: u.user.id,
              label: snap.label ?? null,
              payload: { projects: snap.projects, tasks: snap.tasks },
              created_at: snap.createdAt,
            })
          }
        } catch (err) {
          console.warn('[snapshots] remote save failed (local OK):', err)
        }
        return snap
      },

      restore: (snapshotId) => {
        const snap = get().snapshots.find((s) => s.id === snapshotId)
        if (!snap) return false
        // Reemplazo bruto — la idea es exactamente volver al punto guardado.
        useTasksStore.setState({
          projects: JSON.parse(JSON.stringify(snap.projects)),
          tasks: JSON.parse(JSON.stringify(snap.tasks)),
        })
        return true
      },

      remove: async (snapshotId) => {
        set((s) => ({ snapshots: s.snapshots.filter((x) => x.id !== snapshotId) }))
        try {
          const sb = getSupabase()
          const { data: u } = await sb.auth.getUser()
          if (u?.user) {
            await sb.from('task_snapshots').delete().eq('id', snapshotId).eq('user_id', u.user.id)
          }
        } catch (err) {
          console.warn('[snapshots] remote delete failed:', err)
        }
      },

      pullRemote: async () => {
        try {
          const sb = getSupabase()
          const { data: u } = await sb.auth.getUser()
          if (!u?.user) return 0
          const { data, error } = await sb
            .from('task_snapshots')
            .select('id, label, payload, created_at')
            .eq('user_id', u.user.id)
            .order('created_at', { ascending: false })
            .limit(get().maxLocal)
          if (error) throw error
          const remote: TaskSnapshot[] = (data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            createdAt: r.created_at as string,
            label: (r.label as string | null) ?? undefined,
            projects: (r.payload as { projects: Record<string, Project> }).projects ?? {},
            tasks: (r.payload as { tasks: Record<string, Task> }).tasks ?? {},
          }))
          // Merge por id — local gana en caso de duplicado.
          set((s) => {
            const byId = new Map<string, TaskSnapshot>()
            for (const r of remote) byId.set(r.id, r)
            for (const l of s.snapshots) byId.set(l.id, l)
            const merged = Array.from(byId.values()).sort(
              (a, b) => b.createdAt.localeCompare(a.createdAt),
            )
            merged.length = Math.min(merged.length, s.maxLocal)
            return { snapshots: merged }
          })
          return remote.length
        } catch (err) {
          console.warn('[snapshots] pullRemote failed:', err)
          return 0
        }
      },
    }),
    {
      name: 'overseer-task-snapshots',
      partialize: (s) => ({ snapshots: s.snapshots, maxLocal: s.maxLocal }),
    },
  ),
)
