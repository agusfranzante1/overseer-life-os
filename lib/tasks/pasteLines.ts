/** Divide un texto pegado en renglones NO vacíos (trim + filtro).
 *
 *  Detecta TODOS los separadores de línea reales, no solo `\n`:
 *   - `\r\n` (Windows) y `\n` (Unix)
 *   - `\r` solo (Mac clásico / algunas apps)
 *   - U+2028 (LINE SEPARATOR) y U+2029 (PARAGRAPH SEPARATOR) — los usan PDFs,
 *     Google Docs, Word y varias apps al copiar. Con el split viejo (`/\r?\n/`)
 *     una lista copiada de ahí quedaba como UN solo renglón y la pregunta
 *     "¿dividir en tareas?" no aparecía.
 *
 *  Compartido por TODOS los pegados del task manager para que se comporten
 *  igual (New Task, subtareas, detalle, importar). */
export function splitPastedLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n|\u2028|\u2029/)
    .map((l) => l.trim())
    .filter(Boolean)
}
