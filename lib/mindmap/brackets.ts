/** Generador de paths SVG para "corchetes" del mapa mental.
 *
 *  Un corchete es una forma de nodo (`shape:'bracket'`) que se dibuja con un
 *  path SVG vectorizado (nada de imágenes) → nítido a cualquier tamaño. Sirve
 *  para AGRUPAR visualmente cosas, como en Illustrator.
 *
 *  Tipos: 'square' [ ]  ·  'curly' { }  ·  'round' ( )
 *  Direcciones: 'left' | 'right' (verticales)  ·  'top' | 'bottom' (horizontales)
 *
 *  El path se genera en el sistema de coordenadas del propio nodo (0..w, 0..h),
 *  así se renderiza con un <svg viewBox="0 0 w h"> y el stroke se mantiene
 *  constante con `vector-effect="non-scaling-stroke"`.
 */

export type BracketKind = 'square' | 'curly' | 'round'
export type BracketDir = 'left' | 'right' | 'top' | 'bottom'

/** Devuelve el `d` de un <path> para un corchete de `kind`/`dir` que llena una
 *  caja de `w`×`h`. Canónico = corchete IZQUIERDO (columna a la izquierda,
 *  brazos hacia la derecha); las otras direcciones se obtienen mapeando coords. */
export function bracketPath(kind: BracketKind, dir: BracketDir, w: number, h: number): string {
  const vertical = dir === 'left' || dir === 'right'
  const inset = 3
  // D = profundidad (largo de los brazos), L = largo (a lo largo de la columna).
  const D = (vertical ? w : h)
  const L = (vertical ? h : w)
  const d0 = inset            // lado de la columna
  const d1 = D - inset        // punta de los brazos
  const l0 = inset
  const l1 = L - inset
  const dm = (d0 + d1) / 2    // profundidad de la columna (para la llave)
  const lm = (l0 + l1) / 2    // medio a lo largo

  // Mapea (profundidad d, largo l) → (x, y) del nodo según la orientación.
  const map = (d: number, l: number): string => {
    let x: number, y: number
    switch (dir) {
      case 'left':   x = d;     y = l;     break
      case 'right':  x = w - d; y = l;     break
      case 'top':    x = l;     y = d;     break
      case 'bottom': x = l;     y = h - d; break
    }
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }

  if (kind === 'square') {
    // Brazo-punta arriba → baja a la columna → columna → brazo-punta abajo.
    return `M ${map(d1, l0)} L ${map(d0, l0)} L ${map(d0, l1)} L ${map(d1, l1)}`
  }

  if (kind === 'round') {
    // Un arco tipo "(": puntas arriba y abajo en d1, panza hacia d0 en el medio.
    return `M ${map(d1, l0)} Q ${map(d0 - inset, lm)} ${map(d1, l1)}`
  }

  // curly "{": columna en dm, nub que sale hasta d0 en el medio, brazos a d1.
  // q = radio de las curvas (acotado para que no se crucen en cajas cortas).
  const q = Math.max(5, Math.min(d1 - dm, (l1 - l0) * 0.22))
  return [
    `M ${map(d1, l0)}`,
    `C ${map(dm, l0)} ${map(dm, l0)} ${map(dm, l0 + q)}`,
    `L ${map(dm, lm - q)}`,
    `C ${map(dm, lm - q * 0.4)} ${map(d0, lm - q * 0.4)} ${map(d0, lm)}`,
    `C ${map(d0, lm + q * 0.4)} ${map(dm, lm + q * 0.4)} ${map(dm, lm + q)}`,
    `L ${map(dm, l1 - q)}`,
    `C ${map(dm, l1)} ${map(dm, l1)} ${map(d1, l1)}`,
  ].join(' ')
}
