/** Libros: leerlos y escribirlos desde el bridge.
 *
 *  Por qué existe: "Leer 30 min" es uno de sus hábitos diarios y tiene una
 *  sección Libros con estados propios, pero el bridge no la tocaba ni para
 *  leer. El 2026-09-01 dijo *"recién termino de leer, empecé un nuevo libro"* y
 *  no había forma de anotarlo — el hábito quedaba tildado y el libro en ningún
 *  lado.
 *
 *  ── LA FORMA DE LA TABLA ─────────────────────────────────────────────────
 *  `books` es per-fila con **payload jsonb** (a diferencia de `tasks`, que usa
 *  columnas reales). El cliente rehidrata desde el payload; `created_at` y
 *  `updated_at` son columnas de índice. Se escriben las dos cosas.
 *
 *  ── LOS ESTADOS SON TRES Y SON CERRADOS ──────────────────────────────────
 *  `want` (quiero leer) · `reading` (leyendo) · `read` (leído). El sanitize del
 *  pull cae a `want` ante cualquier otro valor, así que un estado inventado acá
 *  no falla: **se degrada en silencio** a "quiero leer". Por eso se valida del
 *  lado server y se rechaza (BASE nº6) en vez de mandar cualquier cosa.
 *
 *  Pasar a `reading` sella `startDate` y pasar a `read` sella `endDate`, que es
 *  lo que hace el cliente. Sin eso, la sección muestra el libro leído sin fecha
 *  y el historial de lectura no sirve para nada.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'
import { isYmd } from './spiWeek'

type BookStatus = 'want' | 'reading' | 'read'
const ESTADOS: Record<string, BookStatus> = {
  want: 'want', reading: 'reading', read: 'read',
  'quiero leer': 'want', quiero: 'want',
  leyendo: 'reading',
  leido: 'read', 'leído': 'read', terminado: 'read',
}

const ES: Record<BookStatus, string> = {
  want: 'quiero leer', reading: 'leyendo', read: 'leído',
}

interface BookPayload {
  id: string
  title: string
  author: string
  status: BookStatus
  startDate?: string
  endDate?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

function bridgeId(): string {
  return `bk${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

function hoyYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// get_books
// ---------------------------------------------------------------------------

export async function getBooks(userId: string, input: Record<string, unknown> = {}) {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('books').select('*').eq('user_id', userId)
    .order('updated_at', { ascending: false }).limit(300)
  if (error) {
    return { error: 'db_error', detail: `${error.message}. Si dice que falta la tabla, hay que correr supabase/migration_books.sql.` }
  }

  const filtro = typeof input.estado === 'string' ? ESTADOS[input.estado.trim().toLowerCase()] : undefined
  const libros = (data ?? [])
    .map((r) => (r.payload ?? {}) as Partial<BookPayload>)
    .filter((b) => b.title)
    .map((b) => ({
      id: b.id ?? '',
      titulo: b.title ?? '',
      autor: b.author ?? '',
      estado: ES[(b.status as BookStatus) ?? 'want'] ?? 'quiero leer',
      estadoRaw: (b.status as BookStatus) ?? 'want',
      empezado: b.startDate,
      terminado: b.endDate,
      notas: b.notes,
    }))
    .filter((b) => !filtro || b.estadoRaw === filtro)

  const porEstado = { leyendo: 0, 'quiero leer': 0, 'leído': 0 } as Record<string, number>
  for (const b of libros) porEstado[b.estado] = (porEstado[b.estado] ?? 0) + 1

  return { total: libros.length, porEstado, libros }
}

// ---------------------------------------------------------------------------
// upsert_book
// ---------------------------------------------------------------------------

export async function upsertBook(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const sb = getSupabaseAdmin()
  const id = typeof input.bookId === 'string' ? input.bookId.trim() : ''

  let previo: BookPayload | null = null
  if (id) {
    const { data, error } = await sb.from('books').select('payload').eq('id', id).eq('user_id', userId).maybeSingle()
    if (error) return { ok: false, error: 'db_error', detail: error.message }
    if (!data) return { ok: false, error: 'not_found', detail: `No existe el libro ${id} en esta cuenta.` }
    previo = (data.payload ?? {}) as BookPayload
  }

  const titulo = typeof input.titulo === 'string' ? input.titulo.trim() : ''
  if (!previo && !titulo) return { ok: false, error: 'bad_input', detail: 'Un libro nuevo necesita `titulo`.' }

  // Guarda contra duplicados: "empecé un libro nuevo" dicho dos veces no tiene
  // que dejar dos filas del mismo libro.
  if (!previo && titulo) {
    const { data: todos } = await sb.from('books').select('id, payload').eq('user_id', userId)
    const igual = (todos ?? []).find((r) => {
      const p = (r.payload ?? {}) as Partial<BookPayload>
      return (p.title ?? '').trim().toLowerCase() === titulo.toLowerCase()
    })
    if (igual) {
      return {
        ok: false, error: 'ya_existe',
        detail: `Ya tenés "${titulo}" en tu biblioteca (id ${igual.id}). Si querés cambiarle el estado, mandá ese \`bookId\`.`,
      }
    }
  }

  let estado: BookStatus = previo?.status ?? 'want'
  if (input.estado !== undefined) {
    const pedido = String(input.estado).trim().toLowerCase()
    const resuelto = ESTADOS[pedido]
    if (!resuelto) {
      return {
        ok: false, error: 'bad_estado',
        detail: `"${input.estado}" no es un estado válido. Son: want / reading / read (o "quiero leer", "leyendo", "leído"). Un valor raro NO falla del lado del cliente: el pull lo degrada en silencio a "quiero leer", por eso se rechaza acá.`,
      }
    }
    estado = resuelto
  }

  const now = new Date().toISOString()
  const p: BookPayload = {
    ...(previo ?? {}),
    id: previo?.id ?? id ?? bridgeId(),
    title: titulo || previo!.title,
    author: typeof input.autor === 'string' ? input.autor.trim().slice(0, 200) : previo?.author ?? '',
    status: estado,
    createdAt: previo?.createdAt ?? now,
    updatedAt: now,
  }
  if (!p.id) p.id = bridgeId()
  if (typeof input.notas === 'string') p.notes = input.notas.slice(0, 5000)

  // Las fechas las sella el cambio de estado, igual que hace el cliente: un
  // libro "leyendo" sin fecha de inicio no dice cuánto tardaste, y uno "leído"
  // sin fecha de fin no sirve para el historial.
  if (isYmd(input.empezado)) p.startDate = input.empezado as string
  else if (estado !== 'want' && !p.startDate) p.startDate = hoyYmd()

  if (isYmd(input.terminado)) p.endDate = input.terminado as string
  else if (estado === 'read' && !p.endDate) p.endDate = hoyYmd()

  if (estado !== 'read') delete p.endDate

  const { error } = await sb.from('books').upsert({
    id: p.id, user_id: userId, payload: p,
    created_at: p.createdAt, updated_at: now,
  })
  if (error) {
    return { ok: false, error: 'db_error', detail: `${error.message}. Si falta la tabla, correr supabase/migration_books.sql.` }
  }

  return {
    ok: true,
    creado: !previo,
    libro: {
      id: p.id, titulo: p.title, autor: p.author,
      estado: ES[p.status], empezado: p.startDate, terminado: p.endDate,
    },
  }
}
