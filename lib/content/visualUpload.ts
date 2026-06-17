'use client'
/**
 * Subida de imágenes del "Estilo visual" de Contenido a Supabase Storage.
 *
 * Bucket público `content-visual` (ver supabase/migration_visual_style.sql).
 * Path: <userId>/<profileId>/<categoryId>/<imageId>.<ext>. Guardamos en el
 * store solo la URL pública + el path (para poder borrar el objeto después).
 *
 * Antes de subir comprimimos/redimensionamos la imagen en el cliente (canvas)
 * para no mandar originales de 10MB — un mood board no necesita full-res.
 */
import { getSupabaseBrowser, hasSupabaseConfig } from '@/lib/supabase/client'
import type { VisualStyleImage } from '@/types/content'

const BUCKET = 'content-visual'
const MAX_DIM = 1600        // lado máximo en px tras el downscale
const JPEG_QUALITY = 0.85

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Surface a friendly error to the UI (reusa el toast global de AppShell). */
function reportError(message: string) {
  console.error('[visualUpload]', message)
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('overseer-sync-error', { detail: { message, at: Date.now() } })) } catch { /* noop */ }
  }
}

/** Redimensiona + recomprime la imagen con un canvas. Devuelve un Blob jpeg.
 *  Si algo falla (formato raro, canvas no disponible), cae al File original. */
async function compressImage(file: File): Promise<Blob> {
  // GIF: no tocar (perdería la animación). El resto → recomprimir.
  if (file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    bitmap.close?.()
    // Si comprimido NO es más chico que el original, conviene el original.
    if (!blob) return file
    return blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

function extFor(blob: Blob, original: File): string {
  if (blob.type === 'image/jpeg') return 'jpg'
  if (original.type === 'image/gif') return 'gif'
  if (original.type === 'image/png') return 'png'
  if (original.type === 'image/webp') return 'webp'
  return 'jpg'
}

/** Sube una imagen y devuelve el `VisualStyleImage` listo para el store.
 *  Lanza Error (con toast) si no hay sesión / falta el bucket / falla la subida. */
export async function uploadVisualImage(
  file: File, profileId: string, categoryId: string,
): Promise<VisualStyleImage> {
  if (!hasSupabaseConfig()) {
    const m = 'Supabase no está configurado — no se puede subir la imagen.'
    reportError(m); throw new Error(m)
  }
  const sb = getSupabaseBrowser()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    const m = 'Tenés que estar logueado para subir imágenes.'
    reportError(m); throw new Error(m)
  }

  const blob = await compressImage(file)
  const id = genId()
  const path = `${user.id}/${profileId}/${categoryId}/${id}.${extFor(blob, file)}`

  const up = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || file.type || 'image/jpeg',
    upsert: false,
  })
  if (up.error) {
    const m = `No se pudo subir la imagen: ${up.error.message}. ¿Falta correr migration_visual_style.sql?`
    reportError(m); throw new Error(m)
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
  return { id, url: pub.publicUrl, path, createdAt: new Date().toISOString() }
}

/** Borra el archivo del bucket. Best-effort: si falla, solo loguea. */
export async function deleteVisualImage(path: string): Promise<void> {
  if (!path || !hasSupabaseConfig()) return
  try {
    const sb = getSupabaseBrowser()
    const r = await sb.storage.from(BUCKET).remove([path])
    if (r.error) console.warn('[visualUpload] delete failed:', r.error.message)
  } catch (e) {
    console.warn('[visualUpload] delete skipped:', e)
  }
}
