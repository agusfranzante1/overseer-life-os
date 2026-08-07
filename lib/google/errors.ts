/** Extrae el mensaje DETALLADO de un error de googleapis (GaxiosError). El
 *  `.message` genérico suele ser solo "Bad Request"; el motivo real vive en
 *  `response.data.error.message` (ej. "Invalid time range", "You need to have
 *  writer access to this calendar."). Devolvemos eso para que el banner del
 *  calendario sea útil en vez de un 400 opaco. */
export function googleErrMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as {
      response?: { data?: { error?: { message?: string; errors?: { message?: string }[] } } }
      // gaxios v7 VACÍA `response.data` al construir el GaxiosError (solo la
      // conserva si el body ya fue consumido). El `error.error` original de
      // la API sobrevive en `cause`/`error`, con `errors[].reason` incluido.
      cause?: unknown
      error?: unknown
      message?: string
    }
    const detail = anyE.response?.data?.error?.message
      ?? anyE.response?.data?.error?.errors?.[0]?.message
    if (detail) return detail

    for (const alt of [anyE.cause, anyE.error]) {
      if (alt && typeof alt === 'object') {
        const a = alt as { message?: string; errors?: { message?: string; reason?: string }[] }
        // `reason` ("badRequest", "timeRangeEmpty", "required"…) es lo que
        // realmente distingue un 400 de otro — "Bad Request" solo no sirve.
        const reason = a.errors?.[0]?.reason
        const msg = a.errors?.[0]?.message ?? a.message
        if (msg) return reason && reason !== msg ? `${msg} (${reason})` : msg
      }
    }

    if (typeof anyE.message === 'string') return anyE.message
  }
  return e instanceof Error ? e.message : 'unknown'
}

/** Volcado completo para logs del servidor. `googleErrMessage` se queda con
 *  una línea para el banner; esto guarda todo lo que Google mandó. */
export function googleErrDetail(e: unknown): unknown {
  if (!e || typeof e !== 'object') return e
  const anyE = e as { message?: string; status?: number; code?: unknown; cause?: unknown; error?: unknown }
  return {
    message: anyE.message,
    status: anyE.status,
    code: anyE.code,
    apiError: anyE.cause ?? anyE.error,
  }
}
