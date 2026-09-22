/** Suscripciones / gastos recurrentes de la billetera, desde el bridge.
 *
 *  Por qué existe: el 2026-09-21 pidió *"agregá suscripción en billetera:
 *  Cloudflare Zero Trust, 0$ porque es gratis pero para recordar"* y el bridge
 *  solo LEÍA la billetera. Una suscripción es un dato de memoria (qué tengo
 *  contratado, cuándo cobra) tanto como de plata: por eso entra aunque valga 0.
 *
 *  ── LA FORMA DE LA TABLA ─────────────────────────────────────────────────
 *  `wallet_recurring_expenses` es per-fila con COLUMNAS REALES (no payload),
 *  sin `updated_at`. El cliente la trae en `pullWallet` con `mergeById`: una
 *  fila que no está en local ni en el baseline se agrega, así que insertar acá
 *  alcanza para que aparezca en la sección Billetera en el próximo pull.
 *
 *  ── QUIÉN COBRA ──────────────────────────────────────────────────────────
 *  El SERVER escribe la regla; el CLIENTE genera la transacción del mes
 *  (`processRecurringExpenses`, al montar Billetera). Igual que las tareas
 *  recurrentes: si acá se insertaran transacciones, dos dispositivos harían
 *  dos cobros. `last_applied_year_month` queda en null a propósito.
 *
 *  `wallet_id` + `currency_code` tienen que ser una combinación REAL de la
 *  billetera: el procesador del cliente pausa en silencio (`active=false`) una
 *  regla cuya wallet no tenga esa divisa. Por eso se valida acá y se rechaza
 *  (BASE nº6) en vez de dejar una regla que nunca cobra sin decir por qué.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'
import { isYmd } from './spiWeek'
import { getUserPrefs } from './queries'

async function hoyLocal(userId: string): Promise<string> {
  const { timezone } = await getUserPrefs(userId)
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function bridgeId(): string {
  return `rx${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

type WalletRow = { id: string; name: string; currency_codes: string[] }

async function walletsDe(userId: string): Promise<WalletRow[]> {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('wallets').select('id, name, currency_codes').eq('user_id', userId)
  return (data ?? []).map((w) => ({
    id: w.id as string,
    name: (w.name as string) ?? '?',
    currency_codes: Array.isArray(w.currency_codes) ? (w.currency_codes as string[]) : [],
  }))
}

// ---------------------------------------------------------------------------
// list_recurring_expenses
// ---------------------------------------------------------------------------

export async function listRecurringExpenses(userId: string) {
  const sb = getSupabaseAdmin()
  const [wallets, rec] = await Promise.all([
    walletsDe(userId),
    sb.from('wallet_recurring_expenses').select('*').eq('user_id', userId).order('day_of_month'),
  ])
  if (rec.error) {
    return { error: 'db_error', detail: `${rec.error.message}. Si falta la tabla: supabase/migration_wallet_recurring.sql.` }
  }
  const nombre = new Map(wallets.map((w) => [w.id, w.name]))
  const suscripciones = (rec.data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    monto: Number(r.amount) || 0,
    divisa: r.currency_code as string,
    billetera: nombre.get(r.wallet_id as string) ?? (r.wallet_id as string),
    billeteraId: r.wallet_id as string,
    categoria: r.category as string,
    diaDelMes: r.day_of_month as number,
    activa: r.active as boolean,
    desde: r.start_date as string,
    ...(r.end_date ? { hasta: r.end_date as string } : {}),
    ...(r.last_applied_year_month ? { ultimoCobro: r.last_applied_year_month as string } : {}),
    esSuscripcion: (r.is_subscription as boolean) ?? true,
    ...(r.notes ? { notas: r.notes as string } : {}),
  }))
  return {
    billeteras: wallets.map((w) => ({ id: w.id, nombre: w.name, divisas: w.currency_codes })),
    total: suscripciones.length,
    suscripciones,
  }
}

// ---------------------------------------------------------------------------
// upsert_recurring_expense
// ---------------------------------------------------------------------------

export async function upsertRecurringExpense(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const sb = getSupabaseAdmin()
  const id = typeof input.recurringId === 'string' ? input.recurringId.trim() : ''

  let previo: Record<string, unknown> | null = null
  if (id) {
    const { data, error } = await sb.from('wallet_recurring_expenses').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
    if (error) return { ok: false, error: 'db_error', detail: error.message }
    if (!data) return { ok: false, error: 'not_found', detail: `No existe la suscripción ${id} en esta cuenta.` }
    previo = data as Record<string, unknown>
  }

  const label = typeof input.label === 'string' ? input.label.trim() : (previo?.label as string) ?? ''
  if (!label) return { ok: false, error: 'bad_input', detail: 'Una suscripción nueva necesita `label` (Netflix, Cloudflare…).' }

  // El monto puede ser 0: una suscripción gratis se anota igual, para acordarse
  // de que existe. Lo que no puede es faltar o ser negativo.
  const montoRaw = input.monto !== undefined ? Number(input.monto) : Number(previo?.amount ?? NaN)
  if (!Number.isFinite(montoRaw) || montoRaw < 0) {
    return { ok: false, error: 'bad_input', detail: '`monto` tiene que ser un número >= 0 (0 vale: gratis pero anotada).' }
  }

  const wallets = await walletsDe(userId)
  let walletId = typeof input.billeteraId === 'string' ? input.billeteraId.trim() : (previo?.wallet_id as string) ?? ''
  if (typeof input.billetera === 'string' && !input.billeteraId) {
    const buscada = input.billetera.trim().toLowerCase()
    const w = wallets.find((x) => x.name.trim().toLowerCase() === buscada)
    if (!w) {
      return {
        ok: false, error: 'bad_billetera',
        detail: `No hay una billetera "${input.billetera}". Las que hay: ${wallets.map((x) => x.name).join(', ')}.`,
      }
    }
    walletId = w.id
  }
  const wallet = wallets.find((w) => w.id === walletId)
  if (!wallet) {
    return {
      ok: false, error: 'bad_billetera',
      detail: `Falta \`billetera\` (nombre) o \`billeteraId\`. Las que hay: ${wallets.map((x) => `${x.name} [${x.currency_codes.join('/')}]`).join(', ')}.`,
    }
  }

  const divisa = (typeof input.divisa === 'string' ? input.divisa.trim().toUpperCase() : (previo?.currency_code as string)) || 'USD'
  if (!wallet.currency_codes.includes(divisa)) {
    return {
      ok: false, error: 'bad_divisa',
      detail: `${wallet.name} no maneja ${divisa} (tiene ${wallet.currency_codes.join('/') || 'ninguna'}). El cliente pausaría la regla en silencio.`,
    }
  }

  // Guarda contra duplicados en una billetera+label.
  if (!previo) {
    const { data: todos } = await sb.from('wallet_recurring_expenses').select('id, label').eq('user_id', userId).eq('wallet_id', walletId)
    const igual = (todos ?? []).find((r) => String(r.label).trim().toLowerCase() === label.toLowerCase())
    if (igual) {
      return { ok: false, error: 'ya_existe', detail: `Ya existe "${label}" en ${wallet.name} (id ${igual.id}). Mandá ese \`recurringId\` para editarla.` }
    }
  }

  const diaRaw = input.diaDelMes !== undefined ? Number(input.diaDelMes) : Number(previo?.day_of_month ?? 1)
  if (!Number.isFinite(diaRaw) || diaRaw < 1 || diaRaw > 28) {
    return { ok: false, error: 'bad_input', detail: '`diaDelMes` va de 1 a 28 (el cliente lo topea en 28 por febrero).' }
  }

  const hoy = await hoyLocal(userId)
  const desde = typeof input.desde === 'string' ? input.desde.trim() : (previo?.start_date as string) ?? hoy
  if (!isYmd(desde)) return { ok: false, error: 'bad_input', detail: '`desde` tiene que ser YYYY-MM-DD.' }
  const hasta = input.hasta === null ? null
    : typeof input.hasta === 'string' ? input.hasta.trim()
    : (previo?.end_date as string | null) ?? null
  if (hasta && !isYmd(hasta)) return { ok: false, error: 'bad_input', detail: '`hasta` tiene que ser YYYY-MM-DD.' }

  const row = {
    id: id || bridgeId(),
    user_id: userId,
    wallet_id: walletId,
    currency_code: divisa,
    amount: montoRaw,
    label,
    category: typeof input.categoria === 'string' && input.categoria.trim() ? input.categoria.trim() : (previo?.category as string) ?? 'Suscripción',
    day_of_month: Math.round(diaRaw),
    active: typeof input.activa === 'boolean' ? input.activa : (previo?.active as boolean) ?? true,
    start_date: desde,
    end_date: hasta,
    last_applied_year_month: (previo?.last_applied_year_month as string | null) ?? null,
    is_subscription: typeof input.esSuscripcion === 'boolean' ? input.esSuscripcion : (previo?.is_subscription as boolean) ?? true,
    notes: input.notas === null ? null : typeof input.notas === 'string' ? input.notas.trim() || null : (previo?.notes as string | null) ?? null,
    created_at: (previo?.created_at as string) ?? new Date().toISOString(),
  }

  const { error } = await sb.from('wallet_recurring_expenses').upsert(row)
  if (error) return { ok: false, error: 'db_error', detail: `${error.message}. Si falta la tabla: supabase/migration_wallet_recurring.sql.` }

  return {
    ok: true,
    id: row.id,
    label: row.label,
    billetera: wallet.name,
    monto: row.amount,
    divisa: row.currency_code,
    diaDelMes: row.day_of_month,
    activa: row.active,
    nota: previo
      ? 'Editada. El cliente la ve en el próximo pull de Billetera.'
      : 'Creada. La transacción del mes la genera la app al abrir Billetera (el server no cobra).',
  }
}
