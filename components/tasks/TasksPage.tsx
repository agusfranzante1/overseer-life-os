'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { Task, Project } from '@/types'
import { TaskCard } from './TaskCard'
import { TaskDetail } from './TaskDetail'
import { BreakdownModal } from './BreakdownModal'
import {
  Plus, FolderOpen, X, ChevronDown, ChevronRight, ChevronLeft, Filter, Wand2, LayoutList, Columns3,
} from 'lucide-react'
import { PROJECT_COLORS } from '@/lib/utils/constants'

function ProjectForm({ onAdd, onClose, t }: {
  onAdd: (name: string, description?: string) => void
  onClose: () => void
  t: (k: string) => string
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim(), desc.trim() || undefined); onClose() } }}
      className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 space-y-3"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('tasks.projectName')}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder={`${t('tasks.description')} (${t('common.optional')})`}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-300 px-3 py-1.5">
          {t('common.cancel')}
        </button>
        <button type="submit" className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors">
          {t('tasks.create')}
        </button>
      </div>
    </form>
  )
}

function NewTaskForm({ projectId, statuses, onAdd, onClose, t }: {
  projectId: string
  statuses: { id: string; label: string }[]
  onAdd: (title: string, projectId: string, status: string) => void
  onClose: () => void
  t: (k: string) => string
}) {
  const [title, setTitle] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim()) {
          onAdd(title.trim(), projectId, statuses[0]?.label ?? 'To Do')
          onClose()
        }
      }}
      className="flex items-center gap-2 mt-2"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('tasks.taskTitle')}
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      />
      <button type="submit" className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors">
        {t('tasks.create')}
      </button>
      <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
        <X className="w-4 h-4" />
      </button>
    </form>
  )
}

type KanbanSort = 'priority' | 'priorityAsc' | 'dueDate' | 'alphabetical' | 'newest' | 'oldest' | 'manual'

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function sortTasks(tasks: Task[], mode: KanbanSort): Task[] {
  const arr = [...tasks]
  switch (mode) {
    case 'priority':
      return arr.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))
    case 'priorityAsc':
      return arr.sort((a, b) => (PRIORITY_RANK[b.priority] ?? 9) - (PRIORITY_RANK[a.priority] ?? 9))
    case 'dueDate':
      return arr.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      })
    case 'alphabetical':
      return arr.sort((a, b) => a.title.localeCompare(b.title))
    case 'newest':
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'oldest':
      return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    case 'manual':
    default:
      return arr
  }
}

export function TasksPage() {
  const { projects, tasks, selectedProjectId, setSelectedProject, addProject, addTask } = useTasksStore()
  const { t } = useTranslation()
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [newTaskProjectId, setNewTaskProjectId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showBreakdown, setShowBreakdown] = useState<{ task?: Task | null } | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'list'
    return (localStorage.getItem('overseer-tasks-view') as 'list' | 'kanban') ?? 'list'
  })
  const changeView = (v: 'list' | 'kanban') => {
    setViewMode(v)
    if (typeof window !== 'undefined') localStorage.setItem('overseer-tasks-view', v)
  }

  const [sortMode, setSortMode] = useState<KanbanSort>(() => {
    if (typeof window === 'undefined') return 'priority'
    return (localStorage.getItem('overseer-tasks-kanban-sort') as KanbanSort) ?? 'priority'
  })
  const changeSort = (s: KanbanSort) => {
    setSortMode(s)
    if (typeof window !== 'undefined') localStorage.setItem('overseer-tasks-kanban-sort', s)
  }

  const [projectsPanelCollapsed, setProjectsPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('overseer-tasks-projects-collapsed') === '1'
  })
  const toggleProjectsPanel = () => {
    const next = !projectsPanelCollapsed
    setProjectsPanelCollapsed(next)
    if (typeof window !== 'undefined') localStorage.setItem('overseer-tasks-projects-collapsed', next ? '1' : '0')
  }
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const projectList = Object.values(projects).filter((p) => !p.archived)
  const activeProject = selectedProjectId ? projects[selectedProjectId] : null

  const getProjectTasks = (projectId: string) => {
    return Object.values(tasks).filter((t) => t.projectId === projectId)
  }

  const passesFilters = (t: typeof tasks[string]) =>
    (statusFilter ? t.status === statusFilter : true) &&
    (priorityFilter ? t.priority === priorityFilter : true) &&
    (categoryFilter ? (t.category ?? '') === categoryFilter : true)

  const displayedTasks = (activeProject
    ? getProjectTasks(activeProject.id)
    : Object.values(tasks)
  ).filter(passesFilters)

  // All distinct categories used across (this project | all projects), for the filter dropdown
  const availableCategories = Array.from(new Set(
    (activeProject ? getProjectTasks(activeProject.id) : Object.values(tasks))
      .map((t) => t.category)
      .filter((c): c is string => !!c && c.trim().length > 0)
  )).sort()

  const toggleExpand = (id: string) =>
    setExpandedProjects((p) => ({ ...p, [id]: !p[id] }))

  const handleAddTask = (title: string, projectId: string, status: string) => {
    addTask({
      title,
      projectId,
      status,
      priority: 'medium',
      importance: 'medium',
      subtasks: [],
      scheduledFor: 'today',
    })
  }

  const selectedTaskProject = selectedTask ? projects[selectedTask.projectId] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-[calc(100vh-60px)] overflow-hidden"
    >
      {/* Sidebar: Projects — collapsible */}
      {projectsPanelCollapsed ? (
        <div className="w-10 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col items-center pt-4 gap-2">
          <button
            onClick={toggleProjectsPanel}
            title="Mostrar proyectos"
            className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {/* Project color dots — quick switcher */}
          <div className="flex flex-col gap-1.5 mt-3">
            <button onClick={() => setSelectedProject(null)} title={t('tasks.allProjects')}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                !selectedProjectId ? 'bg-zinc-800' : 'hover:bg-zinc-900'
              }`}>
              <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            </button>
            {projectList.map((proj) => (
              <button key={proj.id} onClick={() => setSelectedProject(proj.id)}
                title={proj.name}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  selectedProjectId === proj.id ? 'ring-2 ring-white/40' : 'hover:bg-zinc-900'
                }`}
                style={{ backgroundColor: `${proj.color}22` }}>
                <span className="text-[13px] font-bold leading-none" style={{ color: proj.color }}>
                  {proj.name.trim().charAt(0).toUpperCase() || '·'}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
      <div className="w-64 shrink-0 border-r border-zinc-800 overflow-y-auto bg-zinc-950 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={toggleProjectsPanel} title="Ocultar panel"
              className="text-zinc-600 hover:text-zinc-200">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {t('tasks.projects')}
            </h2>
          </div>
          <button
            onClick={() => setShowProjectForm(!showProjectForm)}
            className="text-zinc-500 hover:text-indigo-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showProjectForm && (
          <div className="mb-3">
            <ProjectForm
              onAdd={(name, desc) => addProject({ name, description: desc })}
              onClose={() => setShowProjectForm(false)}
              t={t}
            />
          </div>
        )}

        {/* All projects */}
        <button
          onClick={() => setSelectedProject(null)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${
            !selectedProjectId ? 'bg-indigo-600/20 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {t('tasks.allProjects')}
          <span className="ml-auto text-xs text-zinc-600">{Object.values(tasks).length}</span>
        </button>

        {projectList.map((proj) => {
          const taskCount = getProjectTasks(proj.id).length
          const doneCount = getProjectTasks(proj.id).filter((t) =>
            proj.statuses.find((s) => s.label === t.status)?.countsAsDone
          ).length
          const isActive = selectedProjectId === proj.id

          return (
            <div key={proj.id} className="mb-1">
              <div className="flex items-center group">
                <button
                  onClick={() => setSelectedProject(isActive ? null : proj.id)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: proj.color }} />
                  <span className="flex-1 text-left truncate">{proj.name}</span>
                  <span className="text-xs text-zinc-600">{doneCount}/{taskCount}</span>
                </button>
              </div>
            </div>
          )
        })}

        {projectList.length === 0 && !showProjectForm && (
          <p className="text-xs text-zinc-600 text-center py-4">{t('tasks.noProjects')}</p>
        )}
      </div>
      )}

      {/* Main: Tasks */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">
              {activeProject ? activeProject.name : t('tasks.title')}
            </h1>
            {activeProject?.description && (
              <p className="text-sm text-zinc-500 mt-0.5">{activeProject.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button onClick={() => changeView('list')}
                title="Vista lista"
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
                  viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
                }`}>
                <LayoutList className="w-3.5 h-3.5" /> Lista
              </button>
              <button onClick={() => changeView('kanban')}
                title="Vista Kanban"
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
                  viewMode === 'kanban' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
                }`}>
                <Columns3 className="w-3.5 h-3.5" /> Kanban
              </button>
            </div>

            {/* Kanban sort selector */}
            {viewMode === 'kanban' && (
              <select
                value={sortMode}
                onChange={(e) => changeSort(e.target.value as KanbanSort)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                title="Ordenar por"
              >
                <option value="priority">Prioridad ↓</option>
                <option value="priorityAsc">Prioridad ↑</option>
                <option value="dueDate">Fecha límite</option>
                <option value="alphabetical">Alfabético</option>
                <option value="newest">Más recientes</option>
                <option value="oldest">Más antiguas</option>
                <option value="manual">Sin orden (creación)</option>
              </select>
            )}

            {/* Filters — list view */}
            {viewMode === 'list' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Filter className="w-3.5 h-3.5 text-zinc-500" />

                {/* Status (only meaningful inside a project, since each project has its own statuses) */}
                {activeProject && (
                  <select
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value || null)}
                    title="Estado"
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Estado: todos</option>
                    {activeProject.statuses.map((s) => (
                      <option key={s.id} value={s.label}>{s.label}</option>
                    ))}
                  </select>
                )}

                {/* Priority / Urgencia — works in both views */}
                <select
                  value={priorityFilter ?? ''}
                  onChange={(e) => setPriorityFilter(e.target.value || null)}
                  title="Urgencia"
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Urgencia: toda</option>
                  <option value="urgent">Urgente</option>
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baja</option>
                </select>

                {/* Category / Tipo — dynamic, based on whatever categories exist in scope */}
                {availableCategories.length > 0 && (
                  <select
                    value={categoryFilter ?? ''}
                    onChange={(e) => setCategoryFilter(e.target.value || null)}
                    title="Tipo de tarea"
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Tipo: todos</option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}

                {(statusFilter || priorityFilter || categoryFilter) && (
                  <button
                    onClick={() => { setStatusFilter(null); setPriorityFilter(null); setCategoryFilter(null) }}
                    title="Limpiar filtros"
                    className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-200 px-2"
                  >
                    limpiar
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => setShowBreakdown({ task: null })}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/40 hover:border-indigo-400 text-indigo-300 rounded-lg text-sm font-bold transition-all"
              title="Pedile a la IA que desglose una tarea en sub-pasos"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Desglosar con IA
            </button>
            <button
              onClick={() => setNewTaskProjectId(activeProject?.id ?? projectList[0]?.id ?? null)}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('tasks.newTask')}
            </button>
          </div>
        </div>

        {newTaskProjectId && (
          <div className="mb-4">
            <NewTaskForm
              projectId={newTaskProjectId}
              statuses={projects[newTaskProjectId]?.statuses ?? []}
              onAdd={handleAddTask}
              onClose={() => setNewTaskProjectId(null)}
              t={t}
            />
          </div>
        )}

        {/* Task list */}
        {activeProject ? (
          viewMode === 'kanban' ? (
            <KanbanBoard
              project={activeProject}
              tasks={getProjectTasks(activeProject.id)}
              sortMode={sortMode}
              onTaskClick={(t) => setSelectedTask(t)}
            />
          ) : (
            // Single project list view
            <div className="space-y-2">
              {displayedTasks.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  <p>{t('tasks.noTasks')}</p>
                </div>
              ) : (
                displayedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    project={activeProject}
                    onClick={() => setSelectedTask(task)}
                  />
                ))
              )}
            </div>
          )
        ) : viewMode === 'kanban' ? (
          <AllProjectsKanban
            projects={projectList}
            tasks={Object.values(tasks)}
            sortMode={sortMode}
            onTaskClick={(tk) => setSelectedTask(tk)}
          />
        ) : (
          // All projects grouped view
          <div className="space-y-6">
            {projectList.map((proj) => {
              const projTasks = getProjectTasks(proj.id)
              const expanded = expandedProjects[proj.id] !== false
              const done = projTasks.filter((t) =>
                proj.statuses.find((s) => s.label === t.status)?.countsAsDone
              ).length

              return (
                <div key={proj.id}>
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      onClick={() => toggleExpand(proj.id)}
                      className="flex items-center gap-2 flex-1"
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: proj.color }} />
                      <span className="text-sm font-semibold text-zinc-300">{proj.name}</span>
                      <span className="text-xs text-zinc-600">{done}/{projTasks.length}</span>
                      {expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
                    </button>
                    <button
                      onClick={() => setNewTaskProjectId(proj.id)}
                      className="text-zinc-600 hover:text-indigo-400 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {newTaskProjectId === proj.id && (
                    <div className="mb-3">
                      <NewTaskForm
                        projectId={proj.id}
                        statuses={proj.statuses}
                        onAdd={handleAddTask}
                        onClose={() => setNewTaskProjectId(null)}
                        t={t}
                      />
                    </div>
                  )}

                  <AnimatePresence>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="space-y-2 overflow-hidden"
                      >
                        {projTasks.length === 0 ? (
                          <p className="text-xs text-zinc-600 pl-5">{t('tasks.noTasks')}</p>
                        ) : (
                          projTasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              project={proj}
                              onClick={() => setSelectedTask(task)}
                            />
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Task detail drawer */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          project={selectedTaskProject}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* AI Breakdown modal */}
      <AnimatePresence>
        {showBreakdown && (
          <BreakdownModal
            initialTask={showBreakdown.task ?? null}
            onClose={() => setShowBreakdown(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Kanban for a single project ─────────────────────────────────────────────

function KanbanBoard({ project, tasks, sortMode, onTaskClick }: { project: Project; tasks: Task[]; sortMode: KanbanSort; onTaskClick: (t: Task) => void }) {
  const { updateTask } = useTasksStore()
  const [dragId, setDragId] = useState<string | null>(null)
  const columns = project.statuses.slice().sort((a, b) => a.order - b.order)

  const tasksByStatus = (label: string) => sortTasks(tasks.filter((t) => t.status === label), sortMode)

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {columns.map((col) => {
          const colTasks = tasksByStatus(col.label)
          return (
            <div key={col.id}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId) {
                  updateTask(dragId, { status: col.label })
                  setDragId(null)
                }
              }}
              className="w-72 shrink-0 bg-zinc-950/60 border border-zinc-800 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</h3>
                </div>
                <span className="text-[10px] font-mono text-zinc-600">{colTasks.length}</span>
              </div>
              <div className="space-y-2">
                {colTasks.length === 0 ? (
                  <p className="text-[10px] text-zinc-700 text-center py-4 italic">drop here</p>
                ) : (
                  colTasks.map((task) => (
                    <div key={task.id}
                      draggable
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => setDragId(null)}
                      style={{ opacity: dragId === task.id ? 0.4 : 1, cursor: 'grab' }}>
                      <TaskCard task={task} project={project} onClick={() => onTaskClick(task)} />
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Kanban for ALL projects — groups by globally-shared status name ──────────

function AllProjectsKanban({ projects, tasks, sortMode, onTaskClick }: { projects: Project[]; tasks: Task[]; sortMode: KanbanSort; onTaskClick: (t: Task) => void }) {
  const { updateTask } = useTasksStore()
  const [dragId, setDragId] = useState<string | null>(null)

  // Aggregate ALL unique status labels across projects (case-insensitive merge)
  const uniqueStatuses = (() => {
    const seen = new Map<string, { label: string; color: string }>()
    for (const p of projects) {
      for (const s of p.statuses) {
        const key = s.label.toLowerCase()
        if (!seen.has(key)) seen.set(key, { label: s.label, color: s.color })
      }
    }
    return Array.from(seen.values())
  })()

  const tasksByStatus = (label: string) =>
    sortTasks(tasks.filter((t) => t.status.toLowerCase() === label.toLowerCase()), sortMode)

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {uniqueStatuses.map((col) => {
          const colTasks = tasksByStatus(col.label)
          return (
            <div key={col.label}
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId) {
                  updateTask(dragId, { status: col.label })
                  setDragId(null)
                }
              }}
              className="w-72 shrink-0 bg-zinc-950/60 border border-zinc-800 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</h3>
                </div>
                <span className="text-[10px] font-mono text-zinc-600">{colTasks.length}</span>
              </div>
              <div className="space-y-2">
                {colTasks.length === 0 ? (
                  <p className="text-[10px] text-zinc-700 text-center py-4 italic">drop here</p>
                ) : (
                  colTasks.map((task) => {
                    const proj = projects.find((p) => p.id === task.projectId)
                    if (!proj) return null
                    return (
                      <div key={task.id}
                        draggable
                        onDragStart={() => setDragId(task.id)}
                        onDragEnd={() => setDragId(null)}
                        style={{ opacity: dragId === task.id ? 0.4 : 1, cursor: 'grab' }}>
                        <TaskCard task={task} project={proj} onClick={() => onTaskClick(task)} />
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
