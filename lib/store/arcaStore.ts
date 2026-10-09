'use client'
/**
 * ARCA — los comprobantes emitidos.
 *
 * Es el historial de facturación propio: lo que se emitió desde acá y lo que
 * se importó de ARCA. Cada fila es un comprobante fiscal, y su identidad es
 * fiscal (entorno + punto de venta + tipo + número), no un id al azar — ver
 * `lib/arca/comprobante.ts`, que explica por qué eso importa.
 *
 * ── Quién escribe acá ─────────────────────────────────────────────────────
 * **La emisión la hace el SERVIDOR** (`/api/arca/facturar`), no este store:
 * el CAE es irreversible y una factura que existe en ARCA y no en Overseer es
 * una factura perdida. La ruta guarda la fila y recién después contesta; el
 * cliente la agrega acá con el mismo id para verla al instante, sin esperar
 * el pull y sin poder duplicarla.
 *
 * ── Lo que NO se guarda ───────────────────────────────────────────────────
 * Los RECHAZOS. Un comprobante rechazado no existe para ARCA (no consume
 * número ni tiene CAE): guardarlo sería inventar un historial que no es. El
 * motivo del rechazo se muestra en el formulario, donde sirve para corregir.
 *
 * Sync: una fila por comprobante en `arca_comprobantes` (patrón por-fila).
 * Regla de oro: toda mutación bumpea `updatedAt`.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ComprobanteFiscal, EntornoArca } from '@/lib/arca/comprobante'

function nowISO() { return new Date().toISOString() }

export interface ComprobanteArca extends ComprobanteFiscal {
  /** Determinista: `idComprobante(entorno, puntoVenta, tipo, numero)`. */
  id: string
  /** Nuestro: qué se facturó. La factura C no lleva detalle a ARCA, así que
   *  esto existe solo acá — y es lo único que después hace reconocible una
   *  factura en una lista de importes. */
  descripcion: string
  /** Nuestro: a quién. ARCA no devuelve el nombre, solo el documento. */
  receptorNombre: string
  /** 'A' aprobado · 'P' parcial. Los 'R' no se guardan (ver cabecera). */
  resultado: 'A' | 'P'
  /** Observaciones que devolvió ARCA (una factura puede salir aprobada CON
   *  observaciones, y perderlas es perder la única pista de un problema). */
  observaciones: string[]
  /** 'overseer' = emitido desde acá · 'importado' = traído de ARCA. */
  origen: 'overseer' | 'importado'
  createdAt: string
  updatedAt: string
}

interface State {
  comprobantes: ComprobanteArca[]
  /** Guarda o actualiza por id. Mergea sobre lo que ya había: el importador
   *  trae los datos fiscales pero NO la descripción (ARCA no la tiene), y
   *  pisarla con vacío borraría lo único que hace reconocible la factura. */
  upsertComprobante: (c: ComprobanteArca) => void
  /** Varios de una (importación). Misma regla de merge. */
  upsertMuchos: (cs: ComprobanteArca[]) => void
  /** Editar lo NUESTRO. Los campos fiscales no se tocan: son de ARCA. */
  anotarComprobante: (id: string, patch: { descripcion?: string; receptorNombre?: string }) => void
}

function mergeUno(previo: ComprobanteArca | undefined, nuevo: ComprobanteArca): ComprobanteArca {
  if (!previo) return nuevo
  return {
    ...previo,
    ...nuevo,
    // Lo nuestro solo se sobreescribe si el nuevo trae algo.
    descripcion: nuevo.descripcion || previo.descripcion,
    receptorNombre: nuevo.receptorNombre || previo.receptorNombre,
    createdAt: previo.createdAt,
    updatedAt: nowISO(),
  }
}

export const useArcaStore = create<State>()(
  persist(
    (set) => ({
      comprobantes: [],

      upsertComprobante: (c) => set((s) => {
        const previo = s.comprobantes.find((x) => x.id === c.id)
        const merged = mergeUno(previo, c)
        return {
          comprobantes: previo
            ? s.comprobantes.map((x) => x.id === c.id ? merged : x)
            : [merged, ...s.comprobantes],
        }
      }),

      upsertMuchos: (cs) => set((s) => {
        const porId = new Map(s.comprobantes.map((x) => [x.id, x]))
        for (const c of cs) porId.set(c.id, mergeUno(porId.get(c.id), c))
        return { comprobantes: [...porId.values()] }
      }),

      anotarComprobante: (id, patch) => set((s) => ({
        comprobantes: s.comprobantes.map((c) =>
          c.id !== id ? c : { ...c, ...patch, updatedAt: nowISO() }),
      })),
    }),
    {
      name: 'overseer-arca',
      partialize: (s) => ({ comprobantes: s.comprobantes }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.comprobantes)) state.comprobantes = []
      },
    },
  ),
)

// ─── Helpers puros (con test en arcaStore.test.ts) ──────────────────────────

/** Los de un entorno, más nuevos arriba.
 *
 *  Separar por entorno no es un filtro cosmético: los de homologación son
 *  pruebas sin valor fiscal y los de producción son facturas de verdad.
 *  Mezclarlos haría que el total facturado mienta. */
export function comprobantesDe(cs: ComprobanteArca[], entorno: EntornoArca): ComprobanteArca[] {
  return cs.filter((c) => c.entorno === entorno).sort((a, b) => {
    if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha)
    return b.numero - a.numero
  })
}

/** Total facturado en un entorno, opcionalmente de un mes (`YYYY-MM`). */
export function totalFacturado(cs: ComprobanteArca[], entorno: EntornoArca, mes?: string): number {
  return cs
    .filter((c) => c.entorno === entorno && (!mes || c.fecha.startsWith(mes)))
    .reduce((acc, c) => acc + c.importe, 0)
}

/** Los números que ya tenemos de un (entorno, punto de venta, tipo). Es lo que
 *  hace incremental la importación: lo que ya está no se vuelve a pedir. */
export function numerosConocidos(
  cs: ComprobanteArca[], entorno: EntornoArca, puntoVenta: number, tipo: number,
): Set<number> {
  const out = new Set<number>()
  for (const c of cs) {
    if (c.entorno === entorno && c.puntoVenta === puntoVenta && c.tipo === tipo) out.add(c.numero)
  }
  return out
}

/** Las descripciones ya usadas, de la más reciente a la más vieja, sin repetir.
 *  Sirve para ofrecerlas al facturar: si facturás siempre lo mismo, escribirlo
 *  de nuevo cada vez es la fricción que hace que no factures. */
export function descripcionesUsadas(cs: ComprobanteArca[], entorno: EntornoArca): string[] {
  const vistas = new Set<string>()
  const out: string[] = []
  for (const c of comprobantesDe(cs, entorno)) {
    const d = c.descripcion.trim()
    if (d && !vistas.has(d.toLowerCase())) { vistas.add(d.toLowerCase()); out.push(d) }
  }
  return out
}
