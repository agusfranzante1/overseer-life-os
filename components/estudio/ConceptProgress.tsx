'use client'
/**
 * Vista PROGRESO de una materia de conceptos — el checklist de estudio sobre
 * los MISMOS conceptos del mapa. Agrupa por área, con checkbox de estudiado y
 * porcentaje por área + total. La otra cara de la misma moneda que el lienzo.
 */
import { useMemo } from 'react'
import { Check, Circle, User, Layers } from 'lucide-react'
import { useConceptStore } from '@/lib/store/conceptStore'
import { conceptProgress, authorsLabel, type Concept, type ConceptArea } from '@/lib/study/concepts'

export function ConceptProgress({ materiaId, accent }: { materiaId: string; accent: string }) {
  const map = useConceptStore((s) => s.maps.find((m) => m.materiaId === materiaId) ?? null)
  const toggleStudied = useConceptStore((s) => s.toggleStudied)

  const groups = useMemo(() => {
    if (!map) return []
    // Un grupo por área (en orden), más "Sin área" al final si hay huérfanos.
    const byArea = new Map<string | null, Concept[]>()
    for (const c of map.concepts) {
      const k = c.areaId && map.areas.some((a) => a.id === c.areaId) ? c.areaId : null
      if (!byArea.has(k)) byArea.set(k, [])
      byArea.get(k)!.push(c)
    }
    const out: { area: ConceptArea | null; concepts: Concept[] }[] = []
    for (const a of map.areas) {
      const cs = byArea.get(a.id)
      if (cs && cs.length > 0) out.push({ area: a, concepts: cs })
    }
    const orphans = byArea.get(null)
    if (orphans && orphans.length > 0) out.push({ area: null, concepts: orphans })
    return out
  }, [map])

  if (!map) return null

  const overall = conceptProgress(map.concepts)

  if (map.concepts.length === 0) {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--card-bg)', border: '1px dashed rgba(255,255,255,0.10)' }}>
        <Layers className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-300 mb-1">Todavía no hay conceptos</p>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">Agregá conceptos desde la pestaña <strong>Mapa</strong> y acá vas a ver el avance de estudio de cada uno.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Barra total */}
      <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--card-bg)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-zinc-400">Avance total · {overall.done}/{overall.total} conceptos estudiados</span>
          <span className="font-mono font-bold tabular-nums text-base" style={{ color: accent }}>{overall.pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${overall.pct}%`, background: accent }} />
        </div>
      </div>

      {/* Grupos por área */}
      {groups.map(({ area, concepts }) => {
        const prog = conceptProgress(concepts)
        const color = area?.color ?? '#71717a'
        return (
          <div key={area?.id ?? 'none'} className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}88` }} />
              <span className="text-[13px] font-semibold text-white">{area?.name ?? 'Sin área'}</span>
              <span className="ml-auto text-[11px] font-mono text-zinc-500">{prog.done}/{prog.total}</span>
              <span className="text-[11px] font-mono font-semibold tabular-nums w-9 text-right" style={{ color }}>{prog.pct}%</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {concepts.map((c) => {
                const authors = authorsLabel(c)
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleStudied(materiaId, c.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors group"
                  >
                    <span className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                      c.studied ? 'bg-emerald-500' : 'border border-zinc-600 group-hover:border-zinc-400'
                    }`}>
                      {c.studied ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /> : <Circle className="w-0 h-0" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-medium truncate ${c.studied ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                        {c.title.trim() || <span className="italic text-zinc-600">Sin título</span>}
                      </p>
                      {authors && (
                        <p className="flex items-center gap-1 text-[11px] text-zinc-500 truncate">
                          <User className="w-3 h-3 shrink-0" /> {authors}
                          {c.sources.length > 1 && <span className="text-zinc-600">· {c.sources.length} aportes</span>}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
