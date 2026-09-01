/** Ofertas (el CRM): leerlas, moverlas de etapa y escribir sus documentos.
 *
 *  Pedido del usuario el 2026-09-01: *"quiero que seas mis ojos y mis manos
 *  dentro de Overseer"*. Hasta acá el bridge no tocaba Ofertas ni para leer, así
 *  que al planificar DRM yo veía las tareas pero no el estado real del pipeline.
 *
 *  ── ESTE ES EL DOMINIO DONDE EL PROYECTO YA PERDIÓ DATOS ─────────────────
 *  Dos cicatrices, las dos vigentes:
 *
 *  1. **Se perdieron 12 ofertas en la nube** porque el sync infería borrados
 *     por AUSENCIA (`baseline − local`): un dispositivo con la lista parcial
 *     "concluía" que las que le faltaban habían sido borradas. Hoy el borrado
 *     va por INTENCIÓN explícita (un outbox `pendingDeletes` en el store).
 *     **Por eso acá NO HAY BORRADO.** No existe `delete_offer` y no se va a
 *     agregar: el bridge no tiene forma de expresar intención del usuario, y
 *     una fila de menos en Ofertas ya costó caro una vez.
 *
 *  2. **El documento se resuelve por `docRev`, NO por reloj.** Es un contador
 *     monotónico que sube +1 en cada edición. El merge compara ESE número, no
 *     `updatedAt`, porque una copia vieja con el reloj adelantado se comía la
 *     nueva (pasó de verdad entre su PC y su notebook). Escribir un doc sin
 *     subir `docRev` es escribir algo que el próximo pull descarta.
 *
 *  ── DÓNDE VIVE CADA COSA ─────────────────────────────────────────────────
 *  - `offer_systems` y `offers`: per-fila, con **payload jsonb** (no columnas).
 *  - Las **etapas, categorías y geos** NO están en esas tablas: viven en el blob
 *    `app_preferences` (`offerStages` / `offerCategories` / `offerGeos`). Por
 *    eso para mover una oferta de etapa hay que leer el blob primero — el
 *    `stageId` suelto no significa nada sin el catálogo.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'

// ---------------------------------------------------------------------------
// Tipos (espejo de lib/store/offersStore.ts y lib/offers/blocks.ts)
// ---------------------------------------------------------------------------

type BlockType = 'text' | 'bullet' | 'toggle' | 'page'
const HOJAS = new Set<BlockType>(['text', 'bullet'])

interface Block {
  id: string
  type: BlockType
  text: string
  children?: Block[]
  collapsed?: boolean
}

interface OfferSystem {
  id: string; name: string; icon: string; order: number
  doc: Block[]; docRev?: number
  createdAt: string; updatedAt: string
}

interface Offer {
  id: string; systemId: string; name: string; stageId: string
  categoryIds: string[]; geoIds: string[]
  score?: number; doc?: Block[]; docRev?: number
  order: number; createdAt: string; updatedAt: string
}

interface Catalogos {
  stages: { id: string; name: string; color?: string; order?: number }[]
  categories: { id: string; name: string }[]
  geos: { id: string; code: string; name: string }[]
}

function bridgeId(p: string): string {
  return `${p}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

function blockId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// ---------------------------------------------------------------------------
// Catálogos (blob app_preferences)
// ---------------------------------------------------------------------------

async function getCatalogos(userId: string): Promise<Catalogos> {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('app_preferences').select('payload').eq('user_id', userId).maybeSingle()
  const p = (data?.payload ?? {}) as Record<string, unknown>
  return {
    stages: Array.isArray(p.offerStages) ? (p.offerStages as Catalogos['stages']) : [],
    categories: Array.isArray(p.offerCategories) ? (p.offerCategories as Catalogos['categories']) : [],
    geos: Array.isArray(p.offerGeos) ? (p.offerGeos as Catalogos['geos']) : [],
  }
}

/** Resuelve una etapa por id EXACTO o por nombre (sin acentos ni mayúsculas).
 *  El usuario las va a nombrar hablando ("pasala a UGO"), no por id. */
function resolverEtapa(cat: Catalogos, pedido: string): { id: string; name: string } | null {
  const raw = pedido.trim()
  const exacto = cat.stages.find((s) => s.id === raw)
  if (exacto) return { id: exacto.id, name: exacto.name }
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const porNombre = cat.stages.find((s) => norm(s.name) === norm(raw))
  return porNombre ? { id: porNombre.id, name: porNombre.name } : null
}

// ---------------------------------------------------------------------------
// Bloques: del texto plano que manda Claude al árbol que espera la app
// ---------------------------------------------------------------------------

/** Acepta strings sueltos o `{tipo, texto, hijos}`. Un string que empieza con
 *  "- " o "• " se toma como viñeta: es como se escribe naturalmente. */
export function normalizarBloques(entrada: unknown, profundidad = 0): Block[] {
  if (!Array.isArray(entrada) || profundidad > 5) return []
  const out: Block[] = []
  for (const raw of entrada) {
    if (typeof raw === 'string') {
      const t = raw.trim()
      if (!t) continue
      const esVinieta = /^[-•*]\s+/.test(t)
      out.push({ id: blockId(), type: esVinieta ? 'bullet' : 'text', text: t.replace(/^[-•*]\s+/, '') })
      continue
    }
    if (typeof raw !== 'object' || raw === null) continue
    const b = raw as Record<string, unknown>
    const tipo = String(b.tipo ?? b.type ?? 'text').toLowerCase() as BlockType
    const valido: BlockType = (['text', 'bullet', 'toggle', 'page'] as string[]).includes(tipo) ? tipo : 'text'
    const texto = String(b.texto ?? b.text ?? '').slice(0, 5000)
    if (HOJAS.has(valido)) {
      out.push({ id: blockId(), type: valido, text: texto })
    } else {
      out.push({
        id: blockId(), type: valido, text: texto,
        children: normalizarBloques(b.hijos ?? b.children ?? [], profundidad + 1),
        ...(valido === 'toggle' ? { collapsed: false } : {}),
      })
    }
  }
  return out
}

/** El árbol de bloques como texto legible, para poder LEER un doc sin ahogarse
 *  en json. Es lo que Claude necesita para contarle al usuario qué dice. */
function bloquesATexto(bloques: Block[] | undefined, nivel = 0): string {
  if (!Array.isArray(bloques) || bloques.length === 0) return ''
  const sangria = '  '.repeat(nivel)
  return bloques.map((b) => {
    const marca = b.type === 'bullet' ? '· ' : b.type === 'toggle' ? '▸ ' : b.type === 'page' ? '📄 ' : ''
    const hijos = bloquesATexto(b.children, nivel + 1)
    return `${sangria}${marca}${b.text}${hijos ? '\n' + hijos : ''}`
  }).join('\n')
}

// ---------------------------------------------------------------------------
// get_offers
// ---------------------------------------------------------------------------

export async function getOffers(userId: string, input: Record<string, unknown> = {}) {
  const sb = getSupabaseAdmin()
  const [cat, sysRes, offRes] = await Promise.all([
    getCatalogos(userId),
    sb.from('offer_systems').select('payload').eq('user_id', userId),
    sb.from('offers').select('payload').eq('user_id', userId).limit(1000),
  ])
  if (sysRes.error) return { error: 'db_error', detail: sysRes.error.message }
  if (offRes.error) return { error: 'db_error', detail: offRes.error.message }

  const sistemas = (sysRes.data ?? []).map((r) => (r.payload ?? {}) as OfferSystem)
    .filter((s) => s.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const ofertas = (offRes.data ?? []).map((r) => (r.payload ?? {}) as Offer).filter((o) => o.id)

  const etapa = new Map(cat.stages.map((s) => [s.id, s.name]))
  const categoria = new Map(cat.categories.map((c) => [c.id, c.name]))
  const geo = new Map(cat.geos.map((g) => [g.id, g.code ?? g.name]))

  const conDoc = input.conDocumento === true
  const filtroSis = typeof input.systemId === 'string' ? input.systemId.trim() : ''
  const filtroEtapa = typeof input.etapa === 'string' ? resolverEtapa(cat, input.etapa)?.id : undefined

  const salida = sistemas
    .filter((s) => !filtroSis || s.id === filtroSis)
    .map((s) => {
      const suyas = ofertas
        .filter((o) => o.systemId === s.id)
        .filter((o) => !filtroEtapa || o.stageId === filtroEtapa)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((o) => ({
          id: o.id,
          nombre: o.name,
          etapa: etapa.get(o.stageId) ?? '(etapa desconocida)',
          etapaId: o.stageId,
          categorias: (o.categoryIds ?? []).map((c) => categoria.get(c) ?? c),
          geos: (o.geoIds ?? []).map((g) => geo.get(g) ?? g),
          score: o.score,
          tieneDocumento: (o.doc?.length ?? 0) > 0,
          ...(conDoc ? { documento: bloquesATexto(o.doc) } : {}),
        }))
      const porEtapa: Record<string, number> = {}
      for (const o of suyas) porEtapa[o.etapa] = (porEtapa[o.etapa] ?? 0) + 1
      return {
        id: s.id, nombre: s.name, icono: s.icon,
        tieneNotas: (s.doc?.length ?? 0) > 0,
        ...(conDoc ? { notas: bloquesATexto(s.doc) } : {}),
        totalOfertas: suyas.length,
        porEtapa,
        ofertas: suyas,
      }
    })

  return {
    etapas: cat.stages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((s) => s.name),
    sistemas: salida,
    ...(sistemas.length === 0
      ? { detail: 'No hay ningún sistema de ofertas cargado. Se crean desde la app (sección Ofertas).' }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// upsert_offer — crear, editar y MOVER DE ETAPA
// ---------------------------------------------------------------------------

export async function upsertOffer(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const sb = getSupabaseAdmin()
  const cat = await getCatalogos(userId)
  const offerId = typeof input.offerId === 'string' ? input.offerId.trim() : ''

  let previa: Offer | null = null
  if (offerId) {
    const { data, error } = await sb.from('offers').select('payload').eq('id', offerId).eq('user_id', userId).maybeSingle()
    if (error) return { ok: false, error: 'db_error', detail: error.message }
    if (!data) return { ok: false, error: 'not_found', detail: `No existe la oferta ${offerId} en esta cuenta.` }
    previa = (data.payload ?? {}) as Offer
  }

  const nombre = typeof input.nombre === 'string' ? input.nombre.trim() : ''
  if (!previa && !nombre) return { ok: false, error: 'bad_input', detail: 'Una oferta nueva necesita `nombre`.' }

  // ── el sistema al que pertenece ──────────────────────────────────────
  let systemId = previa?.systemId ?? ''
  if (typeof input.systemId === 'string' && input.systemId.trim()) systemId = input.systemId.trim()
  if (!systemId) {
    const { data } = await sb.from('offer_systems').select('payload').eq('user_id', userId)
    const sis = (data ?? []).map((r) => (r.payload ?? {}) as OfferSystem).filter((s) => s.id)
    if (sis.length === 1) systemId = sis[0].id
    else {
      return {
        ok: false, error: 'falta_sistema',
        detail: `Hay ${sis.length} sistemas: ${sis.map((s) => `${s.name} (${s.id})`).join(' · ')}. Pasá \`systemId\` para saber en cuál va.`,
      }
    }
  }

  // ── la etapa ─────────────────────────────────────────────────────────
  let stageId = previa?.stageId ?? ''
  if (input.etapa !== undefined) {
    const hit = resolverEtapa(cat, String(input.etapa))
    if (!hit) {
      return {
        ok: false, error: 'etapa_inexistente',
        detail: `"${input.etapa}" no es una etapa. Las que existen: ${cat.stages.map((s) => s.name).join(' · ') || '(ninguna)'}. Una etapa inventada deja la oferta invisible en el tablero.`,
      }
    }
    stageId = hit.id
  }
  if (!stageId) {
    const primera = [...cat.stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]
    if (!primera) return { ok: false, error: 'sin_etapas', detail: 'No hay etapas configuradas en Ofertas; creá al menos una desde la app.' }
    stageId = primera.id
  }

  const now = new Date().toISOString()
  const p: Offer = {
    ...(previa ?? {} as Offer),
    id: previa?.id ?? offerId ?? bridgeId('off'),
    systemId,
    name: nombre || previa!.name,
    stageId,
    categoryIds: previa?.categoryIds ?? [],
    geoIds: previa?.geoIds ?? [],
    order: previa?.order ?? Date.now() % 100000,
    createdAt: previa?.createdAt ?? now,
    updatedAt: now,   // BASE nº1
  }
  if (!p.id) p.id = bridgeId('off')
  if (input.score !== undefined) {
    if (input.score === null) delete p.score
    else {
      const n = Number(input.score)
      if (!Number.isFinite(n)) return { ok: false, error: 'bad_score', detail: '`score` tiene que ser un número o null.' }
      p.score = n
    }
  }

  const { error } = await sb.from('offers').upsert({
    id: p.id, user_id: userId, payload: p, created_at: p.createdAt, updated_at: now,
  })
  if (error) {
    return { ok: false, error: 'db_error', detail: `${error.message}. Si falta la tabla, correr supabase/migration_offers.sql.` }
  }

  const nombreEtapa = cat.stages.find((s) => s.id === stageId)?.name ?? stageId
  return {
    ok: true, creada: !previa,
    oferta: { id: p.id, nombre: p.name, etapa: nombreEtapa, systemId: p.systemId, score: p.score },
    ...(previa && previa.stageId !== stageId
      ? { movida: `${cat.stages.find((s) => s.id === previa!.stageId)?.name ?? previa!.stageId} → ${nombreEtapa}` }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// set_offer_doc — el documento, con docRev
// ---------------------------------------------------------------------------

/** Escribe el documento de una oferta o las notas de un sistema.
 *
 *  ⚠️ `docRev` es lo que hace que esto sobreviva. El merge del pull resuelve el
 *  doc comparando ESE contador y no `updatedAt`, así que un doc escrito sin
 *  subirlo lo descarta el próximo pull sin decir nada. Acá siempre sube +1
 *  sobre lo que haya.
 *
 *  `modo`: "reemplazar" pisa el doc entero; "agregar" (default) appendea al
 *  final. El default es agregar porque perder texto escrito a mano es peor que
 *  duplicarlo. */
export async function setOfferDoc(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const sb = getSupabaseAdmin()
  const offerId = typeof input.offerId === 'string' ? input.offerId.trim() : ''
  const systemId = typeof input.systemId === 'string' ? input.systemId.trim() : ''
  if (!offerId && !systemId) {
    return { ok: false, error: 'bad_input', detail: 'Pasá `offerId` (documento de una oferta) o `systemId` (notas del sistema).' }
  }
  if (offerId && systemId) {
    return { ok: false, error: 'bad_input', detail: 'Pasá uno solo: `offerId` o `systemId`, no los dos.' }
  }

  const tabla = offerId ? 'offers' : 'offer_systems'
  const id = offerId || systemId
  const { data, error } = await sb.from(tabla).select('payload').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) return { ok: false, error: 'db_error', detail: error.message }
  if (!data) return { ok: false, error: 'not_found', detail: `No existe ${offerId ? 'la oferta' : 'el sistema'} ${id} en esta cuenta.` }

  const p = (data.payload ?? {}) as OfferSystem & Offer
  const nuevos = normalizarBloques(input.bloques ?? input.blocks ?? [])
  if (nuevos.length === 0) {
    return { ok: false, error: 'bad_input', detail: '`bloques` vacío. Mandá un array de strings o de {tipo, texto, hijos}.' }
  }

  const modo = String(input.modo ?? 'agregar').toLowerCase()
  if (modo !== 'agregar' && modo !== 'reemplazar') {
    return { ok: false, error: 'bad_modo', detail: '`modo` es "agregar" (default) o "reemplazar".' }
  }
  const anterior = Array.isArray(p.doc) ? p.doc : []
  p.doc = modo === 'reemplazar' ? nuevos : [...anterior, ...nuevos]

  // ⚠️ SIN ESTO EL PRÓXIMO PULL DESCARTA TODO LO ESCRITO.
  p.docRev = (typeof p.docRev === 'number' ? p.docRev : 0) + 1
  const now = new Date().toISOString()
  p.updatedAt = now

  const { error: upErr } = await sb.from(tabla).update({ payload: p, updated_at: now })
    .eq('id', id).eq('user_id', userId)
  if (upErr) return { ok: false, error: 'db_error', detail: upErr.message }

  return {
    ok: true,
    donde: offerId ? `oferta "${p.name}"` : `notas del sistema "${p.name}"`,
    modo,
    bloquesAgregados: nuevos.length,
    bloquesTotales: p.doc.length,
    docRev: p.docRev,
    ...(modo === 'reemplazar' && anterior.length > 0
      ? { aviso: `Se reemplazaron ${anterior.length} bloques que había antes. No hay papelera para esto.` }
      : {}),
  }
}
