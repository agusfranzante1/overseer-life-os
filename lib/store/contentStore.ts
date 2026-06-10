'use client'
/**
 * Store del Calendario de Contenido. Persiste localmente vía Zustand
 * persist. La sincronización a Supabase queda pendiente para una
 * siguiente fase (cuando el user lo necesite multi-device); por ahora
 * el snapshot manual de tasks ya cubre el caso de no perder data.
 *
 * Estructura:
 *   - brandDNA  → singleton con el ADN de marca + pilares
 *   - campaigns → muchas, una por mes (puede haber 0..N por mes)
 *   - items     → muchos, organizados por scheduledYmd
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ContentBrandDNA,
  ContentCampaign,
  ContentItem,
  ContentPillar,
  ContentWeeklyFocus,
  ContentStageId,
} from '@/types/content'
import { EMPTY_BRAND_DNA, DEFAULT_PILLARS } from '@/types/content'

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

interface State {
  brandDNA: ContentBrandDNA
  campaigns: ContentCampaign[]
  items: ContentItem[]
}

interface Actions {
  // Brand DNA
  updateBrandDNA: (patch: Partial<ContentBrandDNA>) => void
  resetBrandDNAPillars: () => void

  // Pillars
  addPillar: (p: Omit<ContentPillar, 'id' | 'order'>) => void
  updatePillar: (id: string, patch: Partial<ContentPillar>) => void
  removePillar: (id: string) => void

  // Campaigns
  addCampaign: (c: Omit<ContentCampaign, 'id' | 'createdAt' | 'updatedAt' | 'weeklyFoci'>) => string
  updateCampaign: (id: string, patch: Partial<ContentCampaign>) => void
  removeCampaign: (id: string) => void
  // Weekly focus
  addWeeklyFocus: (campaignId: string, weekStartYmd: string, theme: string) => void
  updateWeeklyFocus: (campaignId: string, focusId: string, theme: string) => void
  removeWeeklyFocus: (campaignId: string, focusId: string) => void

  // Items
  addItem: (i: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateItem: (id: string, patch: Partial<ContentItem>) => void
  removeItem: (id: string) => void
  setItemStage: (id: string, stage: ContentStageId) => void

  // Selectors
  getItemsForMonth: (monthYmd: string) => ContentItem[]
  getItemsForDay: (ymd: string) => ContentItem[]
  getCampaignForMonth: (monthYmd: string) => ContentCampaign | undefined
}

export const useContentStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      brandDNA: EMPTY_BRAND_DNA,
      campaigns: [],
      items: [],

      updateBrandDNA: (patch) =>
        set((s) => ({ brandDNA: { ...s.brandDNA, ...patch } })),

      resetBrandDNAPillars: () =>
        set((s) => ({ brandDNA: { ...s.brandDNA, pillars: DEFAULT_PILLARS } })),

      addPillar: (p) =>
        set((s) => ({
          brandDNA: {
            ...s.brandDNA,
            pillars: [
              ...s.brandDNA.pillars,
              { ...p, id: genId('pillar'), order: s.brandDNA.pillars.length },
            ],
          },
        })),
      updatePillar: (id, patch) =>
        set((s) => ({
          brandDNA: {
            ...s.brandDNA,
            pillars: s.brandDNA.pillars.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          },
        })),
      removePillar: (id) =>
        set((s) => ({
          brandDNA: {
            ...s.brandDNA,
            pillars: s.brandDNA.pillars.filter((p) => p.id !== id),
          },
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
          // Limpiamos referencias en items.
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
          // Items que apuntaban a este focus pierden la referencia.
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

      getItemsForMonth: (monthYmd) =>
        get().items
          .filter((it) => it.scheduledYmd.startsWith(monthYmd))
          .sort((a, b) => a.scheduledYmd.localeCompare(b.scheduledYmd) || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '')),

      getItemsForDay: (ymd) =>
        get().items
          .filter((it) => it.scheduledYmd === ymd)
          .sort((a, b) => (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '')),

      getCampaignForMonth: (monthYmd) =>
        get().campaigns.find((c) => c.monthYmd === monthYmd),
    }),
    {
      name: 'overseer-content',
      partialize: (s) => ({
        brandDNA: s.brandDNA,
        campaigns: s.campaigns,
        items: s.items,
      }),
    },
  ),
)

// ───────────────────────────────────────────────────────────────────
// AI Prompt builder — compila ADN + contexto del mes en un prompt
// listo para pegar en ChatGPT / Claude. La idea es delegar la
// ideación con CONTEXTO completo, no pedir "dame ideas".
// ───────────────────────────────────────────────────────────────────
export function buildAIContentPrompt(
  state: State,
  options: {
    monthYmd: string                              // ej. "2026-06"
    weekStartYmd?: string                         // si querés foco semanal específico
    targetItemCount?: number                      // cuántas piezas pedirle
  },
): string {
  const { brandDNA, campaigns, items } = state
  const { monthYmd, weekStartYmd, targetItemCount = 10 } = options
  const campaign = campaigns.find((c) => c.monthYmd === monthYmd)
  const weekFocus = weekStartYmd
    ? campaign?.weeklyFoci.find((f) => f.weekStartYmd === weekStartYmd)
    : undefined

  const monthItems = items.filter((it) => it.scheduledYmd.startsWith(monthYmd))
  const publishedItems = monthItems.filter((it) => it.stage === 'published')

  const pillarLines = brandDNA.pillars
    .sort((a, b) => a.order - b.order)
    .map((p) => `- **${p.label}**: ${p.description}`)
    .join('\n')

  const recentNotes = publishedItems
    .filter((it) => it.qualitativeNotes)
    .slice(-3)
    .map((it) => `- "${it.title}" → ${it.qualitativeNotes}`)
    .join('\n')

  return `Vas a actuar como mi Estratega Creativo. Tu trabajo es proponerme ideas de contenido COHERENTES con mi ADN de marca y la metodología por capas que sigo. No quiero ideas genéricas — quiero piezas que sean "células visibles de mi pensamiento estratégico".

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

Generá **${targetItemCount} ideas de contenido** para ${weekFocus ? 'esta semana' : `el mes de ${monthYmd}`}. Para cada idea devolveme:

1. **Pilar** — a cuál de mis pilares pertenece (Estrategia / Creatividad / Propósito Digital / etc)
2. **Formato sugerido** — Reel / Carrusel / Stories / Post / Newsletter / Thread
3. **Tipo de momento** — Check-in / Live moment / Talk / B-roll / Recap
4. **Ángulo narrativo** — Educativo / Controversial / Tutorial / Personal / etc
5. **Hook** — primer línea (3 primeros segundos). Tiene que pegar.
6. **Título / encabezado**
7. **Estructura del guion** — bullet points de qué decir
8. **Por qué funciona para MI ADN** — 1-2 líneas conectando la idea con algo del sistema implícito

Reglas estrictas:
- Variá los ángulos a lo largo del mes (no todo "educativo")
- Mezclá tipos de momentos (no todo "talk a cámara")
- Priorizá la autoría y el criterio propio por sobre las tendencias vacías del algoritmo
- Cada pieza debe ser una "célula visible" de mi pensamiento estratégico
- Si una idea no encaja con mi sistema implícito, NO la propongas

Formato de output: markdown, una sección por idea, numeradas.`
}
