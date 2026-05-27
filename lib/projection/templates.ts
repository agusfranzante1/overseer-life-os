import type { ProjectionTemplate, SPISection } from './types'

/** Annual template — sets the tone for the year.
 *  Heavy reflection, identity-level, long-horizon.
 *  Filled once at year start, revisited mid-year for course correction.
 *
 *  v2 changes:
 *    - Simplified `metas_anuales`: only ONE primary goal per area (no
 *      "secundaria" — the user explicitly wants just one main goal).
 *    - NEW `wheel_of_life` section: 8 life areas scored 0-100, rendered
 *      as sliders + a radar chart so the user can visualize where they
 *      are RIGHT NOW across all dimensions before defining annual goals. */
export const ANNUAL_TEMPLATE: ProjectionTemplate = {
  level: 'year',
  version: 2,
  title: 'Visión Anual',
  intro: 'El año es el horizonte largo. Acá definís quién querés ser, qué pilares activar y qué grandes metas perseguir. Lo trimestral, mensual y semanal salen de acá.',
  sections: [
    {
      key: 'identidad',
      emoji: '🦅',
      title: '¿Quién querés ser este año?',
      intro: 'Más allá de lograr cosas — quién es la versión tuya que dejás germinar en estos 365 días.',
      fields: [
        { key: 'persona', label: 'La persona que quiero ser al cerrar el año', type: 'textarea', hint: 'Cómo se mueve, qué decide, qué energía emana.' },
        { key: 'temas', label: 'Temas / pilares del año (3-5)', type: 'textarea', placeholder: '1. Disciplina\n2. Profundidad\n3. Conexión\n4. ...' },
        { key: 'una_cosa', label: 'Si solo lograras UNA cosa este año, ¿cuál sería?', type: 'textarea', hint: 'La que si la cumplís, hizo que el año valiera la pena.' },
      ],
    },

    // ─── Wheel of Life — scored radar across the main life areas ─────────
    {
      key: 'wheel_of_life',
      emoji: '🎯',
      title: 'Rueda de la vida · ¿dónde estás hoy?',
      intro: 'Puntuá cada área del 0 al 100 según cómo la sentís HOY. No es un objetivo — es un diagnóstico. El gráfico de abajo te muestra dónde está la energía y dónde necesitás apuntar este año.',
      fields: [
        { key: 'fisica',       label: 'Salud Física',           type: 'score', hint: 'Energía, fuerza, entrenamiento, descanso.' },
        { key: 'mental',       label: 'Salud Mental',           type: 'score', hint: 'Claridad, foco, descanso cognitivo.' },
        { key: 'emocional',    label: 'Salud Emocional',        type: 'score', hint: 'Cómo manejás tus emociones, autorregulación.' },
        { key: 'espiritual',   label: 'Conexión Espiritual',    type: 'score', hint: 'Sentido de algo más grande, prácticas internas.' },
        { key: 'relaciones',   label: 'Relaciones Personales',  type: 'score', hint: 'Familia, pareja, amigos, vínculos cercanos.' },
        { key: 'profesional',  label: 'Profesional / Carrera',  type: 'score', hint: 'Trabajo, propósito vocacional, ejecución.' },
        { key: 'financiera',   label: 'Salud Financiera',       type: 'score', hint: 'Ingresos, ahorro, gestión, sostenibilidad.' },
        { key: 'legado',       label: 'Propósito / Legado',     type: 'score', hint: 'Aporte al mundo, contribución, juego infinito.' },
      ],
    },

    {
      key: 'metas_anuales',
      emoji: '🎯',
      title: 'Metas del año',
      intro: 'Una sola meta principal por área — sin "secundarias" para no diluir el foco. Cada trimestre va a tomar un pedazo de esto.',
      fields: [
        { key: 'profesional_principal', label: 'Meta Profesional · principal', type: 'textarea', hint: 'Específica, medible. Ej: "USD 10k MRR en mi servicio".' },
        { key: 'personal_principal',    label: 'Meta Personal · principal',    type: 'textarea', hint: 'Ej: "Correr una media maratón sub-2hs", "Hablar inglés con fluidez".' },
      ],
    },
    {
      key: 'habitos',
      emoji: '⚙️',
      title: 'Hábitos clave a instalar',
      intro: 'Las acciones repetidas son lo que mueve la aguja. Definí qué hábitos sostenidos te llevarían a esas metas.',
      fields: [
        { key: 'habitos_pro', label: 'Hábitos profesionales / de ejecución', type: 'textarea', placeholder: 'Ej: 4hs deep work al día, post diario en Twitter...' },
        { key: 'habitos_personales', label: 'Hábitos personales / de salud', type: 'textarea', placeholder: 'Ej: gym 4x/semana, leer 30min antes de dormir...' },
        { key: 'habitos_eliminar', label: 'Hábitos a eliminar', type: 'textarea', hint: 'Lo que drena energía o tiempo sin retorno.' },
      ],
    },
    {
      key: 'recursos',
      emoji: '🧰',
      title: 'Recursos y obstáculos',
      defaultCollapsed: true,
      fields: [
        { key: 'recursos', label: '¿Qué recursos tengo a favor?', type: 'textarea', hint: 'Skills, contactos, capital, energía, tiempo, conocimiento.' },
        { key: 'obstaculos', label: '¿Qué obstáculos preveo?', type: 'textarea', hint: 'Patrones míos, contexto, distracciones.' },
        { key: 'mitigacion', label: '¿Cómo voy a navegar esos obstáculos?', type: 'textarea' },
      ],
    },
    {
      key: 'cierre_visualizacion',
      emoji: '🌅',
      title: 'Visualización de cierre',
      defaultCollapsed: true,
      intro: 'Imaginate el 31 de diciembre, mirando hacia atrás.',
      fields: [
        { key: 'orgullo', label: '¿Por qué te vas a sentir orgulloso?', type: 'textarea' },
        { key: 'lecciones_pasadas', label: '¿Qué lecciones del año pasado NO querés repetir?', type: 'textarea' },
      ],
    },
  ],
}

/** Three-layer breakdown section — used in both quarterly and monthly
 *  templates to deep-dive a CHALLENGING objective. Maps to the user's
 *  Notion exercise: ver la realidad sin filtro → cambiar el diálogo
 *  interno → diseñar el plan desde compasión y claridad. */
const TRES_CAPAS_SECTION: SPISection = {
  key: 'desgranar_retador',
  emoji: '🧩',
  title: 'Objetivo retador · desgranarlo en 3 capas',
  intro: 'Cuando hay un objetivo grande que se siente difícil, lo bajamos por capas. Primera capa: ver la realidad. Segunda capa: cambiar el diálogo. Tercera capa: diseñar el plan con compasión.',
  defaultCollapsed: true,
  subsections: [
    {
      key: 'capa_1',
      emoji: '1️⃣',
      title: 'Primera capa · ver la realidad',
      fields: [
        { key: 'objetivo_retador', label: '¿Cuál es el objetivo más retador que tenés ahora mismo?', type: 'textarea' },
        { key: 'mirando_reojo', label: '¿Qué parte de la situación real estás mirando de reojo, en lugar de mirarla de frente?', type: 'textarea' },
        { key: 'interpretacion', label: '¿Qué argumentación estás usando que NO es la situación, sino una interpretación de ella?', type: 'textarea' },
      ],
    },
    {
      key: 'capa_2',
      emoji: '2️⃣',
      title: 'Segunda capa · diálogo interno',
      fields: [
        { key: 'como_te_hablas', label: '¿Cómo te hablás a vos mismo cuando las cosas no van como esperabas?', type: 'textarea', hint: 'Escribilo LITERAL. Las frases exactas que aparecen en tu cabeza.' },
        { key: 'a_alguien_querido', label: 'Ahora escribí qué le dirías a alguien que querés en ese mismo momento.', type: 'textarea', hint: 'Las mismas palabras, el mismo tono que usarías con esa persona.' },
        { key: 'que_cambia', label: '¿Qué cambia si empezás a usar ese segundo tono con vos mismo?', type: 'textarea' },
      ],
    },
    {
      key: 'capa_3',
      emoji: '3️⃣',
      title: 'Tercera capa · el plan desde claridad',
      fields: [
        { key: 'plan_honesto', label: 'Sin historia, sin juicio, con compasión radical — ¿cuál es el plan honesto de cómo lograrías este objetivo?', type: 'textarea', hint: 'Un plan que lleva esfuerzo, contempla desafíos, no cree que todo debe llegar fácil — pero está diseñado para los momentos difíciles.' },
        { key: 'recursos_actuales', label: '¿Cuáles son los recursos con los que YA contás para este objetivo?', type: 'textarea' },
        { key: 'pieza_domino', label: 'Una acción de compromiso (la pieza dominó) durante 21 días', type: 'textarea', hint: 'La acción mínima sostenida que destraba todo el resto.' },
      ],
    },
  ],
}

/** Quarterly template — turn vision into 3-month focus.
 *  Filled at the start of each Q. The first month of the quarter is the
 *  best moment to do this in depth. */
export const QUARTER_TEMPLATE: ProjectionTemplate = {
  level: 'quarter',
  version: 2,
  title: 'Plan Trimestral',
  intro: 'El trimestre es donde la visión anual se vuelve operativa. Definí 1-3 batallas grandes y cómo se conectan con los meses que vienen.',
  sections: [
    {
      key: 'alineacion',
      emoji: '🧭',
      title: 'Alineación con el año',
      intro: 'Acordate de tus metas anuales y mirá cuáles tocan acá.',
      fields: [
        { key: 'metas_anuales_q', label: '¿Qué metas anuales tocan este trimestre?', type: 'textarea', hint: 'Releé tu plan anual y traé acá las metas que avanzás en estos 3 meses.' },
        { key: 'una_batalla', label: 'La UNA batalla principal del trimestre', type: 'textarea', hint: '¿Cuál es el frente donde más vas a empujar?' },
      ],
    },
    {
      key: 'objetivos_q',
      emoji: '🎯',
      title: 'Objetivos del trimestre',
      intro: '3 objetivos grandes — específicos, medibles, dateados al cierre del Q.',
      fields: [
        { key: 'objetivo_1', label: 'Objetivo #1', type: 'textarea' },
        { key: 'objetivo_2', label: 'Objetivo #2', type: 'textarea' },
        { key: 'objetivo_3', label: 'Objetivo #3', type: 'textarea' },
        { key: 'metricas', label: 'Métricas a trackear semanalmente', type: 'textarea', hint: 'KPIs concretos. Ej: clientes nuevos, peso corporal, horas de deep work...' },
      ],
    },
    {
      key: 'enfoque_mensual',
      emoji: '📆',
      title: 'Distribución por mes',
      intro: 'Pre-asigná un tema/foco a cada mes del trimestre para no llegar al mes 3 corriendo.',
      fields: [
        { key: 'mes_1', label: 'Mes 1 — foco principal', type: 'textarea', placeholder: 'Qué energía/proyectos dominan este mes' },
        { key: 'mes_2', label: 'Mes 2 — foco principal', type: 'textarea' },
        { key: 'mes_3', label: 'Mes 3 — foco principal (cierre)', type: 'textarea', hint: 'Típicamente el mes de cierre/entrega.' },
      ],
    },
    // 3-layer breakdown — for diving deep into the trimester's hardest goal
    TRES_CAPAS_SECTION,
    {
      key: 'sistema_q',
      emoji: '⚙️',
      title: 'Sistema operativo del trimestre',
      defaultCollapsed: true,
      fields: [
        { key: 'rutinas', label: 'Rutinas fijas / block times', type: 'textarea', hint: 'Lo que va al calendario sí o sí estos 3 meses.' },
        { key: 'compromisos', label: 'Compromisos externos / eventos importantes', type: 'textarea' },
        { key: 'no_quiero', label: '¿Qué NO quiero hacer en este trimestre?', type: 'textarea', hint: 'Cosas que estarías tentado a aceptar pero te desvían.' },
      ],
    },
    {
      key: 'aprendizajes_q',
      emoji: '🔬',
      title: 'Aprendizajes del Q anterior',
      defaultCollapsed: true,
      intro: 'Si ya cerraste un Q, traé acá lo que aprendiste para no repetir errores.',
      fields: [
        { key: 'que_funciono', label: '¿Qué funcionó del Q anterior?', type: 'textarea' },
        { key: 'que_no', label: '¿Qué no funcionó? ¿Por qué?', type: 'textarea' },
        { key: 'que_cambio', label: '¿Qué voy a hacer distinto?', type: 'textarea' },
      ],
    },
  ],
}

/** Monthly template — bridge between quarterly strategy and weekly execution.
 *  Filled at the start of each month. */
export const MONTH_TEMPLATE: ProjectionTemplate = {
  level: 'month',
  version: 2,
  title: 'Plan Mensual',
  intro: 'El mes es donde se concretan los objetivos del trimestre. Definí 3-4 proyectos grandes, los eventos importantes, y los bloques que activás.',
  sections: [
    {
      key: 'alineacion_m',
      emoji: '🧭',
      title: 'Alineación con el trimestre',
      fields: [
        { key: 'objetivos_q', label: '¿Qué objetivos del trimestre tocan este mes?', type: 'textarea' },
        { key: 'foco_mes', label: 'Foco principal del mes (1 frase)', type: 'text', hint: 'La idea-fuerza que ordena las 4 semanas.' },
      ],
    },
    {
      key: 'proyectos_m',
      emoji: '🚀',
      title: 'Proyectos / focos del mes',
      intro: '3-4 cosas grandes que querés ver avanzar significativamente este mes.',
      fields: [
        { key: 'proyecto_1', label: 'Proyecto #1', type: 'textarea' },
        { key: 'proyecto_2', label: 'Proyecto #2', type: 'textarea' },
        { key: 'proyecto_3', label: 'Proyecto #3', type: 'textarea' },
        { key: 'proyecto_4', label: 'Proyecto #4 (opcional)', type: 'textarea' },
      ],
    },
    // 3-layer breakdown — for diving deep into the month's hardest objective
    TRES_CAPAS_SECTION,
    {
      key: 'eventos_m',
      emoji: '📅',
      title: 'Eventos y compromisos del mes',
      fields: [
        { key: 'eventos', label: 'Eventos importantes esperados', type: 'textarea', placeholder: 'Viajes, fechas límite, reuniones grandes, lanzamientos, cumpleaños...' },
        { key: 'fechas_clave', label: 'Fechas clave / deadlines', type: 'textarea' },
      ],
    },
    {
      key: 'sistema_m',
      emoji: '⚙️',
      title: 'Sistema del mes',
      defaultCollapsed: true,
      fields: [
        { key: 'bloques', label: 'Bloques de calendario fijos', type: 'textarea', placeholder: 'Ej: Lun-Vie 8-9 anclaje, Lun-Vie 9-13 deep work, Sáb 10 SPI...' },
        { key: 'metricas_m', label: 'Métricas a trackear este mes', type: 'textarea' },
      ],
    },
    {
      key: 'premortem',
      emoji: '⚠️',
      title: 'Pre-mortem',
      defaultCollapsed: true,
      intro: 'Imaginate llegando al fin del mes y NO cumpliste tus proyectos. ¿Qué pasó?',
      fields: [
        { key: 'que_pasaria', label: '¿Qué pasaría si fallás este mes?', type: 'textarea', hint: 'Identificá los riesgos antes de que aparezcan.' },
        { key: 'como_evitar', label: '¿Cómo lo evitás?', type: 'textarea' },
      ],
    },
    {
      key: 'cierre_m',
      emoji: '🏁',
      title: 'Cierre del mes anterior',
      defaultCollapsed: true,
      intro: 'Aprendizajes del mes que recién terminó (si ya tenés uno).',
      fields: [
        { key: 'logros', label: 'Logros principales', type: 'textarea' },
        { key: 'aprendizajes', label: 'Aprendizajes / insights', type: 'textarea' },
        { key: 'ajustes', label: 'Ajustes para este mes nuevo', type: 'textarea' },
      ],
    },
  ],
}

export const ALL_TEMPLATES: Record<'year' | 'quarter' | 'month', ProjectionTemplate> = {
  year: ANNUAL_TEMPLATE,
  quarter: QUARTER_TEMPLATE,
  month: MONTH_TEMPLATE,
}

/** Wheel-of-Life areas — exported so the radar chart can pull labels/keys
 *  from a single source of truth. Must match the field keys in the
 *  `wheel_of_life` section above. */
export const WHEEL_AREAS: { key: string; label: string }[] = [
  { key: 'fisica',      label: 'Física' },
  { key: 'mental',      label: 'Mental' },
  { key: 'emocional',   label: 'Emocional' },
  { key: 'espiritual',  label: 'Espiritual' },
  { key: 'relaciones',  label: 'Relaciones' },
  { key: 'profesional', label: 'Profesional' },
  { key: 'financiera',  label: 'Financiera' },
  { key: 'legado',      label: 'Legado' },
]
