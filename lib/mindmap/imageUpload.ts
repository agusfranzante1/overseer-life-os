'use client'
/**
 * Subida de imágenes para los "nodos imagen" de los mapas mentales.
 *
 * Bucket público `mindmap-images` (ver supabase/migration_mindmap_images.sql).
 * Path: <userId>/<mapId>/<imageId>.<ext>. En el nodo guardamos solo la URL
 * pública + el path (para poder borrar el objeto al borrar el nodo).
 *
 * Modelado sobre lib/content/visualUpload.ts: comprimimos/redimensionamos en el
 * cliente antes de subir (un mapa mental no necesita full-res) y devolvemos
 * además las dimensiones naturales para arrancar la caja con el aspect ratio
 * correcto.
 */
import { getSupabaseBrowser, hasSupabaseConfig } from '@/lib/supabase/client'

const BUCKET = 'mindmap-images'
const MAX_DIM = 1600        // lado máximo en px tras el downscale
const JPEG_QUALITY = 0.85

export interface UploadedMindmapImage {
  url: string
  path: string
  /** Dimensiones naturales (post-downscale) para fijar el aspect ratio del nodo. */
  width: number
  height: number
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Surface a friendly error to the UI (reusa el toast global de AppShell). */
function reportError(message: string) {
  console.error('[mindmapImageUpload]', message)
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('overseer-sync-error', { detail: { message, at: Date.now() } })) } catch { /* noop */ }
  }
}

/** Redimensiona + recomprime con canvas. Devuelve el Blob jpeg y sus dims.
 *  Si algo falla (formato raro, canvas no disponible), cae al File original
 *  con dims 0 (el caller usará un fallback razonable). */
async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  // GIF: no tocar (perdería la animación).
  if (file.type === 'image/gif') {
    try {
      const bmp = await createImageBitmap(file)
      const dims = { width: bmp.width, height: bmp.height }
      bmp.close?.()
      return { blob: file, ...dims }
    } catch {
      return { blob: file, width: 0, height: 0 }
    }
  }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return { blob: file, width: bitmap.width, height: bitmap.height } }
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    bitmap.close?.()
    if (!blob) return { blob: file, width: w, height: h }
    // Si comprimido NO es más chico que el original, conviene el original
    // (pero conservamos las dims downscaleadas que es lo que vamos a mostrar).
    return { blob: blob.size < file.size ? blob : file, width: w, height: h }
  } catch {
    return { blob: file, width: 0, height: 0 }
  }
}

function extFor(blob: Blob, original: File): string {
  if (blob.type === 'image/jpeg') return 'jpg'
  if (original.type === 'image/gif') return 'gif'
  if (original.type === 'image/png') return 'png'
  if (original.type === 'image/webp') return 'webp'
  return 'jpg'
}

/** Sube una imagen de un mapa y devuelve la URL + path + dims naturales.
 *  Lanza Error (con toast) si no hay sesión / falta el bucket / falla la subida. */
export async function uploadMindmapImage(
  file: File, mapId: string,
): Promise<UploadedMindmapImage> {
  if (!hasSupabaseConfig()) {
    const m = 'Supabase no está configurado — no se puede subir la imagen.'
    reportError(m); throw new Error(m)
  }
  const sb = getSupabaseBrowser()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    const m = 'Tenés que estar logueado para subir imágenes a los mapas.'
    reportError(m); throw new Error(m)
  }

  const { blob, width, height } = await compressImage(file)
  const id = genId()
  const path = `${user.id}/${mapId}/${id}.${extFor(blob, file)}`

  const up = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || file.type || 'image/jpeg',
    upsert: false,
  })
  if (up.error) {
    const m = `No se pudo subir la imagen: ${up.error.message}. ¿Falta correr migration_mindmap_images.sql?`
    reportError(m); throw new Error(m)
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
  return { url: pub.publicUrl, path, width, height }
}

/** Borra el archivo del bucket. Best-effort: si falla, solo loguea. */
export async function deleteMindmapImage(path: string): Promise<void> {
  if (!path || !hasSupabaseConfig()) return
  try {
    const sb = getSupabaseBrowser()
    const r = await sb.storage.from(BUCKET).remove([path])
    if (r.error) console.warn('[mindmapImageUpload] delete failed:', r.error.message)
  } catch (e) {
    console.warn('[mindmapImageUpload] delete skipped:', e)
  }
}
