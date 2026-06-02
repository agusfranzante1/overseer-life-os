'use client'
import { useMemo, useState } from 'react'
import { Target, Plus, Minus, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react'
import { useKpisStore, parseKpiValue, kpiCompletionPct, serializeKpiValue } from '@/lib/store/kpisStore'
import type { KPIDefinition } from '@/lib/kpi/types'
import type { SPISession } from '@/lib/spi/types'
import {
  readKpiValue, readKpiTargetOverride,
  KPI_VALUES_SECTION,
} from '@/lib/kpi/sessionHelpers'
import Link from 'next/link'

/** Scoreboard de KPIs dentro de una sesión SPI semanal. Renderea los
 *  KPIs activos PARA ESTA SEMANA — los que están en `session.selectedKpiIds`.
 *  Esa lista se hereda automáticamente de la sesión anterior al crear
 *  la nueva semana (ver `createOrOpenCurrentWeek` en el store), pero el
 *  usuario puede ajustarla aquí con "Editar KPIs activos esta semana"
 *  o desde los chips por área del bloque "Qué buscás esta semana".
 *
 *  La library completa vive en /kpis. */
export function KpiScoreboard({
  session,
  isClosed,
  onSelectedChange,
  onValueChange,
}: {
  session: SPISession
  isClosed: boolean
  /** Reescribe `session.selectedKpiIds` (agregar/quitar para esta semana). */
  onSelectedChange: (next: string[]) => void
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
}) {
  const library = useKpisStore((s) => s.definitions)
  const [showPicker, setShowPicker] = useState(false)

  const selected = session.selectedKpiIds ?? []
  const selectedDefs = useMemo(() => {
    return selected
      .map((id) => library.find((d) => d.id === id))
      .filter((d): d is KPIDefinition => !!d && !d.archivedAt)
  }, [selected, library])

  // Library elegible: KPIs activos + ya activados antes del sábado de
  // esta sesión. Es lo que el picker muestra como opciones.
  const eligibleLibrary = useMemo(() => {
    return library.filter(
      (d) => !d.archivedAt && d.activatedAt <= session.weekStartDate
    )
  }, [library, session.weekStartDate])

  // Agrupar por `group` para render organizado.
  const grouped = useMemo(() => {
    const map = new Map<string, KPIDefinition[]>()
    for (const d of selectedDefs) {
      const k = d.group || 'Otros'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(d)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [selectedDefs])

  return (
    <div className="bg-zinc-950/60 border border-fuchsia-500/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-fuchsia-400" />
          <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300">
            📊 KPIs de esta semana
          </p>
          <span className="text-[10px] text-zinc-600">· {selectedDefs.length} activos</span>
        </div>
        <div className="flex items-center gap-1">
          {!isClosed && (
            <button
              onClick={() => setShowPicker(true)}
              className="text-[10px] font-mono text-fuchsia-300 hover:text-fuchsia-200 hover:bg-fuchsia-500/10 transition-colors px-2 py-1 rounded flex items-center gap-1"
              title="Cambiar qué KPIs trackeás esta semana — heredado de la anterior por default"
            >
              <Pencil className="w-3 h-3" /> Editar
            </button>
          )}
          <Link
            href="/kpis"
            className="text-[10px] font-mono text-fuchsia-300/70 hover:text-fuchsia-200 hover:bg-fuchsia-500/10 transition-colors px-2 py-1 rounded"
          >
            library →
          </Link>
        </div>
      </div>

      {selectedDefs.length === 0 ? (
        <div className="bg-zinc-900/60 border border-dashed border-zinc-800 rounded-lg p-4 text-center">
          <p className="text-xs text-zinc-400 mb-2">
            Sin KPIs activos esta semana.
          </p>
          {eligibleLibrary.length === 0 ? (
            <p className="text-[10px] text-zinc-600">
              Tu library está vacía. Andá a{' '}
              <Link href="/kpis" className="text-fuchsia-300 hover:text-fuchsia-200 underline decoration-fuchsia-500/30">
                /kpis
              </Link>{' '}
              y creá el primero — o agregalo desde una sección de área en "Qué buscás esta semana".
            </p>
          ) : !isClosed ? (
            <button
              onClick={() => setShowPicker(true)}
              className="text-[11px] font-mono text-fuchsia-300 hover:text-fuchsia-200 hover:bg-fuchsia-500/10 transition-colors px-3 py-1.5 rounded inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Activar KPIs
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([groupName, items]) => (
            <KpiGroup
              key={groupName}
              groupName={groupName}
              kpis={items}
              session={session}
              isClosed={isClosed}
              onValueChange={onValueChange}
            />
          ))}
        </div>
      )}

      {showPicker && (
        <KpiPickerModal
          eligible={eligibleLibrary}
          selected={selected}
          onClose={() => setShowPicker(false)}
          onChange={onSelectedChange}
        />
      )}
    </div>
  )
}

// ─── Picker modal ───────────────────────────────────────────────────

function KpiPickerModal({
  eligible, selected, onClose, onChange,
}: {
  eligible: KPIDefinition[]
  selected: string[]
  onClose: () => void
  onChange: (next: string[]) => void
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id))
    else onChange([...selected, id])
  }
  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-white">KPIs activos esta semana</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[11px] text-zinc-500 px-5 pt-3 italic">
          Estos son los que aparecen en el scoreboard semanal. La próxima sesión los hereda — desactiva los que esta semana NO vayas a trabajar (ej. cambiás guitarra por piano).
        </p>
        <div className="p-5 space-y-2">
          {eligible.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-6">
              Sin KPIs en la library.{' '}
              <Link href="/kpis" className="text-fuchsia-300 hover:text-fuchsia-200 underline">Creá uno en /kpis</Link>.
            </p>
          ) : eligible.map((kpi) => {
            const active = selected.includes(kpi.id)
            return (
              <button
                key={kpi.id}
                onClick={() => toggle(kpi.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                  active ? 'bg-fuchsia-500/10 border-fuchsia-500/40' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <span className="text-lg">{kpi.icon}</span>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-zinc-200 truncate">{kpi.name}</p>
                  <p className="text-[10px] text-zinc-600">
                    {kpi.kind}
                    {kpi.target !== undefined && ` · target ${kpi.target}${kpi.kind === 'percent' ? '%' : ''}`}
                    {kpi.group && ` · ${kpi.group}`}
                  </p>
                </div>
                <span className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  active ? 'border-fuchsia-400 bg-fuchsia-400/20' : 'border-zinc-700'
                }`}>
                  {active && <Plus className="w-3 h-3 text-fuchsia-300 rotate-45" />}
                </span>
              </button>
            )
          })}
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between">
          <Link href="/kpis" className="text-[10px] text-fuchsia-300 hover:text-fuchsia-200 underline decoration-fuchsia-500/30">
            Editar library →
          </Link>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 text-fuchsia-300 text-xs font-bold">
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Grupo (collapsible) ─────────────────────────────────────────────

function KpiGroup({
  groupName, kpis, session, isClosed, onValueChange,
}: {
  groupName: string
  kpis: KPIDefinition[]
  session: SPISession
  isClosed: boolean
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 mb-1.5"
      >
        {open ? <ChevronDown className="w-3 h-3 text-zinc-600" /> : <ChevronUp className="w-3 h-3 text-zinc-600" />}
        <span className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300/80">{groupName}</span>
        <div className="flex-1 h-px bg-fuchsia-500/15" />
      </button>
      {open && (
        <div className="space-y-1.5">
          {kpis.map((kpi) => (
            <KpiRow
              key={kpi.id}
              kpi={kpi}
              session={session}
              isClosed={isClosed}
              onValueChange={onValueChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fila con widget ─────────────────────────────────────────────────

function KpiRow({
  kpi, session, isClosed, onValueChange,
}: {
  kpi: KPIDefinition
  session: SPISession
  isClosed: boolean
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
}) {
  const override = readKpiTargetOverride(session, kpi.id)
  const target = override ?? kpi.target
  const value = readKpiValue(session, kpi.id, kpi.kind)
  const pct = kpiCompletionPct(value, target, kpi.kind)

  const setValue = (v: number) => {
    onValueChange(KPI_VALUES_SECTION, kpi.id, serializeKpiValue(v, kpi.kind))
  }

  const barColor = pct === null
    ? '#52525b'
    : pct >= 100 ? '#10b981'
    : pct >= 75 ? '#34d399'
    : pct >= 50 ? '#f59e0b'
    : '#ef4444'

  return (
    <div
      className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-3"
      style={{ borderLeft: `3px solid ${kpi.color}` }}
    >
      <span className="text-base shrink-0">{kpi.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-zinc-200 truncate">{kpi.name}</span>
          {pct !== null && (
            <span className="text-[10px] font-mono tabular-nums" style={{ color: barColor }}>
              {pct}%
            </span>
          )}
        </div>
        {/* Barra de progreso solo cuando hay target. */}
        {pct !== null && (
          <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>
        )}
      </div>
      {/* Widget según kind */}
      <div className="shrink-0">
        {kpi.kind === 'count' && (
          <CountWidget
            value={value}
            target={target}
            disabled={isClosed}
            onChange={setValue}
          />
        )}
        {kpi.kind === 'percent' && (
          <PercentWidget
            value={value}
            disabled={isClosed}
            onChange={setValue}
          />
        )}
        {kpi.kind === 'boolean' && (
          <BoolWidget
            value={value > 0}
            disabled={isClosed}
            onChange={(b) => setValue(b ? 1 : 0)}
          />
        )}
      </div>
    </div>
  )
}

function CountWidget({
  value, target, disabled, onChange,
}: { value: number; target?: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
      <button
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="text-xs tabular-nums font-semibold text-zinc-100 min-w-[2rem] text-center">
        {value}{target !== undefined && <span className="text-zinc-600">/{target}</span>}
      </span>
      <button
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function PercentWidget({
  value, disabled, onChange,
}: { value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0} max={100} step={5}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-24 accent-fuchsia-400 disabled:opacity-40"
      />
      <span className="text-xs tabular-nums font-semibold text-zinc-100 min-w-[2.5rem] text-right">
        {Math.round(value)}%
      </span>
    </div>
  )
}

function BoolWidget({
  value, disabled, onChange,
}: { value: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
        value
          ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
          : 'bg-zinc-900 border border-zinc-700 text-zinc-500 hover:border-zinc-600'
      } disabled:opacity-40`}
    >
      {value ? '✓ Sí' : 'No'}
    </button>
  )
}

// re-export silencioso para que tsc no se queje
export { parseKpiValue }
