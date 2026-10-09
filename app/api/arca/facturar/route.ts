import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { leerConfig, ultimoAutorizado, solicitarCae } from '@/lib/arca/cliente'
import { almacenSupabase } from '@/lib/arca/almacenTicket'
import { armarDetalleC, validarFacturaC, CBTE, type BorradorFacturaC } from '@/lib/arca/facturaC'
import { idComprobante, proximoNumero, type ComprobanteFiscal } from '@/lib/arca/comprobante'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/arca/facturar — **EMITE** una factura C.
 *
 *  ⚠️ Esto NO es reversible. Un comprobante con CAE existe para ARCA y solo
 *  se deshace con una nota de crédito. Por eso el orden de acá es el orden, y
 *  no una preferencia de estilo:
 *
 *    1. VALIDAR todo lo validable sin red (`validarFacturaC`). Un rechazo de
 *       ARCA cuesta un viaje y devuelve un código que no dice nada.
 *    2. Pedir `FECompUltimoAutorizado` y usar ese + 1. La numeración es
 *       consecutiva por (punto de venta, tipo) y cualquier salto se rechaza;
 *       el número NO se elige.
 *    3. Pedir el CAE.
 *    4. **Guardar la fila ACÁ**, del lado del servidor, antes de contestar.
 *
 *  El punto 4 es el que importa: si el comprobante solo se guardara cuando el
 *  navegador recibe la respuesta, una pestaña que se cierra (o un celular que
 *  pierde señal) dejaría una factura viva en ARCA y ausente en Overseer. Y
 *  como el id es determinista (entorno + punto de venta + tipo + número), que
 *  el cliente la agregue también a su store no puede duplicarla.
 *
 *  Si el CAE sale pero el guardado falla, se dice explícitamente en la
 *  respuesta con el número de comprobante: la factura existe y hay que
 *  traerla con "Traer de ARCA" (BASE nº6 — un fallo mudo acá es una factura
 *  que nadie sabe que emitió).
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

  let body: Record<string, unknown>
  try { body = await req.json() as Record<string, unknown> }
  catch { return NextResponse.json({ ok: false, error: 'El pedido no es JSON válido.' }, { status: 400 }) }

  const borrador: BorradorFacturaC = {
    puntoVenta: Number(body.puntoVenta ?? 0),
    tipo: Number(body.tipo ?? CBTE.facturaC) as BorradorFacturaC['tipo'],
    concepto: Number(body.concepto ?? 2) as BorradorFacturaC['concepto'],
    docTipo: Number(body.docTipo ?? 99) as BorradorFacturaC['docTipo'],
    docNro: String(body.docNro ?? '0'),
    importe: Number(body.importe ?? 0),
    fecha: String(body.fecha ?? ''),
    servicioDesde: body.servicioDesde ? String(body.servicioDesde) : undefined,
    servicioHasta: body.servicioHasta ? String(body.servicioHasta) : undefined,
    vencimientoPago: body.vencimientoPago ? String(body.vencimientoPago) : undefined,
  }
  const descripcion = String(body.descripcion ?? '').slice(0, 500)
  const receptorNombre = String(body.receptorNombre ?? '').slice(0, 200)

  // "Hoy" se mide en la zona del USUARIO, no en UTC: después de las 21 en
  // Argentina ya es el día siguiente en UTC, y eso le correría la ventana de
  // fechas que ARCA acepta.
  const hoy = hoyEnZona(String(body.timezone ?? 'America/Argentina/Buenos_Aires'))
  const errores = validarFacturaC(borrador, hoy)
  if (errores.length > 0) {
    return NextResponse.json({ ok: false, etapa: 'validacion', error: errores.join(' '), errores }, { status: 400 })
  }

  const almacen = almacenSupabase(user.id, config.entorno)

  let numero: number
  try {
    numero = proximoNumero(await ultimoAutorizado(config, borrador.puntoVenta, borrador.tipo, almacen))
  } catch (e) {
    return NextResponse.json({
      ok: false, etapa: 'numeracion',
      error: `No se pudo saber qué número sigue: ${msg(e)}`,
    }, { status: 502 })
  }

  let res: Awaited<ReturnType<typeof solicitarCae>>
  try {
    res = await solicitarCae(config, borrador.puntoVenta, borrador.tipo,
      armarDetalleC(borrador, numero, hoy), almacen)
  } catch (e) {
    return NextResponse.json({
      ok: false, etapa: 'cae', numeroIntentado: numero,
      error: `ARCA no procesó el pedido: ${msg(e)}`,
    }, { status: 502 })
  }

  if (res.resultado === 'R' || !res.cae) {
    // Rechazado: no hay comprobante. No se guarda nada (ver la cabecera del
    // store) y se devuelven los motivos tal cual los dio ARCA.
    return NextResponse.json({
      ok: false, etapa: 'rechazado', resultado: res.resultado,
      error: res.observaciones.length > 0
        ? res.observaciones.join(' · ')
        : 'ARCA rechazó el comprobante sin explicar por qué.',
      observaciones: res.observaciones,
    }, { status: 422 })
  }

  const fiscal: ComprobanteFiscal = {
    entorno: config.entorno,
    puntoVenta: borrador.puntoVenta,
    tipo: borrador.tipo,
    numero: res.numero ?? numero,
    fecha: borrador.fecha,
    concepto: borrador.concepto,
    docTipo: borrador.docTipo,
    docNro: borrador.docNro,
    importe: Math.round(borrador.importe * 100) / 100,
    cae: res.cae,
    vencimientoCae: deFechaArca(res.vencimientoCae),
    servicioDesde: borrador.servicioDesde,
    servicioHasta: borrador.servicioHasta,
    vencimientoPago: borrador.vencimientoPago,
  }
  const ahora = new Date().toISOString()
  const comprobante = {
    ...fiscal,
    id: idComprobante(config.entorno, fiscal.puntoVenta, fiscal.tipo, fiscal.numero),
    descripcion,
    receptorNombre,
    resultado: res.resultado as 'A' | 'P',
    observaciones: res.observaciones,
    origen: 'overseer' as const,
    createdAt: ahora,
    updatedAt: ahora,
  }

  const guardado = await guardar(user.id, comprobante, ahora)

  return NextResponse.json({
    ok: true,
    comprobante,
    guardado,
    // Si el CAE salió y el guardado falló, la factura EXISTE en ARCA. Decirlo.
    aviso: guardado ? undefined
      : `La factura se emitió (CAE ${res.cae}), pero no se pudo guardar en Overseer. Usá "Traer de ARCA" para recuperarla.`,
  })
}

async function guardar(
  userId: string, comprobante: { id: string }, ahora: string,
): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin()
    const r = await admin.from('arca_comprobantes').upsert({
      id: comprobante.id,
      user_id: userId,
      created_at: ahora,
      updated_at: ahora,
      payload: comprobante,
    })
    return !r.error
  } catch {
    return false
  }
}

/** `YYYYMMDD` → `YYYY-MM-DD`. */
function deFechaArca(v: string | undefined): string | undefined {
  if (!v || !/^\d{8}$/.test(v)) return undefined
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
}

/** `YYYY-MM-DD` de hoy en una zona horaria. */
function hoyEnZona(timezone: string): string {
  const conZona = (tz: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  try { return conZona(timezone) } catch { return conZona('America/Argentina/Buenos_Aires') }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido'
}
