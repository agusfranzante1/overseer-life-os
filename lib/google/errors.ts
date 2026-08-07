/** Extrae el mensaje DETALLADO de un error de googleapis (GaxiosError). El
 *  `.message` genérico suele ser solo "Bad Request"; el motivo real vive en
 *  `response.data.error.message` (ej. "Invalid time range", "You need to have
 *  writer access to this calendar."). Devolvemos eso para que el banner del
 *  calendario sea útil en vez de un 400 opaco. */
export function googleErrMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as {
      response?: { data?: { error?: { message?: string; errors?: { message?: string }[] } } }
      message?: string
    }
    const detail = anyE.response?.data?.error?.message
      ?? anyE.response?.data?.error?.errors?.[0]?.message
    if (detail) return detail
    if (typeof anyE.message === 'string') return anyE.message
  }
  return e instanceof Error ? e.message : 'unknown'
}
