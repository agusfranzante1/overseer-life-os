/**
 * Sistema de Calendario de Contenido — basado en la metodología "Estratega
 * Creativo". El objetivo NO es publicar más; es que cada pieza sea una
 * "célula visible" del pensamiento estratégico del creador.
 *
 * Arquitectura por capas:
 *   ADN de marca (singleton)
 *     → Pilares de comunicación (3 default + custom)
 *     → Campañas mensuales (intención del mes)
 *         → Foco semanal (tema central de la semana)
 *             → Items diarios (formato + ángulo + tipo + guion)
 */

/** Tipología de contenido — "momentos" que la metodología recomienda
 *  variar en el calendario para mantenerlo dinámico. */
export type ContentMomentType =
  | 'check-in'    // breve update de lo que estás haciendo
  | 'live-moment' // mostrar situaciones en 3ra persona, audiencia "presente"
  | 'talk'        // charla directa a cámara desarrollando idea profunda
  | 'b-roll'      // planos detalle (libros, herramientas) → estética
  | 'recap'       // cierre de semana / proyecto, qué aprendiste
  | 'other'

export type ContentFormat =
  | 'reel'
  | 'carousel'
  | 'stories'
  | 'post'
  | 'video'
  | 'newsletter'
  | 'thread'      // twitter/x thread
  | 'short'       // YT Short
  | 'other'

export type ContentStageId =
  | 'idea'
  | 'script'
  | 'recording'
  | 'editing'
  | 'scheduled'
  | 'published'

/** Acción decidida tras analizar performance de una pieza —
 *  Sem 4 del ciclo de optimización. */
export type PostCycleAction = 'repeat' | 'improve' | 'delete' | 'undecided'

// ───────────────────────────────────────────────────────────────────
// ADN DE MARCA — singleton por usuario
// ───────────────────────────────────────────────────────────────────
export interface ContentBrandDNA {
  // Auditoría e "Insights"
  /** Qué te vuelve distinto. */
  differential: string
  /** Qué tensión querés resolver en el mercado. */
  marketTension: string
  /** Qué deseo representás en las personas. */
  desire: string

  // Sistema Implícito — el "software interno" que guía estética y narrativa
  /** Intereses (separados por coma). */
  interests: string
  /** Obsesiones recurrentes. */
  obsessions: string
  /** Miedos / tensiones internas. */
  fears: string
  /** Referencias (gente, libros, marcas, lugares). */
  references: string

  // Problema Específico
  /** Qué problema solucionás. */
  problem: string
  /** De qué forma específica. */
  solutionApproach: string
  /** A quién (target específico). */
  audience: string

  // Pilares (3 default + custom)
  pillars: ContentPillar[]
}

export interface ContentPillar {
  id: string
  /** Ej. "Estrategia", "Creatividad", "Propósito Digital". */
  label: string
  /** Para qué sirve este pilar. */
  description: string
  /** Color para diferenciarlo visualmente. */
  color: string
  order: number
}

// ───────────────────────────────────────────────────────────────────
// CAMPAÑAS MENSUALES
// ───────────────────────────────────────────────────────────────────
export interface ContentCampaign {
  id: string
  /** Mes al que aplica — "YYYY-MM". */
  monthYmd: string
  /** Título corto de la campaña ("Lanzamiento X", "Viaje a Japón", etc). */
  title: string
  /** Intención / objetivo del mes. */
  goal: string
  /** Foco por semana — la campaña se descompone en 4-5 semanas. */
  weeklyFoci: ContentWeeklyFocus[]
  // Roadmap 30 días — la metodología sugiere usar el ciclo de 4 semanas
  // como motor de iteración. Estos campos se llenan progresivamente.
  /** Semana 1: hipótesis estratégica + insights recolectados. */
  hypothesis?: string
  collectedInsights?: string
  /** Semana 4: análisis post-mes. */
  whatWorked?: string
  whatDidntWork?: string
  /** Foco que arrastrás al mes siguiente. */
  nextMonthFocus?: string
  createdAt: string
  updatedAt: string
}

export interface ContentWeeklyFocus {
  id: string
  /** Lunes de la semana — "YYYY-MM-DD". */
  weekStartYmd: string
  /** Tema central de la semana, derivado de la campaña. */
  theme: string
}

// ───────────────────────────────────────────────────────────────────
// ITEMS DE CONTENIDO
// ───────────────────────────────────────────────────────────────────
export interface ContentItem {
  id: string
  /** Campaña a la que pertenece (opcional). */
  campaignId?: string
  /** Foco semanal específico (opcional). */
  weekFocusId?: string
  /** Pilar de comunicación. */
  pillarId: string
  /** Fecha planeada de publicación — "YYYY-MM-DD". */
  scheduledYmd: string
  /** Hora opcional — "HH:MM". */
  scheduledTime?: string
  format: ContentFormat
  /** Ángulo narrativo — educativo, controversial, tutorial, personal, etc. */
  angle: string
  /** Tipología del momento. */
  momentType: ContentMomentType
  // ── Contenido
  /** Primer gancho — los 3 primeros segundos / la primera línea. */
  hook: string
  /** Título o encabezado de la pieza. */
  title: string
  /** Guion / texto / descripción del post. */
  script: string
  /** Hashtags separados por espacio o coma. */
  hashtags: string
  /** Notas adicionales (referencias visuales, brief, etc). */
  notes?: string
  // ── Producción
  stage: ContentStageId
  // ── Performance — se llena post-publicación (Sem 4 del ciclo)
  views?: number
  likes?: number
  comments?: number
  saves?: number
  shares?: number
  /** Notas cualitativas: qué comentarios hubo, qué aprendiste. */
  qualitativeNotes?: string
  /** Decisión para el próximo ciclo. */
  postCycleAction?: PostCycleAction
  /** URL del post publicado, para chequear desde acá. */
  publishedUrl?: string
  createdAt: string
  updatedAt: string
}

// ───────────────────────────────────────────────────────────────────
// Defaults / helpers
// ───────────────────────────────────────────────────────────────────
export const DEFAULT_PILLARS: ContentPillar[] = [
  {
    id: 'pillar_strategy',
    label: 'Estrategia',
    description: 'Autoridad. Conocimiento técnico, procesos, casos de éxito, soluciones tangibles.',
    color: '#6366f1',
    order: 0,
  },
  {
    id: 'pillar_creativity',
    label: 'Creatividad',
    description: 'Diferenciación. Tendencias, procesos creativos propios, visiones originales.',
    color: '#ec4899',
    order: 1,
  },
  {
    id: 'pillar_purpose',
    label: 'Propósito Digital',
    description: 'Conexión humana. Detrás de escena, valores, miedos, día a día. Comunidad.',
    color: '#10b981',
    order: 2,
  },
]

export const EMPTY_BRAND_DNA: ContentBrandDNA = {
  differential: '',
  marketTension: '',
  desire: '',
  interests: '',
  obsessions: '',
  fears: '',
  references: '',
  problem: '',
  solutionApproach: '',
  audience: '',
  pillars: DEFAULT_PILLARS,
}

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  reel: 'Reel',
  carousel: 'Carrusel',
  stories: 'Stories',
  post: 'Post',
  video: 'Video largo',
  newsletter: 'Newsletter',
  thread: 'Thread',
  short: 'Short',
  other: 'Otro',
}

export const MOMENT_LABELS: Record<ContentMomentType, string> = {
  'check-in': 'Check-in',
  'live-moment': 'Live moment',
  talk: 'Talk',
  'b-roll': 'B-roll',
  recap: 'Recap',
  other: 'Otro',
}

export const STAGE_LABELS: Record<ContentStageId, { label: string; color: string }> = {
  idea:       { label: 'Idea',       color: '#71717a' },
  script:     { label: 'Guion',      color: '#3b82f6' },
  recording:  { label: 'Grabación',  color: '#a855f7' },
  editing:    { label: 'Edición',    color: '#f59e0b' },
  scheduled:  { label: 'Programado', color: '#06b6d4' },
  published:  { label: 'Publicado',  color: '#10b981' },
}

export const ANGLE_SUGGESTIONS: string[] = [
  'Educativo',
  'Controversial',
  'Tutorial',
  'Personal / Historia',
  'Inspiracional',
  'Análisis de tendencia',
  'Behind the scenes',
  'Pregunta provocadora',
  'Reflexión',
  'Lista / Recurso',
]
