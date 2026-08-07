/**
 * Mapa mental espejo de cada perfil de Content Strategy.
 *
 * Mismo patrón que `contentTasks` (la tarea madre en el task manager): el
 * perfil guarda el id en su payload (`linkedMindMapId`) y el mapa vive en
 * Mapas Mentales como cualquier otro, pero dentro de una carpeta BLOQUEADA
 * llamada "Content Strategy".
 *
 * Bloqueada quiere decir: no se puede renombrar, no se puede borrar, y sus
 * mapas no se pueden mover afuera ni eliminar. La idea es justamente que no
 * se pierdan por accidente.
 *
 * Se importa dinámicamente desde contentStore para no cerrar un ciclo de
 * imports entre stores.
 */
import { useMindMapStore } from '@/lib/store/mindmapStore'
import { useContentStore } from '@/lib/store/contentStore'

export const CONTENT_STRATEGY_FOLDER = 'Content Strategy'

/** Devuelve el id de la carpeta bloqueada, creándola si todavía no existe.
 *  Idempotente: si ya hay una, no crea otra. */
export function ensureContentStrategyFolder(): string {
  const { folders, createFolder } = useMindMapStore.getState()
  const existing = folders.find((f) => f.locked && f.name === CONTENT_STRATEGY_FOLDER)
  if (existing) return existing.id
  return createFolder(CONTENT_STRATEGY_FOLDER, { locked: true })
}

/**
 * Garantiza que el perfil tenga su mapa mental y devuelve el id.
 *
 * Cubre los tres casos:
 *  - el perfil nunca tuvo mapa → lo crea
 *  - lo tenía pero el mapa ya no está (borrado desde otro dispositivo antes
 *    de que existiera la protección) → lo vuelve a crear
 *  - ya existe → lo devuelve tal cual, y de paso lo reacomoda en la carpeta
 *    por si quedó suelto
 */
export function ensureProfileMindMap(profileId: string): string | null {
  const profile = useContentStore.getState().profiles.find((p) => p.id === profileId)
  if (!profile) return null

  const mm = useMindMapStore.getState()
  const folderId = ensureContentStrategyFolder()

  const existing = profile.linkedMindMapId
    ? mm.maps.find((m) => m.id === profile.linkedMindMapId)
    : undefined

  if (existing) {
    // Reacomodo defensivo: si por lo que sea quedó fuera de la carpeta, vuelve.
    if (existing.folderId !== folderId) {
      useMindMapStore.setState((s) => ({
        maps: s.maps.map((m) => m.id !== existing.id ? m : { ...m, folderId, updatedAt: new Date().toISOString() }),
      }))
    }
    return existing.id
  }

  const mapId = mm.createMap(profile.name || 'Perfil')
  // No usamos moveMapToFolder: esa acción se niega a tocar mapas de carpetas
  // bloqueadas, y acá justamente estamos metiéndolo en una.
  useMindMapStore.setState((s) => ({
    maps: s.maps.map((m) => m.id !== mapId ? m : { ...m, folderId, updatedAt: new Date().toISOString() }),
  }))
  useContentStore.getState().updateProfile(profileId, { linkedMindMapId: mapId })
  return mapId
}

/** Mantiene el título del mapa igual al nombre del perfil. Silencioso si el
 *  perfil todavía no tiene mapa. */
export function renameProfileMindMap(profileId: string, name: string): void {
  const profile = useContentStore.getState().profiles.find((p) => p.id === profileId)
  if (!profile?.linkedMindMapId) return
  const mm = useMindMapStore.getState()
  if (!mm.maps.some((m) => m.id === profile.linkedMindMapId)) return
  mm.renameMap(profile.linkedMindMapId, name)
}
