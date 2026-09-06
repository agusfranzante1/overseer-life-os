'use client'
import { useState, useMemo, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scale, Plus, Trash2, Star, Check, X, Search,
  Calendar as CalendarIcon, Pencil, Circle, Folder,
} from 'lucide-react'
import {
  useDecisionsStore, sortDecisions, filterDecisions, decisionStats, formatDecisionDate,
  type Decision, type DecisionVerdict,
} from '@/lib/store/decisionsStore'
import { useTasksStore } from '@/lib/store/tasksStore'

/** `false` en SSR / primer paint, `true` tras hidratar — el store persiste
 *  desde localStorage sincrónicamente en el cliente, así que sin este guard el
 *  primer render del cliente diverge del HTML del server. */
const noopSubscribe = () => () => {}
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

const VERDICT_UI: Record<DecisionVerdict, { label: string; color: string; bg: string; border: string }> = {
  correcta:   { label: 'Correcta',   color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.35)' },
  incorrecta: { label: 'Incorrecta', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.35)' },
  pendiente:  { label: 'Pendiente',  color: '#a1a1aa', bg: 'rgba(161,161,170,0.10)', border: 'rgba(161,161,170,0.28)' },
}

export function DecisionesPage() {
  const decisions = useDecisionsStore((s) => s.decisions)
  const addDecision = useDecisionsStore((s) => s.addDecision)
  const removeDecision = useDecisionsStore((s) => s.removeDecision)
  const projects = useTasksStore((s) => s.projects)

  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [verdict, setVerdict] = useState<DecisionVerdict | 'todas'>('todas')
  const [projectId, setProjectId] = useState<string | 'todos'>('todos')
  const [onlyImportant, setOnlyImportant] = useState(false)
  const mounted = useHydrated()

  const activeProjects = useMemo(
    () => Object.values(projects).filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  )

  // Las estadísticas se calculan sobre lo FILTRADO: si estás mirando un
  // proyecto, el porcentaje de acierto que querés ver es el de ese proyecto.
  const visible = useMemo(
    () => sortDecisions(filterDecisions(decisions, { query, verdict, projectId, onlyImportant })),
    [decisions, query, verdict, projectId, onlyImportant],
  )
  const stats = useMemo(() => decisionStats(visible), [visible])
  const filtrando = query.trim() !== '' || verdict !== 'todas' || projectId !== 'todos' || onlyImportant

  const handleNew = () => {
    // Si estás parado en un proyecto, la nueva nace ahí: es lo que esperás.
    const id = addDecision(projectId !== 'todos' ? { projectId } : undefined)
    setOpenId(id)
  }

  if (!mounted) {
    return <div className="p-6"><div className="h-10 w-52 bg-white/[0.03] rounded-xl animate-pulse" /></div>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-none flex items-center gap-3.5">
            <span
              className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 24%, transparent), color-mix(in srgb, var(--app-accent) 8%, transparent))',
                border: '1px solid color-mix(in srgb, var(--app-accent) 38%, transparent)',
                boxShadow: '0 0 28px -8px color-mix(in srgb, var(--app-accent) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
            >
              <Scale className="w-6 h-6 md:w-7 md:h-7" style={{ color: 'var(--app-accent)' }} />
            </span>
            <span className="text-hero pb-1">Decisiones</span>
          </h1>
          <p className="text-[13px] text-zinc-500">
            Lo que decidiste, por qué, y cómo salió. El veredicto se marca después — cuando ya se sabe.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 85%, transparent), color-mix(in srgb, var(--app-accent) 55%, transparent))',
            boxShadow: '0 8px 24px -12px color-mix(in srgb, var(--app-accent) 90%, transparent)',
          }}
        >
          <Plus className="w-4 h-4" /> Nueva decisión
        </motion.button>
      </div>

      {/* Marcador — cuántas salieron bien de las que YA se sabe */}
      {decisions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatBox label="Acierto" value={stats.aciertoPct === null ? '—' : `${stats.aciertoPct}%`}
            hint={stats.aciertoPct === null ? 'ninguna juzgada' : `${stats.correctas} de ${stats.correctas + stats.incorrectas}`}
            color="var(--app-accent)" />
          <StatBox label="Correctas" value={String(stats.correctas)} color={VERDICT_UI.correcta.color} />
          <StatBox label="Incorrectas" value={String(stats.incorrectas)} color={VERDICT_UI.incorrecta.color} />
          <StatBox label="Pendientes" value={String(stats.pendientes)} hint="sin resultado todavía" color={VERDICT_UI.pendiente.color} />
        </div>
      )}

      {/* Filtros */}
      {decisions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en texto y resultado…"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)]"
            />
          </div>

          <div className="flex items-center bg-white/[0.03] border border-white/[0.08] rounded-xl p-1">
            {(['todas', 'pendiente', 'correcta', 'incorrecta'] as const).map((v) => (
              <button key={v} onClick={() => setVerdict(v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  verdict === v ? 'bg-white/[0.10] text-white' : 'text-zinc-500 hover:text-zinc-200'
                }`}>
                {v === 'todas' ? 'Todas' : VERDICT_UI[v].label}
              </button>
            ))}
          </div>

          {activeProjects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-2.5 py-2 text-xs text-zinc-300 focus:outline-none"
            >
              <option value="todos">Todos los proyectos</option>
              {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <button
            onClick={() => setOnlyImportant((v) => !v)}
            title="Ver solo las marcadas como importantes"
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-colors ${
              onlyImportant
                ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                : 'bg-white/[0.03] border-white/[0.08] text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${onlyImportant ? 'fill-amber-300' : ''}`} /> Importantes
          </button>
        </div>
      )}

      {/* Lista */}
      {decisions.length === 0 ? (
        <div className="text-center py-20 px-8 rounded-2xl border border-dashed border-zinc-700 bg-white/[0.02]">
          <Scale className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-300 mb-1">Todavía no anotaste ninguna decisión</p>
          <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto">
            Anotá qué decidiste y por qué. Más adelante volvés, escribís qué resultado dio y la marcás
            correcta o incorrecta — ahí es donde el registro empieza a servir.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-14 px-8 rounded-2xl border border-dashed border-zinc-800 bg-white/[0.02]">
          <p className="text-sm text-zinc-400">Ninguna decisión coincide con el filtro.</p>
          <button onClick={() => { setQuery(''); setVerdict('todas'); setProjectId('todos'); setOnlyImportant(false) }}
            className="mt-2 text-xs text-zinc-500 hover:text-white underline underline-offset-4">
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrando && (
            <p className="text-[11px] font-mono text-zinc-600">
              {visible.length} de {decisions.length}
            </p>
          )}
          {visible.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              projects={activeProjects}
              open={openId === d.id}
              onToggle={() => setOpenId((id) => (id === d.id ? null : d.id))}
              onDelete={() => {
                if (confirm('¿Borrar esta decisión? No se puede deshacer.')) {
                  removeDecision(d.id)
                  if (openId === d.id) setOpenId(null)
                }
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

function StatBox({ label, value, hint, color }: { label: string; value: string; hint?: string; color: string }) {
  return (
    <div className="rounded-xl px-3.5 py-3 bg-white/[0.03] border border-white/[0.08]">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="font-heading text-2xl font-bold leading-tight" style={{ color }}>{value}</p>
      {hint && <p className="text-[10px] text-zinc-600 truncate">{hint}</p>}
    </div>
  )
}

// ─── Card (colapsada = resumen · abierta = editor) ───────────────────────────

function DecisionCard({ decision, projects, open, onToggle, onDelete }: {
  decision: Decision
  projects: { id: string; name: string; color: string }[]
  open: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const updateDecision = useDecisionsStore((s) => s.updateDecision)
  const toggleImportant = useDecisionsStore((s) => s.toggleImportant)
  const cycleVerdict = useDecisionsStore((s) => s.cycleVerdict)
  const [editingDate, setEditingDate] = useState(false)

  const v = VERDICT_UI[decision.verdict]
  const project = projects.find((p) => p.id === decision.projectId)
  const dateLabel = formatDecisionDate(decision.date)
  const preview = decision.body.trim().split('\n')[0]?.slice(0, 140) ?? ''

  return (
    <motion.div
      layout
      className="rounded-2xl overflow-hidden transition-colors"
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${decision.important ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer group" onClick={onToggle}>
        {/* Chip de fecha */}
        <div
          className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl"
          style={{ background: `${v.bg}`, border: `1px solid ${v.border}` }}
        >
          <span className="font-heading text-xl font-bold leading-none" style={{ color: v.color }}>
            {decision.date.slice(8, 10)}
          </span>
          <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 mt-0.5">
            {monthShort(decision.date)}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white truncate flex items-center gap-1.5">
            {decision.important && <Star className="w-3.5 h-3.5 shrink-0 text-amber-300 fill-amber-300" />}
            {decision.title.trim() || <span className="text-zinc-500 italic font-normal">Sin título</span>}
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: v.bg, color: v.color, border: `1px solid ${v.border}` }}>
              {v.label}
            </span>
            {project && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md truncate max-w-[140px]"
                style={{ background: `${project.color}18`, color: project.color, border: `1px solid ${project.color}44` }}>
                {project.name}
              </span>
            )}
            <span className="text-[11px] text-zinc-500 capitalize truncate">{dateLabel}</span>
          </div>
          {!open && preview && <p className="text-[13px] text-zinc-400 truncate mt-0.5">{preview}</p>}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); toggleImportant(decision.id) }}
          title={decision.important ? 'Quitar de importantes' : 'Marcar como importante'}
          className={`shrink-0 p-1.5 rounded-lg transition-all ${
            decision.important
              ? 'text-amber-300'
              : 'text-zinc-600 hover:text-amber-300 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Star className={`w-4 h-4 ${decision.important ? 'fill-amber-300' : ''}`} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Borrar decisión"
          className="shrink-0 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-3 border-t border-white/[0.06]">
              {/* Fecha + proyecto */}
              <div className="flex items-center gap-3 flex-wrap pt-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  {editingDate ? (
                    <input
                      type="date" autoFocus value={decision.date}
                      onChange={(e) => updateDecision(decision.id, { date: e.target.value || decision.date })}
                      onBlur={() => setEditingDate(false)}
                      className="bg-zinc-900 border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-[var(--app-accent)]"
                    />
                  ) : (
                    <button onClick={() => setEditingDate(true)} title="Cambiar la fecha de la decisión"
                      className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors group/date">
                      <span className="capitalize">{dateLabel}</span>
                      <Pencil className="w-3 h-3 text-zinc-600 group-hover/date:text-[var(--app-accent)]" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <select
                    value={decision.projectId ?? ''}
                    onChange={(e) => updateDecision(decision.id, { projectId: e.target.value || undefined })}
                    className="bg-zinc-900 border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-[var(--app-accent)]"
                  >
                    <option value="">Sin proyecto</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Título */}
              <input
                value={decision.title}
                onChange={(e) => updateDecision(decision.id, { title: e.target.value })}
                placeholder="¿Qué decidiste?"
                className="w-full bg-transparent text-lg font-semibold text-white placeholder-zinc-600 focus:outline-none"
              />

              {/* El texto: contexto, opciones, por qué */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">La decisión</label>
                <textarea
                  value={decision.body}
                  onChange={(e) => updateDecision(decision.id, { body: e.target.value })}
                  placeholder="El contexto, las opciones que había, por qué elegiste esta…"
                  rows={6}
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 text-[15px] text-zinc-200 leading-relaxed placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)] resize-y"
                />
              </div>

              {/* Resultado */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Qué resultado dio</label>
                <textarea
                  value={decision.outcome}
                  onChange={(e) => updateDecision(decision.id, { outcome: e.target.value })}
                  placeholder="Se completa después, cuando ya se sabe cómo salió…"
                  rows={4}
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 text-[14px] text-zinc-200 leading-relaxed placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)] resize-y"
                />
              </div>

              {/* Veredicto — volver a tocar el mismo lo devuelve a pendiente */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mr-1">¿Fue correcta?</span>
                {(['correcta', 'incorrecta'] as const).map((val) => {
                  const ui = VERDICT_UI[val]
                  const active = decision.verdict === val
                  return (
                    <button key={val} onClick={() => cycleVerdict(decision.id, val)}
                      title={active ? 'Tocar de nuevo para volver a pendiente' : undefined}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                      style={{
                        background: active ? ui.bg : 'rgba(255,255,255,0.03)',
                        borderColor: active ? ui.border : 'rgba(255,255,255,0.08)',
                        color: active ? ui.color : '#71717a',
                      }}>
                      {val === 'correcta' ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      {ui.label}
                    </button>
                  )
                })}
                {decision.verdict === 'pendiente' && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600">
                    <Circle className="w-3 h-3" /> Pendiente
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-600">se guarda solo</span>
                <button onClick={onToggle}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/[0.05] transition-colors">
                  <X className="w-3 h-3" /> Cerrar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const MONTHS_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
function monthShort(ymd: string): string {
  const mm = parseInt(ymd.slice(5, 7), 10)
  return MONTHS_SHORT[mm - 1] ?? ''
}
