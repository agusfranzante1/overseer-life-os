/**
 * Canal de email para las notificaciones del dispatcher. Usamos la API
 * REST de Resend directamente vía fetch — sin SDK, sin deps adicionales.
 *
 * Setup:
 *   1. Crear cuenta gratis en https://resend.com (3.000 emails/mes free)
 *   2. En vars de Vercel agregar:
 *        RESEND_API_KEY=re_xxx
 *        RESEND_FROM=onboarding@resend.dev   (o tu dominio si lo verificás)
 *   3. En settings/user_settings habilitar `emailNotifications: true`
 *      y opcionalmente sobreescribir `notification_email` (default: auth email)
 *
 * Si RESEND_API_KEY no está seteado, las funciones devuelven `{ ok: false,
 * skipped: true }` sin lanzar — el dispatcher sigue funcionando con push
 * solamente.
 */

export interface EmailPayload {
  to: string
  subject: string
  /** Body HTML (preferido). Si no hay, usamos `text`. */
  html?: string
  /** Plain-text body — siempre lo incluimos como fallback. */
  text: string
}

export interface EmailResult {
  ok: boolean
  /** True cuando saltamos el envío por falta de config (no es error). */
  skipped?: boolean
  /** Id del email en el provider, si lo devolvió. */
  id?: string
  error?: string
}

const RESEND_URL = 'https://api.resend.com/emails'

export async function sendEmail(p: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, skipped: true, error: 'RESEND_API_KEY not configured' }
  }
  const from = process.env.RESEND_FROM || 'Overseer <onboarding@resend.dev>'

  try {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [p.to],
        subject: p.subject,
        html: p.html ?? `<pre style="font-family: -apple-system, system-ui, sans-serif;">${escapeHtml(p.text)}</pre>`,
        text: p.text,
      }),
    })
    if (!r.ok) {
      const errText = await r.text().catch(() => 'unknown')
      return { ok: false, error: `resend ${r.status}: ${errText.slice(0, 240)}` }
    }
    const j = await r.json().catch(() => ({}))
    return { ok: true, id: (j as { id?: string }).id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}

/** Toma un payload de push (que ya está armado para el celular) y lo
 *  convierte en un email lindo. Reusa el `title`/`body` para que el
 *  contenido sea consistente entre canales. */
export function pushPayloadToEmail(
  pushPayload: { title?: string; body?: string; url?: string; data?: Record<string, unknown> },
  to: string,
): EmailPayload {
  const title = pushPayload.title ?? 'Overseer'
  const body = pushPayload.body ?? ''
  const url = pushPayload.url ?? pushPayload.data?.url
  const fullUrl = typeof url === 'string'
    ? (url.startsWith('http') ? url : `https://overseer.life${url}`)
    : null
  // Gmail agrupa emails con subject idéntico del mismo sender en un
  // mismo "conversation thread", entonces todas las notis del mismo
  // canal se ven como UNA en la bandeja. Le agregamos un timestamp
  // corto al subject para que cada notificación sea una conversación
  // separada — el contenido (HTML body + título dentro) queda igual,
  // pero la bandeja muestra cada una.
  const now = new Date()
  const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const dateStamp = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`
  const subjectWithStamp = `${title} · ${dateStamp} ${stamp}`
  const html = `
<!doctype html>
<html><body style="margin:0;padding:24px;background:#0a0e15;font-family:-apple-system,Segoe UI,sans-serif;color:#e4e4e7;">
  <div style="max-width:520px;margin:0 auto;background:#11151c;border:1px solid #27272a;border-radius:16px;padding:24px;">
    <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#71717a;margin-bottom:8px;">Overseer Life OS</div>
    <h1 style="font-size:18px;font-weight:700;margin:0 0 12px;color:#fafafa;">${escapeHtml(title)}</h1>
    <p style="font-size:14px;line-height:1.5;margin:0 0 20px;color:#d4d4d8;white-space:pre-wrap;">${escapeHtml(body)}</p>
    ${fullUrl ? `<a href="${escapeAttr(fullUrl)}" style="display:inline-block;padding:10px 18px;background:#6366f1;color:#fff;text-decoration:none;border-radius:10px;font-size:13px;font-weight:600;">Abrir en Overseer →</a>` : ''}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #27272a;font-size:11px;color:#71717a;">
      Estás recibiendo este email porque tenés activadas las notificaciones por email. Para apagarlas, andá a Settings → Notificaciones.
    </div>
  </div>
</body></html>`
  return {
    to,
    subject: subjectWithStamp,
    html,
    text: `${title}\n\n${body}${fullUrl ? `\n\n→ ${fullUrl}` : ''}`,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
