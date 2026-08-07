// Parseo de URLs de YouTube. Puro (sin DOM) para poder testearlo solo.
//
// YouTube tiene MUCHAS formas de referirse al mismo video y el usuario va a
// pegar cualquiera de ellas: la de la barra del navegador, la de "Compartir",
// la de un Short, la de un embed, o directamente el id pelado.

/** Id de video: 11 caracteres de [A-Za-z0-9_-]. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/**
 * Saca el id de video de cualquier forma razonable de URL de YouTube.
 * Devuelve null si no parece un video de YouTube.
 *
 * Soporta:
 *   youtube.com/watch?v=ID          (con cualquier otro query param)
 *   youtu.be/ID
 *   youtube.com/embed/ID
 *   youtube.com/shorts/ID
 *   youtube.com/live/ID
 *   m.youtube.com y www., con o sin protocolo
 *   el id pelado
 */
export function extractYoutubeId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // Id pelado — atajo para el que copia solo el código.
  if (VIDEO_ID.test(raw)) return raw

  // Sin protocolo, `new URL` falla: se lo agregamos.
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try { url = new URL(withProto) } catch { return null }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
  const isYoutube = host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com'
  if (!isYoutube) return null

  // youtu.be/ID → el id es el primer segmento del path.
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && VIDEO_ID.test(id) ? id : null
  }

  // watch?v=ID
  const v = url.searchParams.get('v')
  if (v && VIDEO_ID.test(v)) return v

  // /embed/ID, /shorts/ID, /live/ID, /v/ID
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
    const id = parts[1]
    if (VIDEO_ID.test(id)) return id
  }
  return null
}

/** URL para el <iframe> del reproductor. `nocookie` para no dejar cookies de
 *  tracking solo por tener la lista abierta. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}

/** Miniatura del video. 'hqdefault' existe para prácticamente todo video;
 *  las de mayor resolución faltan seguido y dejan el hueco gris. */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}
