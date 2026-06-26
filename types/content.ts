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

/** Redes / canales donde se publica una pieza. Cada item se taggea con
 *  UNA red — si querés cross-postear, duplicás el item con `network`
 *  distinto (los algoritmos premian contenido nativo, no copy-paste). */
export type ContentNetwork =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'x'
  | 'newsletter'
  | 'website'
  | 'podcast'
  | 'other'

export const NETWORK_META: Record<ContentNetwork, { label: string; icon: string; color: string }> = {
  instagram:   { label: 'Instagram',  icon: '📷', color: '#e1306c' },
  tiktok:      { label: 'TikTok',     icon: '🎵', color: '#ff0050' },
  youtube:     { label: 'YouTube',    icon: '▶️', color: '#ff0000' },
  linkedin:    { label: 'LinkedIn',   icon: '💼', color: '#0a66c2' },
  x:           { label: 'X / Twitter', icon: '𝕏', color: '#1da1f2' },
  newsletter:  { label: 'Newsletter', icon: '✉️', color: '#a855f7' },
  website:     { label: 'Web / Blog', icon: '🌐', color: '#10b981' },
  podcast:     { label: 'Podcast',    icon: '🎙️', color: '#f59e0b' },
  other:       { label: 'Otro',       icon: '·',  color: '#71717a' },
}

export type ContentStageId =
  | 'idea'
  | 'script'
  | 'recording'
  | 'editing'
  | 'scheduled'
  | 'published'

/** Pipeline propio de las Historias de Instagram (`format === 'stories'`).
 *  No tiene guion/grabación/edición — se arma como un carrusel de imágenes
 *  + un CTA, así que su "forma de avanzar" es distinta a la de un reel. */
export type StoryStageId =
  | 'idea'
  | 'design'      // armar las imágenes / frames
  | 'cta'         // definir el call-to-action
  | 'scheduled'
  | 'published'

/** Acción decidida tras analizar performance de una pieza —
 *  Sem 4 del ciclo de optimización. */
export type PostCycleAction = 'repeat' | 'improve' | 'delete' | 'undecided'

// ───────────────────────────────────────────────────────────────────
// PERFIL — cada perfil tiene su propio ADN, pilares y redes.
// Un user puede tener varios perfiles (marca personal, segundo proyecto,
// cliente, etc) y cada uno se administra de forma independiente.
// ───────────────────────────────────────────────────────────────────
export interface ContentProfile {
  id: string
  /** Nombre del perfil — "Personal", "Marca X", "Cliente Y". */
  name: string
  /** Color de identidad — usado para chips y bordes. */
  color: string
  /** Medalla de prioridad del perfil → define la prioridad de su tarea madre
   *  en el task manager: oro = alta, bronce = media, plata = baja. */
  medal?: 'gold' | 'silver' | 'bronze'
  /** Emoji o ícono para identificar el perfil de un vistazo. */
  icon?: string
  /** ADN específico de este perfil (audiencia, pilares, etc). */
  brandDNA: ContentBrandDNA
  /** Redes que usa este perfil. Sirve para filtrar el calendario y
   *  sugerir formatos al crear items. */
  networks: ContentNetwork[]
  /** Estilo visual / mood board del perfil — categorías de imágenes de
   *  referencia ("Estilo videos", "Estilo portadas", …). Opcional para
   *  back-compat con perfiles creados antes de la feature. */
  visualStyle?: VisualStyleCategory[]
  /** Baúl — caja de texto libre por perfil para guardar links de videos,
   *  referencias, ideas y cosas importantes del canal. Opcional. */
  baul?: string
  /** Tarea MADRE espejo en el proyecto "Content Strategy" del task manager.
   *  Cada pieza del pipeline del perfil se refleja como SUBTAREA de esta
   *  tarea (id de subtarea = `cs_<itemId>`). Vive en el payload JSONB del
   *  perfil → no requiere migración. */
  linkedTaskId?: string
  createdAt: string
  /** Timestamp de la última edición del perfil. Lo usa el sync para resolver
   *  conflictos con LWW (última edición gana) — sin esto el merge usaba
   *  "gana el remoto" y una edición local sin pushear (ej. el Baúl) la podía
   *  pisar un perfil remoto más viejo. Opcional para back-compat. */
  updatedAt?: string
}

/** Una imagen de referencia dentro de una categoría de estilo visual. El
 *  archivo vive en Supabase Storage (bucket `content-visual`); acá solo
 *  guardamos la URL pública (para `<img src>`) y el `path` (para borrar el
 *  objeto). Ver `lib/content/visualUpload.ts`. */
export interface VisualStyleImage {
  id: string
  /** URL pública para mostrar la imagen. */
  url: string
  /** Path dentro del bucket — necesario para borrar el archivo. */
  path: string
  /** Nota/etiqueta opcional de la referencia. */
  caption?: string
  createdAt: string
}

/** Categoría de estilo visual (ej. "Estilo videos", "Estilo portadas"). */
export interface VisualStyleCategory {
  id: string
  name: string
  images: VisualStyleImage[]
  createdAt: string
}

// ───────────────────────────────────────────────────────────────────
// ADN DE MARCA — uno por perfil
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
  /** Para qué sirve este pilar — una línea corta. */
  description: string
  /** Color para diferenciarlo visualmente. */
  color: string
  order: number
  /** "Mapa de conocimiento" del pilar — texto libre donde el user lista
   *  qué temas, ideas, sub-pilares, marcos, conceptos cubre en este
   *  pilar. Es el intermedio entre el ADN macro y las piezas concretas
   *  del pipeline. Notion-style hoja en blanco. Sirve como referencia
   *  rápida cuando armás campañas o generás el prompt para IA. */
  knowledgeMap?: string
}

// ───────────────────────────────────────────────────────────────────
// CAMPAÑAS MENSUALES
// ───────────────────────────────────────────────────────────────────
export interface ContentCampaign {
  id: string
  /** Perfil dueño de la campaña. */
  profileId: string
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
// HISTORIAS — un "frame" es un slide del carrusel de la historia.
// Se planifica como checklist (nota + listo), sin subir la imagen.
// ───────────────────────────────────────────────────────────────────
export interface StoryFrame {
  id: string
  /** Qué va en este slide — texto descriptivo (NO guion). */
  note: string
  /** Marcado cuando la imagen de este slide ya está hecha/lista. */
  done: boolean
}

// ───────────────────────────────────────────────────────────────────
// ITEMS DE CONTENIDO
// ───────────────────────────────────────────────────────────────────
export interface ContentItem {
  id: string
  /** Perfil dueño del item. */
  profileId: string
  /** Red / canal donde se publica. */
  network: ContentNetwork
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
  // ── Historias (solo cuando format === 'stories'): se arma como un
  //    carrusel de frames (sin guion) + un CTA, con su propio pipeline.
  /** Slides de la historia, en orden (es un carrusel). */
  frames?: StoryFrame[]
  /** Call-to-action de la historia (ej. "Mandá DM", "Deslizá ↑"). */
  cta?: string
  /** Etapa dentro del pipeline de Historias. */
  storyStage?: StoryStageId
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

/** Etapas del pipeline de Historias — orden de izquierda a derecha en el
 *  tablero. Distinto del de reels: sin guion/grabación/edición. */
export const STORY_STAGE_LABELS: Record<StoryStageId, { label: string; color: string }> = {
  idea:       { label: 'Idea',       color: '#71717a' },
  design:     { label: 'Diseño',     color: '#a855f7' },
  cta:        { label: 'CTA',        color: '#f59e0b' },
  scheduled:  { label: 'Programado', color: '#06b6d4' },
  published:  { label: 'Publicado',  color: '#10b981' },
}

/** Orden canónico de las etapas de Historias (para iterar columnas). */
export const STORY_STAGE_ORDER: StoryStageId[] = ['idea', 'design', 'cta', 'scheduled', 'published']

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
