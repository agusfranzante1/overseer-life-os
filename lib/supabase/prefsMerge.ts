/**
 * Merge por CAMPO de las preferencias.
 *
 * `app_preferences` es una fila única con un payload JSON. Con "último que
 * escribe gana" sobre el blob entero, un dispositivo que nunca tocó un campo
 * igual lo pisa con su valor local.
 *
 * Eso ya borró las carpetas del sidebar del usuario: la notebook conocía
 * `navGroups` pero lo tenía vacío, pusheó `navGroups: []`, y se llevó puestas
 * las carpetas que estaban en la compu. Mergear el blob no alcanza — el
 * problema no es una clave que falta, es una clave presente pero que ese
 * dispositivo nunca editó.
 *
 * La solución es guardar CUÁNDO se tocó cada campo, y que gane el más
 * reciente. Un dispositivo que nunca editó un campo no tiene marca para él y
 * por lo tanto nunca lo pisa.
 *
 * Puro (sin red ni stores) para poder testearlo solo.
 */

/** Momento de la última edición LOCAL de cada campo, en ISO. */
export type FieldTimes = Record<string, string>

export interface MergeResult<T> {
  merged: T
  times: FieldTimes
}

/**
 * Combina el valor local con el remoto campo por campo.
 *
 * Para cada campo gana el que se editó más recientemente. Los empates y los
 * casos sin marca se resuelven a favor del REMOTO, que es el lado
 * conservador: si este dispositivo no puede probar que editó el campo, no
 * tiene por qué pisarle el valor a otro.
 */
export function mergePrefsByField<T extends Record<string, unknown>>(
  local: T,
  localTimes: FieldTimes,
  remote: Partial<T> | null | undefined,
  remoteTimes: FieldTimes,
): MergeResult<T> {
  const merged = { ...local }
  const times: FieldTimes = { ...localTimes }
  if (!remote) return { merged, times }

  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const k of keys) {
    if (!(k in remote)) continue          // el remoto no lo trae → queda el local
    const lt = localTimes[k] ?? ''
    const rt = remoteTimes[k] ?? ''
    // `>` estricto: ante empate (incluido "ninguno de los dos tiene marca")
    // gana el remoto. Es lo que evita que un dispositivo recién actualizado,
    // con el campo en su valor por defecto, le borre el trabajo al otro.
    if (lt > rt) continue                 // el local es más nuevo → se queda
    ;(merged as Record<string, unknown>)[k] = remote[k]
    if (rt) times[k] = rt
  }
  return { merged, times }
}

/** Campos cuyo valor cambió entre dos snapshots. Se compara por JSON: los
 *  valores son chicos y así se detecta también un cambio adentro de un objeto
 *  (por ejemplo renombrar una carpeta). */
export function changedFields(
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>,
): string[] {
  if (!prev) return []
  const out: string[] = []
  for (const k of Object.keys(next)) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) out.push(k)
  }
  return out
}

/** Sella `fields` con el momento actual sobre las marcas que ya había. */
export function stampFields(times: FieldTimes, fields: string[], at = new Date().toISOString()): FieldTimes {
  if (fields.length === 0) return times
  const next = { ...times }
  for (const f of fields) next[f] = at
  return next
}
