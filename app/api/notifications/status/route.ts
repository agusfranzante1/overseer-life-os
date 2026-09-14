import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/notifications/status — ¿el servidor de notificaciones está mirando?
 *
 *  Devuelve el último latido del dispatcher para el usuario logueado (ver
 *  `recordHeartbeat`): cuándo corrió por última vez y cuántos dispositivos
 *  tenía registrados en ese momento. Es lo que Configuración muestra como
 *  "último chequeo del servidor: hace N min".
 *
 *  `notification_log` es solo-service-role (RLS), por eso pasa por acá y no
 *  se consulta desde el cliente. Auth por sesión; lectura con el admin. */
export async function GET() {
  try {
    const sbUser = await getSupabaseServer()
    const { data: { user } } = await sbUser.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('notification_log')
      .select('sent_at, payload')
      .eq('user_id', user.id)
      .eq('notification_type', 'heartbeat')
      .eq('dedupe_key', 'last')
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    if (!data) return NextResponse.json({ ok: true, lastRunAt: null, minutesAgo: null, subsAtRun: null })

    const lastRunAt = data.sent_at as string
    const minutesAgo = Math.max(0, Math.round((Date.now() - new Date(lastRunAt).getTime()) / 60_000))
    const payload = (data.payload ?? {}) as { subs?: number; tz?: string; localTime?: string }
    return NextResponse.json({
      ok: true,
      lastRunAt,
      minutesAgo,
      subsAtRun: typeof payload.subs === 'number' ? payload.subs : null,
      localTime: payload.localTime ?? null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'backend no disponible' }, { status: 503 })
  }
}
