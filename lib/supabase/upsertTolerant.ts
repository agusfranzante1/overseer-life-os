/** Upsert tolerante a columnas que todavía no existen en la tabla remota.
 *
 *  Cuando se agrega un campo nuevo a una tabla de columnas reales (tasks,
 *  subtasks), el push empieza a mandar esa columna ANTES de que el usuario
 *  corra la migración. Postgres/PostgREST rechaza el batch entero y el push
 *  tira → el dominio COMPLETO deja de sincronizar: los cambios no suben y,
 *  peor, los BORRADOS nunca se propagan (el `syncDeletes` va después del
 *  upsert), así que todo lo que borrás vuelve en el próximo pull. Eso fue lo
 *  que hizo que series recurrentes borradas reaparecieran una y otra vez.
 *
 *  Acá: si el error dice "esa columna no existe", la sacamos del payload y
 *  reintentamos. Sincroniza todo lo demás (y los borrados se propagan); el
 *  campo nuevo no viaja hasta que se corra la migración, y el toast lo avisa.
 *  Cualquier otro error se devuelve tal cual para que el caller lo propague. */

type UpsertError = { message?: string; code?: string } | null
/** Mínimo que necesitamos del cliente — así el test puede pasar un doble. */
export type UpsertRunner = (rows: Record<string, unknown>[]) => Promise<{ error: UpsertError }>

// Mensajes reales que devuelve el backend:
//   PostgREST PGRST204 → Could not find the 'favorite' column of 'tasks' in the schema cache
//   Postgres    42703  → column "favorite" of relation "tasks" does not exist
//                        column tasks.favorite does not exist
const MISSING_COLUMN_RE = /column ["']?([a-z0-9_]+)["']? of relation|could not find the ['"]?([a-z0-9_]+)['"]? column|column ["']?[a-z_]+\.([a-z0-9_]+)["']? does not exist/i

/** Nombre de la columna faltante que reporta el error, o null si el error es de otra cosa. */
export function missingColumnFrom(error: UpsertError): string | null {
  if (!error?.message) return null
  const m = MISSING_COLUMN_RE.exec(error.message)
  if (!m) return null
  return m[1] ?? m[2] ?? m[3] ?? null
}

/** Corre el upsert descartando las columnas que la tabla no tenga.
 *  `dropped` = las que hubo que dejar afuera (vacío = todo viajó). */
export async function upsertTolerant(
  run: UpsertRunner, rows: Record<string, unknown>[], label = 'tabla',
): Promise<{ error: UpsertError; dropped: string[] }> {
  let payload = rows
  const dropped: string[] = []
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await run(payload)
    if (!r.error) return { error: null, dropped }
    const col = missingColumnFrom(r.error)
    // Error real (RLS, red, FK…) o una columna que ya intentamos sacar →
    // no insistimos: que el caller lo reporte y corte como siempre.
    if (!col || dropped.includes(col)) return { error: r.error, dropped }
    dropped.push(col)
    payload = payload.map((row) => {
      const next = { ...row }
      delete next[col]
      return next
    })
  }
  return { error: { message: `${label}: demasiadas columnas faltantes (${dropped.join(', ')})` }, dropped }
}
