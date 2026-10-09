import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { AlmacenTicket } from './cliente'
import type { TicketAcceso } from './tra'

/** Dónde vive el ticket del WSAA entre invocaciones: la tabla `arca_tickets`
 *  (ver `supabase/migration_arca_tickets.sql`).
 *
 *  Va por el service role a propósito: el token de ARCA es una credencial
 *  fiscal y no tiene por qué pasar nunca por el navegador.
 *
 *  Si la tabla todavía no existe (migración sin correr), leer devuelve `null`
 *  y guardar no hace nada: la app sigue funcionando pidiendo un ticket por
 *  invocación — que es exactamente el comportamiento anterior, con su límite
 *  conocido. Nunca tira: quedarse sin facturar porque falta una tabla de
 *  cache sería peor que el problema que resuelve.
 */
export function almacenSupabase(userId: string, entorno: string, servicio = 'wsfe'): AlmacenTicket {
  return {
    async leer(): Promise<TicketAcceso | null> {
      try {
        const sb = getSupabaseAdmin()
        const { data, error } = await sb
          .from('arca_tickets')
          .select('token, sign, expira_en')
          .eq('user_id', userId).eq('entorno', entorno).eq('servicio', servicio)
          .maybeSingle()
        if (error || !data) return null
        const expiraEn = Date.parse(data.expira_en as string)
        if (Number.isNaN(expiraEn)) return null
        return { token: data.token as string, sign: data.sign as string, expiraEn }
      } catch {
        return null
      }
    },
    async guardar(t: TicketAcceso): Promise<void> {
      try {
        const sb = getSupabaseAdmin()
        await sb.from('arca_tickets').upsert({
          user_id: userId,
          entorno,
          servicio,
          token: t.token,
          sign: t.sign,
          expira_en: new Date(t.expiraEn).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,entorno,servicio' })
      } catch { /* ver la cabecera: no poder cachear no es motivo para fallar */ }
    },
  }
}
