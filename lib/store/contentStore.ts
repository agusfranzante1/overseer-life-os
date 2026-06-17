'use client'
/**
 * Store del Calendario de Contenido — multi-perfil + multi-red.
 *
 * Estructura:
 *   - profiles[]              → cada perfil tiene su propio ADN + redes
 *   - currentProfileId        → cuál perfil estás editando ahora
 *   - campaigns[]             → cada una pertenece a UN perfil
 *   - items[]                 → cada uno tiene profileId + network
 *
 * Compat con la versión single-profile anterior: si el store hidrata y
 * encuentra el viejo `brandDNA` top-level, lo migra a un perfil "Personal"
 * default y lo limpia. Los items/campaigns viejos sin profileId se
 * adoptan por el perfil default también.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ContentBrandDNA,
  ContentCampaign,
  ContentItem,
  ContentPillar,
  ContentProfile,
  ContentStageId,
  ContentNetwork,
  VisualStyleCategory,
  VisualStyleImage,
} from '@/types/content'
import { EMPTY_BRAND_DNA, DEFAULT_PILLARS } from '@/types/content'

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

interface State {
  /** Perfiles del user. Siempre hay al menos uno tras la migración. */
  profiles: ContentProfile[]
  /** Perfil "activo" — el que se muestra en las tabs por defecto. */
  currentProfileId: string
  campaigns: ContentCampaign[]
  items: ContentItem[]
  /** Legacy: ADN single-profile (pre multi-perfil). Si está presente al
   *  hidratar, lo migramos al perfil default. */
  brandDNA?: ContentBrandDNA
}

interface Actions {
  // Perfiles
  setCurrentProfile: (id: string) => void
  addProfile: (p: { name: string; color: string; icon?: string; networks?: ContentNetwork[] }) => string
  updateProfile: (id: string, patch: Partial<ContentProfile>) => void
  removeProfile: (id: string) => void

  // Estilo visual (mood board por perfil)
  addVisualCategory: (profileId: string, name: string) => string
  renameVisualCategory: (profileId: string, categoryId: string, name: string) => void
  removeVisualCategory: (profileId: string, categoryId: string) => void
  addVisualImage: (profileId: string, categoryId: string, image: VisualStyleImage) => void
  removeVisualImage: (profileId: string, categoryId: string, imageId: string) => void
  updateVisualImageCaption: (profileId: string, categoryId: string, imageId: string, caption: string) => void

  // Brand DNA — del perfil activo (helper)
  updateActiveBrandDNA: (patch: Partial<ContentBrandDNA>) => void
  resetActivePillars: () => void

  // Pillars — del perfil activo
  addPillar: (p: Omit<ContentPillar, 'id' | 'order'>) => void
  updatePillar: (id: string, patch: Partial<ContentPillar>) => void
  removePillar: (id: string) => void

  // Campaigns
  addCampaign: (c: Omit<ContentCampaign, 'id' | 'createdAt' | 'updatedAt' | 'weeklyFoci'>) => string
  updateCampaign: (id: string, patch: Partial<ContentCampaign>) => void
  removeCampaign: (id: string) => void
  addWeeklyFocus: (campaignId: string, weekStartYmd: string, theme: string) => void
  updateWeeklyFocus: (campaignId: string, focusId: string, theme: string) => void
  removeWeeklyFocus: (campaignId: string, focusId: string) => void

  // Items
  addItem: (i: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateItem: (id: string, patch: Partial<ContentItem>) => void
  removeItem: (id: string) => void
  setItemStage: (id: string, stage: ContentStageId) => void

  // Helpers
  getActiveProfile: () => ContentProfile | undefined
  getItemsForMonth: (monthYmd: string, profileId?: string) => ContentItem[]
  getItemsForDay: (ymd: string, profileId?: string) => ContentItem[]
  getCampaignForMonth: (monthYmd: string, profileId?: string) => ContentCampaign | undefined
}

/** Crea un perfil default vacío — usado al primer arranque o como
 *  destino de migración del modelo single-profile viejo. */
function makeDefaultProfile(brandDNA?: ContentBrandDNA): ContentProfile {
  return {
    id: genId('prof'),
    name: 'Personal',
    color: '#a855f7',
    icon: '🧑‍🎨',
    brandDNA: brandDNA ?? EMPTY_BRAND_DNA,
    networks: ['instagram', 'tiktok', 'youtube'],
    createdAt: new Date().toISOString(),
  }
}

export const useContentStore = create<State & Actions>()(
  persist(
    (set, get) => {
      const defaultProfile = makeDefaultProfile()
      return {
        profiles: [defaultProfile],
        currentProfileId: defaultProfile.id,
        campaigns: [],
        items: [],

        setCurrentProfile: (id) => set({ currentProfileId: id }),

        addProfile: (p) => {
          const id = genId('prof')
          const profile: ContentProfile = {
            id,
            name: p.name,
            color: p.color,
            icon: p.icon,
            brandDNA: { ...EMPTY_BRAND_DNA, pillars: DEFAULT_PILLARS.map((x) => ({ ...x, id: genId('pillar') })) },
            networks: p.networks ?? ['instagram'],
            createdAt: new Date().toISOString(),
          }
          set((s) => ({ profiles: [...s.profiles, profile], currentProfileId: id }))
          return id
        },
        updateProfile: (id, patch) =>
          set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        removeProfile: (id) =>
          set((s) => {
            if (s.profiles.length <= 1) return s   // siempre dejá uno
            const next = s.profiles.filter((p) => p.id !== id)
            const newCurrent = s.currentProfileId === id ? next[0].id : s.currentProfileId
            return {
              profiles: next,
              currentProfileId: newCurrent,
              // Items y campañas del perfil borrado se borran también
              items: s.items.filter((it) => it.profileId !== id),
              campaigns: s.campaigns.filter((c) => c.profileId !== id),
            }
          }),

        // ── Estilo visual ──────────────────────────────────────────────────
        // Helper: aplica `fn` a UN perfil. visualStyle arranca [] si no existe.
        addVisualCategory: (profileId, name) => {
          const id = genId('vcat')
          const cat: VisualStyleCategory = { id, name: name.trim() || 'Categoría', images: [], createdAt: new Date().toISOString() }
          set((s) => ({
            profiles: s.profiles.map((p) =>
              p.id === profileId ? { ...p, visualStyle: [...(p.visualStyle ?? []), cat] } : p,
            ),
          }))
          return id
        },
        renameVisualCategory: (profileId, categoryId, name) =>
          set((s) => ({
            profiles: s.profiles.map((p) =>
              p.id !== profileId ? p : {
                ...p,
                visualStyle: (p.visualStyle ?? []).map((c) => c.id === categoryId ? { ...c, name: name.trim() || c.name } : c),
              },
            ),
          })),
        removeVisualCategory: (profileId, categoryId) =>
          set((s) => ({
            profiles: s.profiles.map((p) =>
              p.id !== profileId ? p : { ...p, visualStyle: (p.visualStyle ?? []).filter((c) => c.id !== categoryId) },
            ),
          })),
        addVisualImage: (profileId, categoryId, image) =>
          set((s) => ({
            profiles: s.profiles.map((p) =>
              p.id !== profileId ? p : {
                ...p,
                visualStyle: (p.visualStyle ?? []).map((c) => c.id === categoryId ? { ...c, images: [...c.images, image] } : c),
              },
            ),
          })),
        removeVisualImage: (profileId, categoryId, imageId) =>
          set((s) => ({
            profiles: s.profiles.map((p) =>
              p.id !== profileId ? p : {
                ...p,
                visualStyle: (p.visualStyle ?? []).map((c) => c.id !== categoryId ? c : { ...c, images: c.images.filter((img) => img.id !== imageId) }),
              },
            ),
          })),
        updateVisualImageCaption: (profileId, categoryId, imageId, caption) =>
          set((s) => ({
            profiles: s.profiles.map((p) =>
              p.id !== profileId ? p : {
                ...p,
                visualStyle: (p.visualStyle ?? []).map((c) => c.id !== categoryId ? c : {
                  ...c,
                  images: c.images.map((img) => img.id === imageId ? { ...img, caption: caption.trim() || undefined } : img),
                }),
              },
            ),
          })),

        updateActiveBrandDNA: (patch) =>
          set((s) => ({
            profiles: s.profiles.map((p) =>
              p.id === s.currentProfileId
                ? { ...p, brandDNA: { ...p.brandDNA, ...patch } }
                : p,
            ),
          })),
        resetActivePillars: () =>
          set((s) => ({
            profiles: s.profiles.map((p) =>
              p.id === s.currentProfileId
                ? { ...p, brandDNA: { ...p.brandDNA, pillars: DEFAULT_PILLARS.map((x) => ({ ...x, id: genId('pillar') })) } }
                : p,
            ),
          })),

        addPillar: (p) =>
          set((s) => ({
            profiles: s.profiles.map((prof) =>
              prof.id === s.currentProfileId
                ? {
                    ...prof,
                    brandDNA: {
                      ...prof.brandDNA,
                      pillars: [
                        ...prof.brandDNA.pillars,
                        { ...p, id: genId('pillar'), order: prof.brandDNA.pillars.length },
                      ],
                    },
                  }
                : prof,
            ),
          })),
        updatePillar: (id, patch) =>
          set((s) => ({
            profiles: s.profiles.map((prof) =>
              prof.id === s.currentProfileId
                ? {
                    ...prof,
                    brandDNA: {
                      ...prof.brandDNA,
                      pillars: prof.brandDNA.pillars.map((p) => (p.id === id ? { ...p, ...patch } : p)),
                    },
                  }
                : prof,
            ),
          })),
        removePillar: (id) =>
          set((s) => ({
            profiles: s.profiles.map((prof) =>
              prof.id === s.currentProfileId
                ? {
                    ...prof,
                    brandDNA: {
                      ...prof.brandDNA,
                      pillars: prof.brandDNA.pillars.filter((p) => p.id !== id),
                    },
                  }
                : prof,
            ),
          })),

        addCampaign: (c) => {
          const id = genId('camp')
          const now = new Date().toISOString()
          set((s) => ({
            campaigns: [...s.campaigns, { ...c, id, weeklyFoci: [], createdAt: now, updatedAt: now }],
          }))
          return id
        },
        updateCampaign: (id, patch) =>
          set((s) => ({
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
            ),
          })),
        removeCampaign: (id) =>
          set((s) => ({
            campaigns: s.campaigns.filter((c) => c.id !== id),
            items: s.items.map((it) => (it.campaignId === id ? { ...it, campaignId: undefined, weekFocusId: undefined } : it)),
          })),
        addWeeklyFocus: (campaignId, weekStartYmd, theme) =>
          set((s) => ({
            campaigns: s.campaigns.map((c) =>
              c.id === campaignId
                ? {
                    ...c,
                    weeklyFoci: [...c.weeklyFoci, { id: genId('focus'), weekStartYmd, theme }],
                    updatedAt: new Date().toISOString(),
                  }
                : c,
            ),
          })),
        updateWeeklyFocus: (campaignId, focusId, theme) =>
          set((s) => ({
            campaigns: s.campaigns.map((c) =>
              c.id === campaignId
                ? {
                    ...c,
                    weeklyFoci: c.weeklyFoci.map((f) => (f.id === focusId ? { ...f, theme } : f)),
                    updatedAt: new Date().toISOString(),
                  }
                : c,
            ),
          })),
        removeWeeklyFocus: (campaignId, focusId) =>
          set((s) => ({
            campaigns: s.campaigns.map((c) =>
              c.id === campaignId
                ? {
                    ...c,
                    weeklyFoci: c.weeklyFoci.filter((f) => f.id !== focusId),
                    updatedAt: new Date().toISOString(),
                  }
                : c,
            ),
            items: s.items.map((it) => (it.weekFocusId === focusId ? { ...it, weekFocusId: undefined } : it)),
          })),

        addItem: (i) => {
          const id = genId('item')
          const now = new Date().toISOString()
          set((s) => ({ items: [...s.items, { ...i, id, createdAt: now, updatedAt: now }] }))
          return id
        },
        updateItem: (id, patch) =>
          set((s) => ({
            items: s.items.map((it) =>
              it.id === id ? { ...it, ...patch, updatedAt: new Date().toISOString() } : it,
            ),
          })),
        removeItem: (id) =>
          set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
        setItemStage: (id, stage) =>
          set((s) => ({
            items: s.items.map((it) =>
              it.id === id ? { ...it, stage, updatedAt: new Date().toISOString() } : it,
            ),
          })),

        getActiveProfile: () => {
          const s = get()
          return s.profiles.find((p) => p.id === s.currentProfileId) ?? s.profiles[0]
        },
        getItemsForMonth: (monthYmd, profileId) => {
          const s = get()
          const pid = profileId ?? s.currentProfileId
          return s.items
            .filter((it) => it.profileId === pid && it.scheduledYmd.startsWith(monthYmd))
            .sort((a, b) => a.scheduledYmd.localeCompare(b.scheduledYmd) || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''))
        },
        getItemsForDay: (ymd, profileId) => {
          const s = get()
          const pid = profileId ?? s.currentProfileId
          return s.items
            .filter((it) => it.profileId === pid && it.scheduledYmd === ymd)
            .sort((a, b) => (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''))
        },
        getCampaignForMonth: (monthYmd, profileId) => {
          const s = get()
          const pid = profileId ?? s.currentProfileId
          return s.campaigns.find((c) => c.profileId === pid && c.monthYmd === monthYmd)
        },
      }
    },
    {
      name: 'overseer-content',
      partialize: (s) => ({
        profiles: s.profiles,
        currentProfileId: s.currentProfileId,
        campaigns: s.campaigns,
        items: s.items,
      }),
      // Migración: si el storage viejo tenía top-level `brandDNA`, lo
      // mudamos a un perfil default y limpiamos items/campaigns viejos
      // taggeándolos con su profileId.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Estructura nueva ya está OK.
        if (state.profiles && state.profiles.length > 0) {
          // Adoptar items huérfanos en el perfil activo
          const pid = state.currentProfileId || state.profiles[0]?.id
          if (pid) {
            const profileIdSet = new Set(state.profiles.map((p) => p.id))
            for (const it of state.items) {
              if (!it.profileId || !profileIdSet.has(it.profileId)) {
                it.profileId = pid
              }
              // Network default si no lo tiene
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if (!(it as any).network) (it as any).network = 'instagram'
            }
            for (const c of state.campaigns) {
              if (!c.profileId || !profileIdSet.has(c.profileId)) {
                c.profileId = pid
              }
            }
          }
          return
        }
        // Estructura vieja: convertir brandDNA → perfil default
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const legacy = (state as any).brandDNA as ContentBrandDNA | undefined
        const def = makeDefaultProfile(legacy)
        state.profiles = [def]
        state.currentProfileId = def.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (state as any).brandDNA
        for (const it of state.items) {
          it.profileId = def.id
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!(it as any).network) (it as any).network = 'instagram'
        }
        for (const c of state.campaigns) {
          c.profileId = def.id
        }
      },
    },
  ),
)

// ───────────────────────────────────────────────────────────────────
// AI Prompt builder — multi-perfil aware
// ───────────────────────────────────────────────────────────────────
export function buildAIContentPrompt(
  state: {
    profiles: ContentProfile[]
    campaigns: ContentCampaign[]
    items: ContentItem[]
  },
  options: {
    profileId: string
    monthYmd: string
    weekStartYmd?: string
    targetItemCount?: number
    network?: ContentNetwork
  },
): string {
  const { profiles, campaigns, items } = state
  const { profileId, monthYmd, weekStartYmd, targetItemCount = 10, network } = options
  const profile = profiles.find((p) => p.id === profileId)
  if (!profile) return '(perfil no encontrado)'
  const brandDNA = profile.brandDNA
  const campaign = campaigns.find((c) => c.profileId === profileId && c.monthYmd === monthYmd)
  const weekFocus = weekStartYmd
    ? campaign?.weeklyFoci.find((f) => f.weekStartYmd === weekStartYmd)
    : undefined

  const profileItems = items.filter((it) => it.profileId === profileId)
  const monthItems = profileItems.filter((it) => it.scheduledYmd.startsWith(monthYmd))
  const publishedItems = monthItems.filter((it) => it.stage === 'published')

  const pillarLines = brandDNA.pillars
    .sort((a, b) => a.order - b.order)
    .map((p) => {
      const base = `- **${p.label}**: ${p.description}`
      // Si el pilar tiene knowledge map, lo agregamos como sub-bullets
      // para que la IA tenga el detalle de qué se cubre adentro.
      if (p.knowledgeMap && p.knowledgeMap.trim()) {
        const lines = p.knowledgeMap.split('\n').map((l) => l.trim()).filter(Boolean)
        if (lines.length > 0) {
          return `${base}\n  Mapa de conocimiento:\n${lines.map((l) => `  · ${l.replace(/^[-*•·]\s*/, '')}`).join('\n')}`
        }
      }
      return base
    })
    .join('\n')

  const recentNotes = publishedItems
    .filter((it) => it.qualitativeNotes)
    .slice(-3)
    .map((it) => `- "${it.title}" → ${it.qualitativeNotes}`)
    .join('\n')

  const networksLine = profile.networks.length > 0
    ? profile.networks.join(', ')
    : '(no definidas)'

  return `Vas a actuar como mi Estratega Creativo para el perfil **${profile.name}**. Tu trabajo es proponerme ideas de contenido COHERENTES con mi ADN de marca y la metodología por capas que sigo. No quiero ideas genéricas — quiero piezas que sean "células visibles de mi pensamiento estratégico".

# PERFIL: ${profile.name}
Redes activas: ${networksLine}${network ? `\n**Foco de esta tanda**: ${network}` : ''}

# ADN DE MARCA

## Diferencial
${brandDNA.differential || '(no definido todavía)'}

## Tensión que resuelvo en el mercado
${brandDNA.marketTension || '(no definida)'}

## Deseo que represento
${brandDNA.desire || '(no definido)'}

## Sistema implícito
- Intereses: ${brandDNA.interests || '—'}
- Obsesiones: ${brandDNA.obsessions || '—'}
- Miedos: ${brandDNA.fears || '—'}
- Referencias: ${brandDNA.references || '—'}

## Problema específico que soluciono
- Problema: ${brandDNA.problem || '—'}
- Forma específica: ${brandDNA.solutionApproach || '—'}
- A quién: ${brandDNA.audience || '—'}

# PILARES DE COMUNICACIÓN
${pillarLines}

# CAMPAÑA DEL MES (${monthYmd})
${campaign
  ? `**${campaign.title}**\nObjetivo: ${campaign.goal}${campaign.hypothesis ? `\nHipótesis estratégica: ${campaign.hypothesis}` : ''}`
  : '(no hay campaña definida para este mes — asumir trabajo de base)'}

${weekFocus ? `## Foco semanal (semana de ${weekFocus.weekStartYmd})\n${weekFocus.theme}\n` : ''}

# CONTEXTO DEL MES
- Piezas ya publicadas este mes: ${publishedItems.length}
- Piezas en pipeline: ${monthItems.length - publishedItems.length}
${recentNotes ? `\n## Notas cualitativas de lo publicado\n${recentNotes}` : ''}

# LO QUE TE PIDO

Generá **${targetItemCount} ideas de contenido** para ${weekFocus ? 'esta semana' : `el mes de ${monthYmd}`}${network ? `, optimizadas para **${network}**` : ''}. Para cada idea devolveme:

1. **Red sugerida** — Instagram / TikTok / YouTube / etc${network ? ` (por defecto: ${network})` : ' (variá entre las redes activas)'}
2. **Pilar** — a cuál de mis pilares pertenece
3. **Formato sugerido** — Reel / Carrusel / Stories / Post / Newsletter / Thread / Short
4. **Tipo de momento** — Check-in / Live moment / Talk / B-roll / Recap
5. **Ángulo narrativo** — Educativo / Controversial / Tutorial / Personal / etc
6. **Hook** — primer línea (3 primeros segundos). Tiene que pegar.
7. **Título / encabezado**
8. **Estructura del guion** — bullet points de qué decir
9. **Por qué funciona para MI ADN** — 1-2 líneas conectando la idea con algo del sistema implícito

Reglas estrictas:
- Variá los ángulos a lo largo del mes (no todo "educativo")
- Mezclá tipos de momentos (no todo "talk a cámara")
- Adaptá el formato a la red: TikTok/Reels = vertical corto + hook fuerte; YouTube = más profundidad; LinkedIn = autoridad; Newsletter = ensayo
- Priorizá la autoría y el criterio propio por sobre las tendencias vacías del algoritmo
- Cada pieza debe ser una "célula visible" de mi pensamiento estratégico
- Si una idea no encaja con mi sistema implícito, NO la propongas

Formato de output: markdown, una sección por idea, numeradas.`
}
