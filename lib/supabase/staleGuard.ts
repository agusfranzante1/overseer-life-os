/** Guarda contra el PUSH CIEGO: no pisar en la nube algo más nuevo que lo local.
 *
 *  ── EL BUG QUE ARREGLA ───────────────────────────────────────────────────
 *  El push sube el store entero con un `upsert` **sin preguntar nada**. El
 *  merge por `updatedAt` (LWW) vive en el PULL, no en el push. Consecuencia: un
 *  dispositivo con una copia vieja en memoria pisa en la nube una edición más
 *  nueva hecha en otro lado.
 *
 *  Pasó tres veces en dos días, siempre igual: Claude marcaba una subtarea
 *  hecha por el bridge MCP (bumpeando el `updated_at` de la tarea madre), la
 *  app seguía abierta con su copia anterior, y el siguiente push la
 *  des-marcaba. Desde afuera parecía que "se revierte solo".
 *
 *  Es el hermano del bug de los tombstones que ya se arregló: aquel era el push
 *  resucitando lo BORRADO, este es el push deshaciendo lo EDITADO.
 *
 *  ── POR QUÉ NO ALCANZA CON EL MERGE DEL PULL ─────────────────────────────
 *  Porque el pull corre al iniciar, al volver el foco y al recuperar la red —
 *  no continuamente. Entre dos pulls, la app puede pushear muchas veces. El
 *  usuario ni siquiera tiene que tocar la tarea afectada: cualquier cambio
 *  dispara un push del store COMPLETO.
 *
 *  ── LA TRAMPA DE LAS FECHAS ──────────────────────────────────────────────
 *  Postgres devuelve `timestamptz` como `2026-08-31T22:23:54.589+00:00` y el
 *  cliente escribe `2026-08-31T22:23:54.589Z`. **Son el mismo instante y NO son
 *  el mismo string**, y comparados como texto `'Z' > '+'`, así que cualquier
 *  comparación lexicográfica da al revés. Por eso acá se parsea a milisegundos
 *  siempre. Ver el test.
 */

/** `true` si la copia remota es ESTRICTAMENTE más nueva que la local, o sea
 *  que pushear la local sería deshacer una edición ajena.
 *
 *  Casos borde, todos deliberados:
 *  - Sin fecha remota (fila nueva) → `false`: se pushea.
 *  - Sin fecha local pero sí remota → `true`: la local no puede demostrar ser
 *    más nueva, así que no pisa. El pull la va a traer.
 *  - Fechas iguales → `false`: pushear es inocuo y evita quedarse trabado.
 *  - Fecha ilegible de cualquier lado → `false`: ante la duda se pushea, que es
 *    el comportamiento de siempre. Esta guarda existe para EVITAR pérdidas, no
 *    para introducir una nueva vía de "no se subió nada y nadie sabe por qué".
 */
export function isRemoteNewer(local: unknown, remote: unknown): boolean {
  const r = ms(remote)
  if (r === null) return false
  const l = ms(local)
  if (l === null) return true
  return r > l
}

function ms(v: unknown): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

/** Partir en tandas para no mandar un `IN (...)` gigante. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

interface FilaConFecha { id: string; updated_at?: unknown }

/** Mínimo de lo que necesitamos de Supabase, para no atarnos al tipo del SDK. */
interface ClienteMinimo {
  from: (tabla: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: unknown[] | null; error: unknown }>
      }
    }
  }
}

/**
 * Los ids cuya copia en la nube es más nueva que la local. Esos NO se suben.
 *
 * Si la consulta falla, devuelve un set VACÍO a propósito: el push sigue como
 * antes. Bloquearlo dejaría al usuario sin sincronizar por un problema de red,
 * que es peor que el bug que esto evita.
 */
export async function findStaleIds(
  sb: ClienteMinimo,
  userId: string,
  tabla: string,
  filas: FilaConFecha[],
): Promise<Set<string>> {
  const stale = new Set<string>()
  const conFecha = filas.filter((f) => f.id)
  if (conFecha.length === 0) return stale

  const localPorId = new Map(conFecha.map((f) => [f.id, f.updated_at]))

  for (const tanda of chunk(conFecha.map((f) => f.id), 200)) {
    try {
      const { data, error } = await sb.from(tabla).select('id, updated_at')
        .eq('user_id', userId).in('id', tanda)
      if (error || !data) continue
      for (const raw of data) {
        const row = raw as { id?: string; updated_at?: unknown }
        if (!row.id) continue
        if (isRemoteNewer(localPorId.get(row.id), row.updated_at)) stale.add(row.id)
      }
    } catch {
      // Ver el comentario de arriba: ante un fallo de lectura, se pushea.
      continue
    }
  }
  return stale
}
