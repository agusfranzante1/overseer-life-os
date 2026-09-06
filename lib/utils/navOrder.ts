/** Dónde cae en el sidebar una sección NUEVA.
 *
 *  El orden del menú es el que dejó el usuario (`navOrder` / `navTopOrder`,
 *  guardado y sincronizado). Cuando se agrega una sección al código, esa clave
 *  no existe en el orden guardado, y hasta ahora se apilaba **al final** — o
 *  sea que una sección pensada para vivir abajo de "My Journal" aparecía al
 *  fondo de todo, después de Alimentación.
 *
 *  Acá se inserta en su lugar: justo después del vecino ANTERIOR que tenga en
 *  el orden de referencia (el del código) y que ya esté en el menú. Si ninguno
 *  de sus anteriores está —caso raro: los ocultaste a todos— cae al final,
 *  que es el comportamiento de siempre.
 */
export function mergeNavOrder(saved: string[], reference: string[]): string[] {
  const known = new Set(reference)
  const out: string[] = []
  const seen = new Set<string>()
  // Lo guardado manda, descartando lo que ya no existe y los repetidos.
  for (const key of saved) {
    if (!known.has(key) || seen.has(key)) continue
    out.push(key)
    seen.add(key)
  }
  // Y lo que falta entra en su posición relativa, no al final.
  for (let i = 0; i < reference.length; i++) {
    const key = reference[i]
    if (seen.has(key)) continue
    let pos = out.length
    for (let j = i - 1; j >= 0; j--) {
      const at = out.indexOf(reference[j])
      if (at >= 0) { pos = at + 1; break }
    }
    out.splice(pos, 0, key)
    seen.add(key)
  }
  return out
}
