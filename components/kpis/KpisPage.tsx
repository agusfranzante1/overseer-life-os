'use client'
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, Plus, Trash2, Archive, ArchiveRestore, BarChart3, Pencil, X, Check, Calendar } from 'lucide-react'
import { useKpisStore } from '@/lib/store/kpisStore'
import { useSPIStore } from '@/lib/store/spiStore'
import type { KPIDefinition, KPIKind } from '@/lib/kpi/types'
import { WHEEL_AREAS } from '@/lib/projection/templates'
import { KpiScoreboard } from '@/components/spi/KpiScoreboard'

type View = 'thisweek' | 'library' | 'history'

export function KpisPage() {
  const [view, setView] = useState<View>('thisweek')
  const definitions = useKpisStore((s) => s.definitions)
  const activeCount = definitions.filter((d) => !d.archivedAt).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto px-4 py-6 space-y-5"
    >
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Target className="w-6 h-6 text-fuchsia-400" />
            KPIs Semanales
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            Métricas de output que medís cada semana — entrenos, contenido,
            backtests, hobbies, etc. Definí acá tu library; durante el SPI
            semanal elegís cuáles trackeás y cargás los valores.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          <button
            onClick={() => setView('thisweek')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              view === 'thisweek'
                ? 'bg-fuchsia-500/15 text-fuchsia-300'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> Esta semana
          </button>
          <button
            onClick={() => setView('library')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              view === 'library'
                ? 'bg-fuchsia-500/15 text-fuchsia-300'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" /> Library
          </button>
          <button
            onClick={() => setView('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              view === 'history'
                ? 'bg-fuchsia-500/15 text-fuchsia-300'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Historial
          </button>
        </div>
      </header>

      {view === 'thisweek' && <ThisWeekView />}
      {view === 'library' && <LibraryView />}
      {view === 'history' && <HistoryView />}

      {activeCount === 0 && view === 'library' && (
        <p className="text-[11px] text-zinc-600 italic text-center pt-2">
          Tip: también podés crear KPIs sobre la marcha dentro del SPI semanal,
          al lado de la meta de cada área principal del año.
        </p>
      )}
    </motion.div>
  )
}

// ─── Library ────────────────────────────────────────────────────────

function LibraryView() {
  const definitions = useKpisStore((s) => s.definitions)
  const addKpi = useKpisStore((s) => s.addKpi)
  const updateKpi = useKpisStore((s) => s.updateKpi)
  const archiveKpi = useKpisStore((s) => s.archiveKpi)
  const unarchiveKpi = useKpisStore((s) => s.unarchiveKpi)
  const deleteKpi = useKpisStore((s) => s.deleteKpi)
  // Sesión SPI de la semana en curso — para indicar qué KPIs están
  // habilitados ESTA semana en cada fila. Necesario porque sin este
  // dato la library no muestra ninguna diferencia entre "activo en la
  // semana" y "solo en la library", y al user le parecía que los KPIs
  // creados desde SPI no quedaban habilitados.
  const sessions = useSPIStore((s) => s.sessions)
  const activeSessionId = useSPIStore((s) => s.activeSessionId)
  const currentSat = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const day = d.getDay()
    const back = day === 6 ? 0 : day + 1
    d.setDate(d.getDate() - back)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const currentSession = useMemo(() => {
    // Priorizar la activeSessionId si matchea con currentSat — protege
    // contra el caso de múltiples sesiones para el mismo weekStartDate
    // (data dup por sync multi-device). Fallback: la más recientemente
    // actualizada entre las que matcheen weekStartDate=currentSat.
    if (activeSessionId) {
      const active = sessions.find((s) => s.id === activeSessionId)
      if (active && active.weekStartDate === currentSat) return active
    }
    const matching = sessions.filter((s) => s.weekStartDate === currentSat)
    if (matching.length === 0) return null
    return matching.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
  }, [sessions, activeSessionId, currentSat])
  const currentSelectedIds = useMemo(
    () => new Set(currentSession?.selectedKpiIds ?? []),
    [currentSession]
  )

  const [editing, setEditing] = useState<KPIDefinition | null>(null)
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const active = definitions.filter((d) => !d.archivedAt)
  const archived = definitions.filter((d) => !!d.archivedAt)

  // Agrupados por `group` (los sin grupo van al final como "Otros").
  const grouped = useMemo(() => {
    const map = new Map<string, KPIDefinition[]>()
    for (const d of active) {
      const k = d.group || 'Otros'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(d)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [active])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {active.length} KPIs activos
          {archived.length > 0 && ` · ${archived.length} archivados`}
        </p>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 active:bg-fuchsia-500/30 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Nuevo KPI
        </button>
      </div>

      {active.length === 0 ? (
        <div className="bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-10 text-center">
          <Target className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-200 mb-1">Sin KPIs todavía</p>
          <p className="text-xs text-zinc-500 mb-5 max-w-md mx-auto">
            Empezá creando uno — ej. &quot;Entrenos&quot; (kind: count, target: 5).
            Después en el SPI semanal podés activarlo y cargar los valores que llevás.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Crear mi primer KPI
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([groupName, items]) => (
            <section key={groupName}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300/80">
                  {groupName}
                </span>
                <div className="flex-1 h-px bg-fuchsia-500/15" />
              </div>
              <div className="space-y-1.5">
                {items.map((d) => (
                  <KpiRow
                    key={d.id}
                    kpi={d}
                    activeThisWeek={currentSelectedIds.has(d.id)}
                    onEdit={() => setEditing(d)}
                    onArchive={() => archiveKpi(d.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showArchived ? '▾' : '▸'} Archivados · {archived.length}
          </button>
          {showArchived && (
            <div className="mt-2 space-y-1.5 pl-3">
              {archived.map((d) => (
                <div key={d.id} className="bg-zinc-950/40 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-3 opacity-60">
                  <span className="text-lg">{d.icon}</span>
                  <span className="text-sm text-zinc-400 flex-1">{d.name}</span>
                  <button
                    onClick={() => unarchiveKpi(d.id)}
                    title="Restaurar"
                    className="text-zinc-500 hover:text-emerald-400 p-1 rounded transition-colors"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Borrar "${d.name}" definitivamente? Los snapshots históricos quedan, pero el KPI ya no aparece en ningún lado.`)) {
                        deleteKpi(d.id)
                      }
                    }}
                    title="Borrar definitivamente"
                    className="text-zinc-600 hover:text-red-400 p-1 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {(creating || editing) && (
          <KpiEditModal
            initial={editing ?? undefined}
            onClose={() => { setCreating(false); setEditing(null) }}
            onSubmit={(data) => {
              if (editing) updateKpi(editing.id, data)
              else addKpi(data)
              setCreating(false); setEditing(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Fila simple en la library ──────────────────────────────────────

function KpiRow({
  kpi, activeThisWeek, onEdit, onArchive,
}: {
  kpi: KPIDefinition
  /** Si está en el `selectedKpiIds` de la sesión SPI en curso. Muestra
   *  un chip "Activo esta semana" en verde para que el user vea de un
   *  vistazo qué KPIs está trackeando ahora. */
  activeThisWeek: boolean
  onEdit: () => void
  onArchive: () => void
}) {
  const area = kpi.areaKey ? WHEEL_AREAS.find((a) => a.key === kpi.areaKey) : null
  return (
    <div
      className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-2.5 flex items-center gap-3 group transition-colors"
      style={{ borderLeft: `3px solid ${kpi.color}` }}
    >
      <span className="text-lg shrink-0">{kpi.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-200 truncate">{kpi.name}</span>
          {activeThisWeek && (
            <span
              className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              title="Está habilitado en la sesión SPI de esta semana"
            >
              ● Activo esta semana
            </span>
          )}
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
            {kpi.kind}
          </span>
          {kpi.target !== undefined && (
            <span className="text-[10px] text-zinc-500">
              · target {kpi.target}{kpi.kind === 'percent' ? '%' : ''}
            </span>
          )}
        </div>
        {area && (
          <p className="text-[10px] text-zinc-600 mt-0.5">{area.label}</p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} title="Editar" className="text-zinc-500 hover:text-fuchsia-300 p-1.5 rounded transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onArchive} title="Archivar" className="text-zinc-500 hover:text-amber-400 p-1.5 rounded transition-colors">
          <Archive className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Modal de crear / editar KPI ────────────────────────────────────

const ICON_PRESETS = ['🏋️', '💪', '🏃', '🌙', '📊', '⚠️', '🧪', '📅', '🎥', '📝', '🎸', '✍️', '🎨', '📚', '🧘', '🚀', '🎯', '💡', '🔧', '🔬']
const COLOR_PRESETS = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1']

function KpiEditModal({
  initial, onClose, onSubmit,
}: {
  initial?: KPIDefinition
  onClose: () => void
  onSubmit: (data: Omit<KPIDefinition, 'id' | 'createdAt' | 'updatedAt' | 'activatedAt'>) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '🎯')
  const [color, setColor] = useState(initial?.color ?? COLOR_PRESETS[0])
  const [kind, setKind] = useState<KPIKind>(initial?.kind ?? 'count')
  const [target, setTarget] = useState<string>(
    initial?.target !== undefined ? String(initial.target) : ''
  )
  const [areaKey, setAreaKey] = useState<string>(initial?.areaKey ?? '')
  const [group, setGroup] = useState<string>(initial?.group ?? '')
  // Meta acumulada — opcional, solo para kind='count'. Si está seteada,
  // el scoreboard muestra un segundo progress bar de "X/Total" además
  // del semanal.
  const [cumulativeTarget, setCumulativeTarget] = useState<string>(
    initial?.cumulativeTarget !== undefined ? String(initial.cumulativeTarget) : ''
  )
  const [cumulativeStartDate, setCumulativeStartDate] = useState<string>(
    initial?.cumulativeStartDate ?? ''
  )
  const [cumulativeDeadline, setCumulativeDeadline] = useState<string>(
    initial?.cumulativeDeadline ?? ''
  )

  const canSubmit = name.trim().length > 0

  const submit = () => {
    if (!canSubmit) return
    const parsedTarget = target.trim() ? parseFloat(target) : undefined
    const parsedCumTarget = cumulativeTarget.trim() ? parseFloat(cumulativeTarget) : undefined
    onSubmit({
      name: name.trim(),
      icon,
      color,
      kind,
      target: Number.isFinite(parsedTarget) ? parsedTarget : undefined,
      areaKey: areaKey || undefined,
      group: group.trim() || undefined,
      // Meta acumulada: solo se persiste si tiene número Y kind es count.
      // Si el user borra el campo, los 3 vuelven a undefined.
      ...(kind === 'count' && Number.isFinite(parsedCumTarget) && parsedCumTarget !== undefined
        ? {
            cumulativeTarget: parsedCumTarget,
            cumulativeStartDate: cumulativeStartDate || new Date().toISOString().slice(0, 10),
            ...(cumulativeDeadline ? { cumulativeDeadline } : {}),
          }
        : {}),
      ...(initial?.archivedAt ? { archivedAt: initial.archivedAt } : {}),
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-white">
            {initial ? 'Editar KPI' : 'Nuevo KPI'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Nombre</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Entrenos"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
            />
          </div>

          {/* Icono */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Ícono</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ICON_PRESETS.map((i) => (
                <button
                  key={i}
                  onClick={() => setIcon(i)}
                  className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                    icon === i ? 'bg-fuchsia-500/20 border border-fuchsia-500/50' : 'bg-zinc-800 hover:bg-zinc-700 border border-transparent'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Color</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                    color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900 scale-110' : ''
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {/* Kind */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Tipo de medición</label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(['count', 'percent', 'boolean'] as KPIKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    kind === k ? 'bg-fuchsia-500/20 border border-fuchsia-500/50 text-fuchsia-200' : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {k === 'count' && 'Contador'}
                  {k === 'percent' && '%'}
                  {k === 'boolean' && 'Sí / No'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5 italic">
              {kind === 'count'   && 'Entero contra un techo. Ej: 3 / 5 entrenos.'}
              {kind === 'percent' && '0-100. Ej: 80% de trades registrados.'}
              {kind === 'boolean' && 'Cumplió o no. Ej: Mes backtesteado.'}
            </p>
          </div>

          {/* Target */}
          {kind !== 'boolean' && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Target {kind === 'percent' ? '(0-100)' : ''} {kind === 'count' ? 'por semana' : ''}
              </label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={kind === 'count' ? 'Ej. 5' : 'Ej. 100'}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
              />
              <p className="text-[10px] text-zinc-600 mt-1 italic">
                {kind === 'count'
                  ? 'Cuántos por semana. Ej. "30 sesiones de backtest semanales".'
                  : 'Opcional — dejá vacío si no querés un techo (verás solo el conteo).'}
              </p>
            </div>
          )}

          {/* Meta acumulada — opcional, solo aplica a kind=count. Si el
              user tiene un objetivo grande de largo plazo (ej. "300
              sesiones totales") y el target semanal es solo el ritmo
              deseado, acá lo declara y el scoreboard muestra DOS bars
              (semanal + acumulado contra esta meta). */}
          {kind === 'count' && (
            <div className="bg-zinc-950/40 border border-fuchsia-500/15 rounded-lg p-3 space-y-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300/80">
                Meta acumulada (opcional)
              </p>
              <p className="text-[10px] text-zinc-500 -mt-2 italic leading-relaxed">
                Para objetivos de largo plazo donde el target semanal es el ritmo y
                la meta real es el total. Ej. &quot;300 sesiones de backtest&quot; +
                target semanal 30 = se completa en ~10 semanas.
              </p>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Total a alcanzar
                </label>
                <input
                  type="number"
                  value={cumulativeTarget}
                  onChange={(e) => setCumulativeTarget(e.target.value)}
                  placeholder="Ej. 300"
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
                />
              </div>
              {cumulativeTarget.trim() && (
                <>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      Desde cuándo cuenta
                    </label>
                    <input
                      type="date"
                      value={cumulativeStartDate}
                      onChange={(e) => setCumulativeStartDate(e.target.value)}
                      className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
                    />
                    <p className="text-[10px] text-zinc-600 mt-1 italic">
                      Default = hoy. Backdate-alo si la meta arrancó antes.
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      Fecha objetivo (opcional)
                    </label>
                    <input
                      type="date"
                      value={cumulativeDeadline}
                      onChange={(e) => setCumulativeDeadline(e.target.value)}
                      className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
                    />
                    <p className="text-[10px] text-zinc-600 mt-1 italic">
                      Si la ponés, el scoreboard te dice si vas en hora o atrasado.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Área */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Área (opcional)</label>
            <select
              value={areaKey}
              onChange={(e) => setAreaKey(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
            >
              <option value="">— sin área —</option>
              {WHEEL_AREAS.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-600 mt-1 italic">
              Si lo asociás a una de tus áreas principales del año, aparece de
              sugerencia en el SPI semanal al lado de la meta semanal de esa área.
            </p>
          </div>

          {/* Grupo */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Grupo (opcional)</label>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Ej. Gym, Trading, Contenido"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
            />
            <p className="text-[10px] text-zinc-600 mt-1 italic">
              Texto libre — se usa para agrupar KPIs juntos en el scoreboard.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-zinc-800">
          <button onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold transition-colors">
            Cancelar
          </button>
          <button onClick={submit} disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-fuchsia-300 text-sm font-bold transition-colors flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Guardar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── History ────────────────────────────────────────────────────────

function HistoryView() {
  const definitions = useKpisStore((s) => s.definitions)
  const sessions = useSPIStore((s) => s.sessions)
  const active = definitions.filter((d) => !d.archivedAt)

  // Últimas 12 semanas — más recientes primero.
  const last12 = useMemo(() => {
    const closedWithSnapshot = sessions
      .filter((s) => !!s.weekSnapshot && !!s.closedAt)
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
      .slice(0, 12)
    return closedWithSnapshot.reverse()  // chronological izq→der
  }, [sessions])

  if (active.length === 0) {
    return (
      <div className="bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-10 text-center">
        <BarChart3 className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-200 mb-1">Sin KPIs en la library</p>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">
          Crearé un KPI en &quot;Library&quot; primero para empezar a ver historial.
        </p>
      </div>
    )
  }

  if (last12.length === 0) {
    return (
      <div className="bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-10 text-center">
        <BarChart3 className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-200 mb-1">Sin semanas cerradas todavía</p>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">
          Acá vas a ver el grid de las últimas 12 semanas con todos tus KPIs.
          Cerrá tu primera sesión SPI con KPIs activos para empezar.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">
        Últimas {last12.length} semana{last12.length === 1 ? '' : 's'} cerradas
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px]">
          <thead>
            <tr>
              <th className="text-left text-[9px] font-mono uppercase tracking-wider text-zinc-600 pr-3 pb-2 font-normal sticky left-0 bg-zinc-950/60">
                KPI
              </th>
              {last12.map((sess) => {
                const [y, m, d] = sess.weekStartDate.split('-').map(Number)
                const date = new Date(y, m - 1, d)
                const label = `${date.getDate()}/${date.getMonth() + 1}`
                return (
                  <th key={sess.id} className="px-1 pb-2 font-normal text-[9px] font-mono text-zinc-600">
                    {label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {active.map((kpi) => (
              <tr key={kpi.id} className="border-t border-zinc-900">
                <td className="py-1.5 pr-3 sticky left-0 bg-zinc-950/60 text-zinc-300 whitespace-nowrap">
                  <span className="mr-1.5">{kpi.icon}</span>{kpi.name}
                </td>
                {last12.map((sess) => {
                  const snap = sess.weekSnapshot?.kpis?.find((k) => k.id === kpi.id)
                  if (!snap) {
                    return <td key={sess.id} className="px-0.5 py-1.5 text-center text-zinc-700">·</td>
                  }
                  const pct = snap.completionPct
                  const bg = pct === undefined
                    ? 'bg-zinc-800/60 text-zinc-300'
                    : pct >= 100 ? 'bg-emerald-500/25 text-emerald-300'
                    : pct >= 75 ? 'bg-emerald-500/15 text-emerald-300/80'
                    : pct >= 50 ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-red-500/10 text-red-300'
                  const label = kpi.kind === 'boolean'
                    ? (snap.value > 0 ? '✓' : '·')
                    : kpi.kind === 'percent'
                      ? `${Math.round(snap.value)}%`
                      : snap.target !== undefined
                        ? `${snap.value}/${snap.target}`
                        : String(snap.value)
                  return (
                    <td key={sess.id} className="px-0.5 py-0.5">
                      <div className={`rounded px-1.5 py-1 text-center tabular-nums ${bg}`}>
                        {label}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-600 italic mt-3">
        Verde = ≥75% del target esa semana · ámbar = 50-74% · rojo = &lt;50% · gris = sin target o KPI no activo esa semana.
      </p>
    </div>
  )
}


// ─── Esta semana — scoreboard ───────────────────────────────────────

/** Vista del scoreboard para la semana en curso (estilo habit tracker):
 *  reusa el mismo `KpiScoreboard` que vive en el SPI semanal. Lazy-crea
 *  la sesión SPI de la semana actual si no existe, así podés marcar
 *  KPIs desde acá aunque no hayas abierto el SPI todavía. */
function ThisWeekView() {
  const sessions = useSPIStore((s) => s.sessions)
  const activeSessionId = useSPIStore((s) => s.activeSessionId)
  const createOrOpen = useSPIStore((s) => s.createOrOpenCurrentWeek)
  const updateValue = useSPIStore((s) => s.updateValue)
  const setSessionKpis = useSPIStore((s) => s.setSessionKpis)

  const [needsCreate, setNeedsCreate] = useState(false)
  const currentSat = useMemo(() => {
    // Mismo cálculo que lastSaturdayYmd en el store — duplicado mínimo
    // para no expandir la API del store solo para esto.
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const day = d.getDay()
    const back = day === 6 ? 0 : day + 1
    d.setDate(d.getDate() - back)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // Resolución de "cuál es la sesión de esta semana":
  //
  // 1. Si hay activeSessionId Y matchea con currentSat → usar ESA. Esto
  //    es importante porque cuando el user edita KPIs desde /spi, las
  //    actualizaciones van a la activeSession. Si acá agarrábamos
  //    cualquier sesión con weekStartDate=currentSat sin chequear el
  //    activeSessionId, podía pasar que haya 2 sesiones para la misma
  //    semana (data dup por sync entre devices, history viejo, etc.) y
  //    /kpis mostraba una vacía mientras la activa tenía los KPIs.
  //
  // 2. Si no, buscar TODAS las matching y quedarnos con la más reciente
  //    actualizada — más robusto contra dups. updatedAt determina cuál
  //    es la "real" del user.
  const current = useMemo(() => {
    if (activeSessionId) {
      const active = sessions.find((s) => s.id === activeSessionId)
      if (active && active.weekStartDate === currentSat) return active
    }
    const matching = sessions.filter((s) => s.weekStartDate === currentSat)
    if (matching.length === 0) return null
    return matching.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
  }, [sessions, activeSessionId, currentSat])

  if (!current && !needsCreate) {
    return (
      <div className="bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-10 text-center">
        <Calendar className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-200 mb-1">Sin sesión SPI activa</p>
        <p className="text-xs text-zinc-500 mb-5 max-w-md mx-auto">
          La semana en curso no tiene sesión iniciada. Creala — los KPIs que tenés
          en la library se van a heredar automáticamente (los mismos que la semana pasada).
        </p>
        <button
          onClick={() => { createOrOpen(); setNeedsCreate(true) }}
          className="px-4 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Empezar semana
        </button>
      </div>
    )
  }

  const session = current ?? sessions.find((s) => s.weekStartDate === currentSat)
  if (!session) return null

  // Los KPIs son MÉTRICAS SEMANALES que el user trackea durante toda la
  // semana (no solo al planear). El SPI semanal, en cambio, es la
  // planificación — el user puede cerrarlo apenas termina de planear
  // (Lunes a la mañana por ejemplo) y eso bloquea el resto del SPI.
  //
  // Bug que esto arregla: cuando el user cerraba el SPI temprano, el
  // scoreboard tomaba `isClosed=true` y ocultaba "Activar todos" + bloqueaba
  // la edición de valores. Resultado: no podía trackear sus KPIs durante
  // la semana.
  //
  // Fix: en /kpis ThisWeek SIEMPRE tratamos los KPIs como editables. Si
  // la sesión está cerrada (planificación congelada), mostramos un banner
  // aclarando que la planificación quedó congelada pero los KPIs siguen
  // editables hasta el próximo sábado.
  const sessionClosed = !!session.closedAt
  return (
    <div className="space-y-3">
      {sessionClosed && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-200/90 flex items-start gap-2">
          <span className="text-base leading-none">ℹ️</span>
          <span>
            El SPI semanal ya está cerrado (la planificación quedó congelada),
            pero los <strong>KPIs siguen editables</strong> hasta el próximo sábado —
            cargá tus valores acá durante toda la semana.
          </span>
        </div>
      )}
      <p className="text-[11px] text-zinc-500">
        Cargá los valores acá o desde el SPI semanal — escriben al mismo lugar.
        Los KPIs activos se heredan automáticamente; podés ajustar con &quot;Editar&quot; en el header.
      </p>
      <KpiScoreboard
        session={session}
        // Forzamos editable: estamos en /kpis ThisWeek y la sesión ES de
        // esta semana (por la lógica de currentSat). Los KPIs son
        // editables aun si el resto del SPI está cerrado.
        isClosed={false}
        onSelectedChange={(next) => setSessionKpis(session.id, next)}
        onValueChange={(sectionKey, fieldKey, value) => updateValue(session.id, sectionKey, fieldKey, value)}
      />
    </div>
  )
}
