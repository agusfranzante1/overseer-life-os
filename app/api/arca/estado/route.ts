import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import {
  leerConfig, estadoServidores, obtenerTicket, puntosDeVenta, esTicketVigente,
  condicionesIvaReceptor,
} from '@/lib/arca/cliente'
import { almacenSupabase } from '@/lib/arca/almacenTicket'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/arca/estado — ¿está todo listo para facturar?
 *
 *  Prueba la cadena en TRES tramos separados, porque los tres fallan distinto
 *  y desde afuera se ven igual ("no puedo facturar"):
 *
 *    1. CONFIG      — ¿están el CUIT, el certificado y la clave?
 *    2. SERVIDORES  — `FEDummy`, que NO pide autenticación: distingue "ARCA
 *                     está caído" de "mi certificado no sirve".
 *    3. CREDENCIAL  — pedir el ticket al WSAA y listar los puntos de venta:
 *                     recién acá se prueba que el certificado está asociado
 *                     al servicio de facturación.
 *
 *  **No emite nada.** Es solo lectura.
 */
export async function GET() {
  const sb = await getSupabaseServer().catch(() => null)
  const user = sb ? (await sb.auth.getUser()).data.user : null
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const cfg = leerConfig()
  if (!cfg.ok) {
    return NextResponse.json({
      ok: false,
      etapa: 'config',
      entorno: cfg.entorno,
      faltan: cfg.faltan,
      mensaje: `Faltan credenciales en el servidor: ${cfg.faltan.join(', ')}.`,
    })
  }

  const { config } = cfg
  const salida: Record<string, unknown> = {
    ok: false,
    entorno: config.entorno,
    cuit: config.cuit,
  }

  try {
    salida.servidores = await estadoServidores(config)
  } catch (e) {
    return NextResponse.json({
      ...salida, etapa: 'servidores',
      mensaje: `No se pudo hablar con ARCA: ${msg(e)}`,
    })
  }

  const almacen = almacenSupabase(user.id, config.entorno)
  try {
    const t = await obtenerTicket(config, almacen)
    salida.ticketVenceEn = new Date(t.expiraEn).toISOString()
  } catch (e) {
    // "Ya posee un TA valido" NO es un rechazo: el certificado anduvo y ARCA
    // se niega a dar OTRO ticket porque el anterior sigue vivo. Decir
    // "no aceptó el certificado" acá manda a rehacer un trámite que está bien.
    if (esTicketVigente(e)) {
      return NextResponse.json({
        ...salida, etapa: 'credencial',
        mensaje: 'Tu certificado funciona: ARCA dice que ya hay un ticket de acceso vigente y no entrega otro hasta que venza.',
        pista: 'Si la tabla arca_tickets todavía no existe, el ticket no se puede guardar entre pedidos y hay que esperar a que el anterior caduque. Corré supabase/migration_arca_tickets.sql y probá de nuevo.',
      })
    }
    return NextResponse.json({
      ...salida, etapa: 'credencial',
      mensaje: `ARCA no aceptó el certificado: ${msg(e)}`,
      pista: 'Para homologación el certificado se saca por autogestión (WSASS) y es DISTINTO del de producción. Además el servicio "wsfe" tiene que estar asociado a ese certificado.',
    })
  }

  try {
    salida.puntosDeVenta = await puntosDeVenta(config, almacen)
  } catch (e) {
    // El ticket salió: la credencial sirve. Esto suele ser que todavía no hay
    // puntos de venta habilitados para webservice, que es otra cosa.
    return NextResponse.json({
      ...salida, ok: true, etapa: 'puntos-de-venta',
      mensaje: `Autenticó bien, pero no se pudieron listar los puntos de venta: ${msg(e)}`,
    })
  }

  // ¿La tabla de comprobantes existe y la puede leer ESTE usuario?
  //
  // Se consulta con el cliente de la SESIÓN, no con el service role, a
  // propósito: así se prueba lo mismo que va a hacer el navegador, RLS
  // incluido. Es solo un `select ... limit 1`, no escribe nada.
  //
  // Importa tenerlo acá: sin la tabla se puede emitir igual (ARCA no se
  // entera) y la factura queda con CAE y sin guardar. Mejor saberlo ANTES de
  // emitir que descubrirlo después con el comprobante ya hecho.
  const comp = await sb!.from('arca_comprobantes').select('id').limit(1)
  if (comp.error) {
    salida.comprobantes = { ok: false, error: comp.error.message }
    return NextResponse.json({
      ...salida, ok: false, etapa: 'comprobantes',
      mensaje: 'Todo lo de ARCA funciona, pero los comprobantes no se pueden guardar: ' + comp.error.message,
      pista: 'Falta correr supabase/migration_arca_comprobantes.sql en el SQL Editor de Supabase. Hasta entonces podés emitir, pero la factura no queda guardada ni sincroniza.',
    })
  }
  salida.comprobantes = { ok: true }

  // Catálogo de condiciones de IVA del receptor (RG 5616). Que falle NO corta
  // el diagnóstico: el formulario tiene una tabla de respaldo, y quedarse sin
  // facturar porque no se pudo leer un catálogo sería peor que el problema.
  try {
    salida.condicionesIva = await condicionesIvaReceptor(config, 'C', almacen)
  } catch { /* la pantalla usa CONDICIONES_IVA_C */ }

  // Una lista VACÍA de puntos de venta no es un error de ARCA, pero decir
  // "todo listo" cuando no hay ninguno es mentir (BASE nº6): el push del
  // número de comprobante va a fallar y el usuario no va a saber por qué.
  // No se marca en rojo porque en homologación se suele poder emitir igual
  // con el punto de venta 1 — se avisa y que lo pruebe.
  const sinPuntos = Array.isArray(salida.puntosDeVenta) && salida.puntosDeVenta.length === 0
  if (sinPuntos) {
    return NextResponse.json({
      ...salida, ok: true, etapa: 'listo',
      mensaje: 'Autenticó bien y los comprobantes se pueden guardar, pero ARCA no devolvió NINGÚN punto de venta habilitado para webservice.',
      pista: 'En homologación se suele poder emitir igual usando el punto de venta 1: probá emitir y fijate si ARCA lo acepta. Si lo rechaza, hay que dar de alta un punto de venta de tipo webservice en el portal de ARCA.',
    })
  }

  return NextResponse.json({ ...salida, ok: true, etapa: 'listo', mensaje: 'Todo listo para facturar.' })
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido'
}
