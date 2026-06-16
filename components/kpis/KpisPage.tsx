'use client'
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, Plus, Trash2, Archive, ArchiveRestore, BarChart3, Pencil, X, Check, Calendar } from 'lucide-react'
import { useKpisStore, parseKpiValue, kpiCompletionPct } from '@/lib/store/kpisStore'
import { useSPIStore, activeWeekAnchorYmd } from '@/lib/store/spiStore'
import type { KPIDefinition, KPIKind } from '@/lib/kpi/types'
import { readKpiValue, readKpiTargetOverride, KPI_VALUES_SECTION } from '@/lib/kpi/sessionHelpers'
import { WHEEL_AREAS } from '@/lib/projection/templates'
import { KpiScoreboard } from '@/components/spi/KpiScoreboard'
import { useTranslation } from '@/hooks/useTranslation'

type View = 'thisweek' | 'library' | 'history'

export function KpisPage() {
  const { t } = useTranslation()
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
            {t('kpis.title')}
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            {t('kpis.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.08] rounded-2xl p-1">
          <button
            onClick={() => setView('thisweek')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              view === 'thisweek'
                ? 'bg-fuchsia-500/15 text-fuchsia-300'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> {t('kpis.thisWeek')}
          </button>
          <button
            onClick={() => setView('library')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              view === 'library'
                ? 'bg-fuchsia-500/15 text-fuchsia-300'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" /> {t('kpis.library')}
          </button>
          <button
            onClick={() => setView('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              view === 'history'
                ? 'bg-fuchsia-500/15 text-fuchsia-300'
                : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> {t('kpis.history')}
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
  const { t } = useTranslation()
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
          {active.length} {t('kpis.activeKpis')}
          {archived.length > 0 && ` · ${archived.length} ${t('kpis.archived').toLowerCase()}`}
        </p>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 active:bg-fuchsia-500/30 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> {t('kpis.newKpi')}
        </button>
      </div>

      {active.length === 0 ? (
        <div className="bg-black/20 border border-white/[0.08] border-dashed rounded-2xl p-10 text-center">
          <Target className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-200 mb-1">{t('kpis.noKpisYet')}</p>
          <p className="text-xs text-zinc-500 mb-5 max-w-md mx-auto">
            Empezá creando uno — ej. &quot;Entrenos&quot; (kind: count, target: 5).
            Después en el SPI semanal podés activarlo y cargar los valores que llevás.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> {t('kpis.createFirst')}
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
                <div key={d.id} className="bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 flex items-center gap-3 opacity-60">
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
  const { t } = useTranslation()
  const area = kpi.areaKey ? WHEEL_AREAS.find((a) => a.key === kpi.areaKey) : null
  return (
    <div
      className="rounded-2xl px-5 py-4 flex items-center gap-4 group transition-all hover:scale-[1.005]"
      style={{
        background: `
          radial-gradient(circle at 0% 0%, ${kpi.color}1f, transparent 50%),
          rgba(255, 255, 255, 0.025)
        `,
        borderTop: `2px solid ${kpi.color}`,
        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}
    >
      {/* Icon badge — círculo coloreado con el emoji adentro */}
      <div
        className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl"
        style={{
          background: `${kpi.color}22`,
          border: `1px solid ${kpi.color}40`,
        }}
      >
        <span>{kpi.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-semibold text-white truncate">{kpi.name}</span>
          {activeThisWeek && (
            <span
              className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              title="Está habilitado en la sesión SPI de esta semana"
            >
              {t('kpis.activeThisWeek')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            {kpi.kind}
          </span>
          {kpi.target !== undefined && (
            <span className="text-[10px] text-zinc-500">
              · target {kpi.target}{kpi.kind === 'percent' ? '%' : ''}
            </span>
          )}
          {area && (
            <span className="text-[10px] text-zinc-500">· {area.label}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} title="Editar" className="text-zinc-500 hover:text-fuchsia-300 p-2 rounded-lg hover:bg-white/[0.04] transition-colors">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={onArchive} title="Archivar" className="text-zinc-500 hover:text-amber-400 p-2 rounded-lg hover:bg-white/[0.04] transition-colors">
          <Archive className="w-4 h-4" />
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
  const { t } = useTranslation()
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
        className="bg-white/[0.03] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <h2 className="text-sm font-bold text-white">
            {initial ? `${t('common.edit')} KPI` : t('kpis.newKpi')}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{t('kpis.name')}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
            />
          </div>

          {/* Icono */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{t('kpis.icon')}</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ICON_PRESETS.map((i) => (
                <button
                  key={i}
                  onClick={() => setIcon(i)}
                  className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                    icon === i ? 'bg-fuchsia-500/20 border border-fuchsia-500/50' : 'bg-zinc-800 hover:bg-white/[0.08] border border-transparent'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{t('kpis.color')}</label>
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
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{t('kpis.measurementType')}</label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(['count', 'percent', 'boolean'] as KPIKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    kind === k ? 'bg-fuchsia-500/20 border border-fuchsia-500/50 text-fuchsia-200' : 'bg-zinc-800 border border-white/[0.12] text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {k === 'count' && t('kpis.counter')}
                  {k === 'percent' && '%'}
                  {k === 'boolean' && t('kpis.yesNo')}
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
                {t('kpis.target')} {kind === 'percent' ? '(0-100)' : ''} {kind === 'count' ? t('kpis.targetWeekly') : ''}
              </label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={kind === 'count' ? 'Ej. 5' : 'Ej. 100'}
                className="mt-1 w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
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
            <div className="bg-black/20 border border-fuchsia-500/15 rounded-lg p-3 space-y-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300/80">
                {t('kpis.cumulativeTarget')}
              </p>
              <p className="text-[10px] text-zinc-500 -mt-2 italic leading-relaxed">
                {t('kpis.cumulativeHint')}
              </p>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  {t('kpis.totalToReach')}
                </label>
                <input
                  type="number"
                  value={cumulativeTarget}
                  onChange={(e) => setCumulativeTarget(e.target.value)}
                  placeholder="Ej. 300"
                  className="mt-1 w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
                />
              </div>
              {cumulativeTarget.trim() && (
                <>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      {t('kpis.sinceWhen')}
                    </label>
                    <input
                      type="date"
                      value={cumulativeStartDate}
                      onChange={(e) => setCumulativeStartDate(e.target.value)}
                      className="mt-1 w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
                    />
                    <p className="text-[10px] text-zinc-600 mt-1 italic">
                      Default = hoy. Backdate-alo si la meta arrancó antes.
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      {t('kpis.targetDeadline')}
                    </label>
                    <input
                      type="date"
                      value={cumulativeDeadline}
                      onChange={(e) => setCumulativeDeadline(e.target.value)}
                      className="mt-1 w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
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
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{t('kpis.area')} ({t('common.optional').toLowerCase()})</label>
            <select
              value={areaKey}
              onChange={(e) => setAreaKey(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
            >
              <option value="">{t('kpis.noArea')}</option>
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
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{t('kpis.group')} ({t('common.optional').toLowerCase()})</label>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Ej. Gym, Trading, Contenido"
              className="mt-1 w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
            />
            <p className="text-[10px] text-zinc-600 mt-1 italic">
              Texto libre — se usa para agrupar KPIs juntos en el scoreboard.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-white/[0.08]">
          <button onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg bg-zinc-800 hover:bg-white/[0.08] text-zinc-300 text-sm font-semibold transition-colors">
            {t('common.cancel')}
          </button>
          <button onClick={submit} disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-fuchsia-300 text-sm font-bold transition-colors flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> {t('common.save')}
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
  // BUGFIX: antes filtrábamos por `weekSnapshot + closedAt` — eso dejaba
  // afuera CUALQUIER sesión donde el user había cargado valores de KPIs
  // pero todavía no había "cerrado" formalmente el SPI semanal con el
  // botón. Como cargar valores es lo que el user hace durante la semana
  // y "cerrar" es un acto explícito que muchos no hacen, el historial
  // se veía vacío aunque hubiera data válida.
  //
  // Nueva regla: incluir CUALQUIER sesión que tenga AL MENOS un valor
  // de KPI cargado (sea en weekSnapshot frozen O en values vivos).
  // Para sesiones cerradas con snapshot leemos del snapshot (congelado);
  // para las demás computamos en vivo desde session.values usando
  // kpiCompletionPct con los defs actuales.
  const last12 = useMemo(() => {
    const eligible = sessions
      .filter((s) => {
        if (s.weekSnapshot?.kpis && s.weekSnapshot.kpis.length > 0) return true
        // Si tiene valores de KPI cargados en la sección dedicada, incluir.
        const kpiVals = s.values?.[KPI_VALUES_SECTION]
        if (kpiVals && Object.keys(kpiVals).some((k) => kpiVals[k])) return true
        // Si tiene KPIs seleccionados (incluso sin valores), incluir el
        // header de la semana así el user ve que estuvo presente.
        if ((s.selectedKpiIds ?? []).length > 0) return true
        return false
      })
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
      .slice(0, 12)
    return eligible.reverse()  // chronological izq→der
  }, [sessions])

  // Helper: dado un KPI y una sesión, devuelve el dato a mostrar en la
  // celda — preferimos el snapshot frozen si existe, sino lo computamos
  // en vivo desde session.values.
  const cellDataFor = (kpi: KPIDefinition, sess: import('@/lib/spi/types').SPISession) => {
    // Frozen snapshot tiene prioridad — preserva el target del momento.
    const frozen = sess.weekSnapshot?.kpis?.find((k) => k.id === kpi.id)
    if (frozen) {
      return {
        value: frozen.value,
        target: frozen.target,
        completionPct: frozen.completionPct,
        kind: kpi.kind,
      }
    }
    // Live: reconstruir desde session.values + target override.
    // readKpiValue ya parsea el raw a number según el kind. Si no hay
    // valor cargado, devuelve 0 — chequeamos contra el raw del store
    // para distinguir "sin cargar" de "cargado como 0".
    const rawString = sess.values?.[KPI_VALUES_SECTION]?.[kpi.id]
    if (rawString === undefined || rawString === '') return null
    const value = readKpiValue(sess, kpi.id, kpi.kind)
    const override = readKpiTargetOverride(sess, kpi.id)
    const target = override !== undefined ? override : kpi.target
    const pctResult = kpiCompletionPct(value, target, kpi.kind)
    // kpiCompletionPct devuelve `null` para casos sin target;
    // KPISnapshot.completionPct usa `undefined`. Normalizamos a undefined.
    const completionPct = pctResult ?? undefined
    return { value, target, completionPct, kind: kpi.kind }
  }

  if (active.length === 0) {
    return (
      <div className="bg-black/20 border border-white/[0.08] border-dashed rounded-2xl p-10 text-center">
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
      <div className="bg-black/20 border border-white/[0.08] border-dashed rounded-2xl p-10 text-center">
        <BarChart3 className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-200 mb-1">Sin actividad de KPIs todavía</p>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">
          Acá vas a ver el grid de las últimas 12 semanas con todos tus KPIs.
          Activá KPIs en una sesión SPI semanal y cargá valores para empezar.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">
        Últimas {last12.length} semana{last12.length === 1 ? '' : 's'} con KPIs
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px]">
          <thead>
            <tr>
              <th className="text-left text-[9px] font-mono uppercase tracking-wider text-zinc-600 pr-3 pb-2 font-normal sticky left-0 bg-black/30">
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
                <td className="py-1.5 pr-3 sticky left-0 bg-black/30 text-zinc-300 whitespace-nowrap">
                  <span className="mr-1.5">{kpi.icon}</span>{kpi.name}
                </td>
                {last12.map((sess) => {
                  const data = cellDataFor(kpi, sess)
                  if (!data) {
                    return <td key={sess.id} className="px-0.5 py-1.5 text-center text-zinc-700">·</td>
                  }
                  const pct = data.completionPct
                  const bg = pct === undefined
                    ? 'bg-zinc-800/60 text-zinc-300'
                    : pct >= 100 ? 'bg-emerald-500/25 text-emerald-300'
                    : pct >= 75 ? 'bg-emerald-500/15 text-emerald-300/80'
                    : pct >= 50 ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-red-500/10 text-red-300'
                  const label = kpi.kind === 'boolean'
                    ? (data.value > 0 ? '✓' : '·')
                    : kpi.kind === 'percent'
                      ? `${Math.round(data.value)}%`
                      : data.target !== undefined
                        ? `${data.value}/${data.target}`
                        : String(data.value)
                  // Marca visual sutil si la sesión NO está cerrada — el
                  // user sabe que esa celda es live, no congelada.
                  const isLive = !sess.closedAt
                  return (
                    <td key={sess.id} className="px-0.5 py-0.5">
                      <div
                        className={`rounded px-1.5 py-1 text-center tabular-nums ${bg}`}
                        title={isLive ? 'En vivo · semana sin cerrar' : 'Congelado al cierre'}
                        style={isLive ? { outline: '1px dashed rgba(255,255,255,0.12)' } : undefined}
                      >
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
        Verde ≥75% del target · ámbar 50-74% · rojo &lt;50% · gris sin target o KPI no activo esa semana.
        Celdas con outline dasheado = semana en vivo (no cerrada todavía). Las demás son snapshot congelado al cierre.
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
  const { t } = useTranslation()
  const sessions = useSPIStore((s) => s.sessions)
  const activeSessionId = useSPIStore((s) => s.activeSessionId)
  const createOrOpen = useSPIStore((s) => s.createOrOpenCurrentWeek)
  const updateValue = useSPIStore((s) => s.updateValue)
  const setSessionKpis = useSPIStore((s) => s.setSessionKpis)

  const [needsCreate, setNeedsCreate] = useState(false)
  // El anchor de la "semana en curso" es la sesión cuya ventana
  // LUNES→DOMINGO contiene HOY. Esto NO es la sesión que el usuario
  // edita el sábado (esa es la planificación de la SIGUIENTE semana).
  // Sin esta distinción, los KPIs decían "no hay SPI" cada sábado al
  // rolover, aunque la semana en curso (que termina el domingo)
  // todavía tenía KPIs activos en la sesión del sábado anterior.
  const currentSat = useMemo(() => activeWeekAnchorYmd(), [])

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
      <div className="bg-black/20 border border-white/[0.08] border-dashed rounded-2xl p-10 text-center">
        <Calendar className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-200 mb-1">{t('spi.noSession')}</p>
        <p className="text-xs text-zinc-500 mb-5 max-w-md mx-auto">
          {t('spi.noSessionDesc')}
        </p>
        <button
          onClick={() => { createOrOpen(); setNeedsCreate(true) }}
          className="px-4 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> {t('spi.startWeek')}
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

  // Calculamos el rango "de cuándo a cuándo" que esta sesión cubre — la
  // SEMANA está en LUNES→DOMINGO, no en sábado→viernes (los KPIs viven
  // en la sesión cuya ventana Mon-Sun contiene el día actual). Esto le
  // da orientación al user de qué semana exacta está trackeando.
  const weekRange = useMemo(() => {
    const [y, m, d] = session.weekStartDate.split('-').map(Number)
    const sat = new Date(y, m - 1, d)
    // El sábado de weekStartDate "owns" la semana Mon(+2) → Sun(+8).
    const monday = new Date(sat); monday.setDate(sat.getDate() + 2)
    const sunday = new Date(sat); sunday.setDate(sat.getDate() + 8)
    const fmt = (date: Date) =>
      date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayCopy = new Date(today)
    const isCurrent = today >= monday && todayCopy <= sunday
    const isFuture = monday > today
    return { mondayLabel: fmt(monday), sundayLabel: fmt(sunday), isCurrent, isFuture }
  }, [session.weekStartDate])

  return (
    <div className="space-y-3">
      {/* Chip con el rango de la semana — orientación visual sobre
          cuándo arranca y cuándo cierra esta sesión de KPIs. */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(217, 70, 239, 0.18)',
            border: '1px solid rgba(217, 70, 239, 0.40)',
          }}
        >
          <Calendar className="w-4 h-4 text-fuchsia-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500">
            Semana trackeada
          </p>
          <p className="text-[13px] font-semibold text-white">
            Lun {weekRange.mondayLabel} → Dom {weekRange.sundayLabel}
          </p>
        </div>
        <span
          className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full ${
            weekRange.isCurrent
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : weekRange.isFuture
                ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                : 'bg-zinc-500/15 border border-zinc-500/30 text-zinc-400'
          }`}
        >
          {weekRange.isCurrent ? 'En curso' : weekRange.isFuture ? 'Próxima' : 'Pasada'}
        </span>
      </div>

      {sessionClosed && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[11px] text-amber-200/90 flex items-start gap-2">
          <span className="text-base leading-none">ℹ️</span>
          <span>{t('kpis.spiClosedBanner')}</span>
        </div>
      )}
      <p className="text-[11px] text-zinc-500">
        {t('kpis.loadValuesHint')}
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
