'use client'
import { useState, useMemo } from 'react'
import { Loader2, DownloadCloud, Repeat2, Pencil, Check, X } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'
import {
  useArcaStore, comprobantesDe, numerosConocidos, type ComprobanteArca,
} from '@/lib/store/arcaStore'
import {
  numeroVisible, nombreTipo, repetirBorrador, type BorradorRepetido, type EntornoArca,
} from '@/lib/arca/comprobante'
import { CBTE, DOC } from '@/lib/arca/facturaC'

/** El historial de comprobantes.
 *
 *  ── "Traer de ARCA" ─────────────────────────────────────────────────────
 *  ARCA **no tiene un método que liste las facturas**: `FECompConsultar`
 *  devuelve UNA por (punto de venta, tipo, número). El historial se
 *  reconstruye recorriendo hacia atrás desde el último autorizado, salteando
 *  lo que ya tenemos. Por eso el botón trae un LOTE y dice cuántos quedan: es
 *  honesto sobre que son N llamadas, no una descarga.
 *
 *  ── Por qué se separa por entorno ───────────────────────────────────────
 *  Los de homologación son pruebas sin valor fiscal. Mezclarlos con los de
 *  producción haría que el total facturado mienta.
 */

const peso = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

/** `2026-10` → "octubre 2026". */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function nombreMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MESES[m - 1] ?? ym} ${y}`
}

function hoyLocal(timezone: string): string {
  const f = (tz: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  try { return f(timezone) } catch { return f('America/Argentina/Buenos_Aires') }
}

interface Props {
  entorno: EntornoArca
  puntosDeVenta: { nro: number; bloqueado: boolean }[]
  onRepetir: (b: BorradorRepetido) => void
}

export function ComprobantesList({ entorno, puntosDeVenta, onRepetir }: Props) {
  const timezone = useAppStore((s) => s.timezone)
  const todos = useArcaStore((s) => s.comprobantes)
  const upsertMuchos = useArcaStore((s) => s.upsertMuchos)
  const anotar = useArcaStore((s) => s.anotarComprobante)

  const [trayendo, setTrayendo] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [borradorNota, setBorradorNota] = useState({ descripcion: '', receptorNombre: '' })

  const lista = useMemo(() => comprobantesDe(todos, entorno), [todos, entorno])

  // Agrupados por mes, con su total. Un monotributista mira el mes, no el día.
  const porMes = useMemo(() => {
    const mapa = new Map<string, ComprobanteArca[]>()
    for (const c of lista) {
      const ym = c.fecha.slice(0, 7) || 'sin-fecha'
      const arr = mapa.get(ym) ?? []
      arr.push(c)
      mapa.set(ym, arr)
    }
    return [...mapa.entries()]
  }, [lista])

  const traer = async () => {
    setTrayendo(true)
    setResultado(null)
    const pv = puntosDeVenta.filter((p) => !p.bloqueado)[0]?.nro ?? lista[0]?.puntoVenta ?? 1
    try {
      const r = await fetch('/api/arca/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puntoVenta: pv,
          tipo: CBTE.facturaC,
          yaTengo: [...numerosConocidos(todos, entorno, pv, CBTE.facturaC)],
        }),
      })
      const j = await r.json() as {
        ok: boolean; error?: string; mensaje?: string
        traidos?: number; restan?: number; ultimo?: number
        comprobantes?: ComprobanteArca[]
      }
      if (!j.ok) {
        setResultado(j.error ?? `El servidor respondió ${r.status} sin explicar por qué.`)
        return
      }
      if (j.comprobantes && j.comprobantes.length > 0) upsertMuchos(j.comprobantes)
      setResultado(j.mensaje ?? (
        (j.traidos ?? 0) === 0
          ? `No había nada nuevo (el último de ARCA es el nº ${j.ultimo ?? 0}).`
          : `Se trajeron ${j.traidos} comprobantes.${(j.restan ?? 0) > 0 ? ` Quedan ${j.restan} más atrás: tocá de nuevo.` : ''}`
      ))
    } catch (e) {
      setResultado(`No se pudo traer: ${e instanceof Error ? e.message : 'error de red'}`)
    } finally {
      setTrayendo(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-zinc-500">
          {lista.length === 0 ? 'Todavía no hay comprobantes.'
            : `${lista.length} comprobante${lista.length === 1 ? '' : 's'} · ${peso(lista.reduce((a, c) => a + c.importe, 0))} en total`}
        </p>
        <button onClick={traer} disabled={trayendo}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:border-zinc-600 hover:text-white transition-colors disabled:opacity-50">
          {trayendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
          Traer de ARCA
        </button>
      </div>

      {resultado && (
        <p className="text-xs text-zinc-400 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2.5 leading-relaxed">
          {resultado}
        </p>
      )}

      {lista.length === 0 ? (
        <div className="text-xs text-zinc-600 leading-relaxed border border-dashed border-white/[0.08] rounded-xl p-5">
          {entorno === 'homologacion'
            ? <>Estás en <strong className="text-zinc-400">homologación</strong>: acá solo aparecen las facturas
              de prueba. Las reales viven en producción, que es un entorno separado con su propio
              certificado.</>
            : <>Emitís la primera desde &quot;Emitir&quot;, o tocás &quot;Traer de ARCA&quot; para
              importar las que ya hayas hecho por otro medio.</>}
        </div>
      ) : porMes.map(([ym, cs]) => (
        <section key={ym} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-1.5">
            <h3 className="text-xs font-bold text-zinc-300 first-letter:uppercase">{nombreMes(ym)}</h3>
            <span className="text-xs text-zinc-500 font-mono">{peso(cs.reduce((a, c) => a + c.importe, 0))}</span>
          </div>
          <ul className="space-y-1.5">
            {cs.map((c) => {
              const enEdicion = editando === c.id
              return (
                <li key={c.id} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate">
                        {c.descripcion || c.receptorNombre || nombreTipo(c.tipo)}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {nombreTipo(c.tipo)} {numeroVisible(c.puntoVenta, c.numero)} · {c.fecha}
                        {c.receptorNombre && c.descripcion && <> · {c.receptorNombre}</>}
                        {c.docTipo !== DOC.consumidorFinal && c.docNro !== '0' && <> · {c.docNro}</>}
                        {c.origen === 'importado' && <span className="text-zinc-600"> · importado</span>}
                      </p>
                      {c.cae && (
                        <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
                          CAE {c.cae}{c.vencimientoCae ? ` · vence ${c.vencimientoCae}` : ''}
                        </p>
                      )}
                      {c.observaciones.length > 0 && (
                        <p className="text-[10px] text-amber-400/80 mt-1">{c.observaciones.join(' · ')}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-mono text-zinc-200">{peso(c.importe)}</span>
                      <button title="Repetir esta factura"
                        onClick={() => onRepetir(repetirBorrador(c, hoyLocal(timezone)))}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors">
                        <Repeat2 className="w-4 h-4" />
                      </button>
                      <button title="Anotar de qué fue"
                        onClick={() => {
                          setEditando(enEdicion ? null : c.id)
                          setBorradorNota({ descripcion: c.descripcion, receptorNombre: c.receptorNombre })
                        }}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Anotar es para los importados: ARCA no guarda el detalle,
                      así que sin esto una factura traída es un importe suelto. */}
                  {enEdicion && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input autoFocus placeholder="Qué fue"
                        className="bg-black/30 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:outline-none"
                        value={borradorNota.descripcion}
                        onChange={(e) => setBorradorNota((b) => ({ ...b, descripcion: e.target.value }))} />
                      <div className="flex gap-2">
                        <input placeholder="Cliente"
                          className="flex-1 min-w-0 bg-black/30 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:outline-none"
                          value={borradorNota.receptorNombre}
                          onChange={(e) => setBorradorNota((b) => ({ ...b, receptorNombre: e.target.value }))} />
                        <button onClick={() => { anotar(c.id, borradorNota); setEditando(null) }}
                          className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditando(null)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-white/[0.06]">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
