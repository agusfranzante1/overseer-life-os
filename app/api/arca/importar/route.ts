import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { leerConfig, ultimoAutorizado, consultarComprobante } from '@/lib/arca/cliente'
import { almacenSupabase } from '@/lib/arca/almacenTicket'
import { CBTE } from '@/lib/arca/facturaC'
import { idComprobante, numerosAImportar, type ComprobanteFiscal } from '@/lib/arca/comprobante'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/arca/importar — trae de ARCA los comprobantes ya emitidos.
 *
 *  ── Por qué se recorre de a uno ─────────────────────────────────────────
 *  **El webservice no tiene un método que liste todo.** `FECompConsultar`
 *  consulta UN comprobante por (punto de venta, tipo, número). Así que el
 *  historial se reconstruye recorriendo de 1 hasta `FECompUltimoAutorizado`.
 *  Para un monotributista son decenas de llamadas, no miles.
 *
 *  Tres cosas lo hacen barato en vez de una barrida eterna:
 *    · se arranca por los más NUEVOS (es lo que uno quiere ver primero),
 *    · se saltean los números que el cliente ya tiene (`yaTengo`), así la
 *      segunda corrida casi no pide nada,
 *    · y el lote está topeado: `max` por llamada, con `restan` en la
 *      respuesta para que la UI pueda seguir si falta.
 *
 *  ── Lo que NO hace ──────────────────────────────────────────────────────
 *  No toca la descripción ni el nombre del receptor de un comprobante que ya
 *  estaba: ARCA no guarda esos datos (en la factura C no viajan), y pisarlos
 *  con vacío borraría lo único que hace reconocible una factura en una lista
 *  de importes. El merge del store lo garantiza, y acá se respeta igual.
 *
 *  **Solo lee de ARCA.** No emite nada.
 */
export async function POST(req: Request) {
  const sb = await getSupabaseServer().catch(() => null)
  const user = sb ? (await sb.auth.getUser()).data.user : null
  if (!user) return NextResponse.json({ ok: false, error: 'No estás logueado.' }, { status: 401 })

  const cfg = leerConfig()
  if (!cfg.ok) {
    return NextResponse.json({
      ok: false, error: `Faltan credenciales en el servidor: ${cfg.faltan.join(', ')}.`,
    }, { status: 503 })
  }
  const { config } = cfg

  let body: Record<string, unknown> = {}
  try { body = await req.json() as Record<string, unknown> } catch { /* todo opcional */ }

  const puntoVenta = Number(body.puntoVenta ?? 0)
  const tipo = Number(body.tipo ?? CBTE.facturaC)
  const max = Math.min(Math.max(1, Number(body.max ?? 40)), 100)
  const yaTengo = new Set<number>(
    Array.isArray(body.yaTengo) ? (body.yaTengo as unknown[]).map(Number).filter(Number.isFinite) : [],
  )
  if (!Number.isInteger(puntoVenta) || puntoVenta <= 0) {
    return NextResponse.json({ ok: false, error: 'Falta el punto de venta.' }, { status: 400 })
  }

  const almacen = almacenSupabase(user.id, config.entorno)

  let ultimo: number
  try {
    ultimo = await ultimoAutorizado(config, puntoVenta, tipo, almacen)
  } catch (e) {
    // El motivo más probable, y el que más desorienta: ARCA obliga a tener un
    // punto de venta DISTINTO para "Comprobantes en línea" (la web) y para
    // webservice, y por webservice solo se puede consultar el segundo. El
    // error crudo de ARCA no dice nada de eso.
    const crudo = msg(e)
    const esPuntoDeVenta = /punto de venta|1502|602/i.test(crudo)
    return NextResponse.json({
      ok: false, etapa: 'numeracion',
      error: esPuntoDeVenta
        ? `ARCA no reconoce el punto de venta ${String(puntoVenta).padStart(5, '0')} para webservice: ${crudo}. `
          + 'Los comprobantes hechos por la web de ARCA viven en otro punto de venta, y por webservice solo se consultan los habilitados para webservice. '
          + 'Para esos queda el CSV de Mis Comprobantes.'
        : `No se pudo leer el último comprobante autorizado: ${crudo}`,
    }, { status: 502 })
  }

  if (ultimo <= 0) {
    return NextResponse.json({
      ok: true, entorno: config.entorno, ultimo, pedidos: 0, traidos: 0, restan: 0,
      comprobantes: [],
      mensaje: config.entorno === 'homologacion'
        ? 'No hay comprobantes emitidos en este punto de venta de HOMOLOGACIÓN. Tus facturas reales viven en producción: son dos entornos separados.'
        : 'No hay comprobantes emitidos en este punto de venta.',
    })
  }

  const pedir = numerosAImportar(ultimo, yaTengo, max)
  const ahora = new Date().toISOString()
  const comprobantes: Record<string, unknown>[] = []
  const fallos: string[] = []

  for (const n of pedir) {
    try {
      const c = await consultarComprobante(config, puntoVenta, tipo, n, almacen)
      if (!c) continue                              // el número no existe: hueco o anulado
      const fiscal: ComprobanteFiscal = {
        entorno: config.entorno,
        puntoVenta, tipo,
        numero: c.numero || n,
        fecha: c.fecha,
        concepto: c.concepto,
        docTipo: c.docTipo,
        docNro: c.docNro,
        importe: c.importe,
        condicionIvaReceptor: c.condicionIvaReceptor,
        cae: c.cae,
        vencimientoCae: c.vencimientoCae,
        servicioDesde: c.servicioDesde,
        servicioHasta: c.servicioHasta,
        vencimientoPago: c.vencimientoPago,
      }
      comprobantes.push({
        ...fiscal,
        id: idComprobante(config.entorno, puntoVenta, tipo, fiscal.numero),
        // Vacías a propósito: ARCA no las tiene. El merge del store NO pisa
        // con vacío lo que ya estuviera escrito.
        descripcion: '',
        receptorNombre: '',
        resultado: 'A' as const,
        observaciones: c.observaciones,
        origen: 'importado' as const,
        createdAt: ahora,
        updatedAt: ahora,
      })
    } catch (e) {
      // Un número que falla no corta la importación, pero SE CUENTA y se
      // devuelve: una importación a medias que se presenta como completa es
      // exactamente el fallo mudo que no queremos (BASE nº6).
      fallos.push(`nº ${n}: ${msg(e)}`)
      if (fallos.length >= 3) break                 // algo está mal de fondo (token, PV)
    }
  }

  const guardados = await guardar(user.id, comprobantes, ahora)

  return NextResponse.json({
    ok: true,
    entorno: config.entorno,
    ultimo,
    pedidos: pedir.length,
    traidos: comprobantes.length,
    restan: Math.max(0, ultimo - yaTengo.size - comprobantes.length),
    guardados,
    comprobantes,
    fallos: fallos.length > 0 ? fallos : undefined,
    mensaje: fallos.length > 0
      ? `Se trajeron ${comprobantes.length} comprobantes, pero ${fallos.length} fallaron.`
      : undefined,
  })
}

/** Guarda las filas con el service role. Devuelve cuántas quedaron.
 *
 *  No pisa la descripción de una fila que ya existía: se leen primero los
 *  payloads que haya y se mergea lo nuestro encima (misma regla que el store;
 *  ver BASE nº3 — un upsert con el payload armado de cero borra lo que el
 *  que escribe no conoce). */
async function guardar(
  userId: string, comprobantes: Record<string, unknown>[], ahora: string,
): Promise<number> {
  if (comprobantes.length === 0) return 0
  try {
    const admin = getSupabaseAdmin()
    const ids = comprobantes.map((c) => String(c.id))
    const previos = new Map<string, Record<string, unknown>>()
    const prev = await admin.from('arca_comprobantes').select('id, payload')
      .eq('user_id', userId).in('id', ids)
    for (const row of prev.data ?? []) {
      previos.set(String(row.id), (row.payload ?? {}) as Record<string, unknown>)
    }

    const rows = comprobantes.map((c) => {
      const p = previos.get(String(c.id))
      const payload = !p ? c : {
        ...p, ...c,
        descripcion: c.descripcion || p.descripcion || '',
        receptorNombre: c.receptorNombre || p.receptorNombre || '',
        origen: p.origen ?? c.origen,
        createdAt: p.createdAt ?? c.createdAt,
      }
      return {
        id: String(c.id),
        user_id: userId,
        created_at: String(payload.createdAt ?? ahora),
        updated_at: ahora,
        payload,
      }
    })
    const r = await admin.from('arca_comprobantes').upsert(rows)
    return r.error ? 0 : rows.length
  } catch {
    return 0
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido'
}
