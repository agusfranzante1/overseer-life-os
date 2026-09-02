'use client'

/** Qué build está corriendo ESTA pestaña, y cuál está deployado.
 *
 *  No es un adorno. Una pestaña abierta sigue ejecutando el JS del momento en
 *  que se cargó: puede estar corriendo un build sin los arreglos del sync
 *  mientras el servidor ya tiene otro. Eso ya borró la configuración del
 *  sidebar en todos los dispositivos (BASE nº3) y, más acá, resucitó tareas
 *  que se habían borrado desde el bridge. En los dos casos el síntoma fue
 *  "la app hace cualquier cosa" y la causa era invisible.
 *
 *  Con esto se ve de un vistazo: si los dos números no coinciden, recargar.
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'

const LOCAL = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'ok'; remoto: string }
  | { tipo: 'viejo'; remoto: string }
  | { tipo: 'error'; detalle: string }

export function VersionSection() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })

  const chequear = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    try {
      // `cache: 'no-store'` es el punto entero: con caché, esta comprobación
      // podría devolver la versión vieja y decir que está todo bien.
      const r = await fetch('/api/version', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as { buildId?: string }
      const remoto = j.buildId ?? '?'
      setEstado(remoto === LOCAL ? { tipo: 'ok', remoto } : { tipo: 'viejo', remoto })
    } catch (e) {
      setEstado({ tipo: 'error', detalle: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  useEffect(() => { void chequear() }, [chequear])

  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Versión</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Si esta pestaña quedó en un build viejo, puede deshacer cambios hechos en otro lado.
          </p>
        </div>
        <button
          onClick={() => void chequear()}
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Revisar
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Esta pestaña</dt>
          <dd className="mt-0.5 font-mono text-sm text-zinc-900 dark:text-zinc-100 tabular-nums">{LOCAL}</dd>
        </div>
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Deployado</dt>
          <dd className="mt-0.5 font-mono text-sm text-zinc-900 dark:text-zinc-100 tabular-nums">
            {estado.tipo === 'cargando' ? '…' : estado.tipo === 'error' ? '—' : estado.remoto}
          </dd>
        </div>
      </dl>

      {estado.tipo === 'ok' && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Estás en la última versión.
        </p>
      )}

      {estado.tipo === 'viejo' && (
        <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2.5">
          <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              Esta pestaña quedó en un build viejo. Recargá antes de seguir trabajando: si no, puede
              pisar o resucitar cosas que se cambiaron desde otro dispositivo.
            </span>
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
          >
            Recargar ahora
          </button>
        </div>
      )}

      {estado.tipo === 'error' && (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          No se pudo consultar la versión deployada ({estado.detalle}). Puede ser que estés sin conexión.
        </p>
      )}
    </section>
  )
}
