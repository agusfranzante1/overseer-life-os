import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/push/subscribe — registra (o refresca) la suscripción push de
 *  ESTE dispositivo para el usuario logueado.
 *
 *  Lo usa el service worker en `pushsubscriptionchange`: cuando el browser
 *  rota el endpoint (Apple y Google lo hacen cada tanto, sin avisar), el SW
 *  se vuelve a suscribir y tiene que contárselo al servidor — pero un SW no
 *  tiene el cliente de Supabase ni el store. Sí manda las cookies de sesión,
 *  así que acá se autentica igual que cualquier otra ruta.
 *
 *  Sin esto, el endpoint viejo devolvía 410 al dispatcher, se borraba la fila,
 *  y el dispositivo quedaba sin registrar hasta que el usuario volviera a
 *  tocar "Activar" (que no tenía por qué saber que hacía falta).
 *
 *  Body: { endpoint, keys: { p256dh, auth }, userAgent?, deviceLabel?, oldEndpoint? }
 *  Upsert por `endpoint` (es UNIQUE). Si viene `oldEndpoint`, se borra esa fila
 *  para no dejar un endpoint muerto que después dispara 410. */
export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (e) {
    // Sin Supabase configurado (modo local) o backend caído: 503 con mensaje,
    // no un 500 vacío que el SW no puede leer.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'backend no disponible' }, { status: 503 })
  }
}

async function handle(req: NextRequest) {
  const sb = await getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
    userAgent?: string
    deviceLabel?: string
    oldEndpoint?: string
  } | null

  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: 'suscripción incompleta (endpoint/keys)' }, { status: 400 })
  }

  const up = await sb.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    device_label: body?.deviceLabel ?? null,
    user_agent: body?.userAgent ?? null,
    enabled: true,
  }, { onConflict: 'endpoint' })
  if (up.error) {
    return NextResponse.json({ ok: false, error: up.error.message }, { status: 500 })
  }

  if (body?.oldEndpoint && body.oldEndpoint !== endpoint) {
    // RLS garantiza que solo borra filas del propio usuario.
    await sb.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', body.oldEndpoint)
  }

  return NextResponse.json({ ok: true })
}
