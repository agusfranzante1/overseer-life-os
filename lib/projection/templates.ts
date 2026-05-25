import type { ProjectionTemplate } from './types'

/** Annual template — sets the tone for the year.
 *  Heavy reflection, identity-level, long-horizon.
 *  Filled once at year start, revisited mid-year for course correction. */
export const ANNUAL_TEMPLATE: ProjectionTemplate = {
  level: 'year',
  version: 1,
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
    {
      key: 'metas_anuales',
      emoji: '🎯',
      title: 'Metas del año',
      intro: 'Las metas grandes — profesionales y personales. Cada trimestre va a tomar un pedazo de esto.',
      fields: [
        { key: 'profesional_1', label: 'Meta Profesional · principal', type: 'textarea', hint: 'Específica, medible. Ej: "USD 10k MRR en mi servicio".' },
        { key: 'profesional_2', label: 'Meta Profesional · secundaria (opcional)', type: 'textarea' },
        { key: 'personal_1', label: 'Meta Personal · principal', type: 'textarea', hint: 'Ej: "Correr una media maratón sub-2hs", "Hablar inglés con fluidez".' },
        { key: 'personal_2', label: 'Meta Personal · secundaria (opcional)', type: 'textarea' },
        { key: 'salud_finanzas', label: 'Metas de salud y finanzas', type: 'textarea' },
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

/** Quarterly template — turn vision into 3-month focus.
 *  Filled at the start of each Q. The first month of the quarter is the
 *  best moment to do this in depth. */
export const QUARTER_TEMPLATE: ProjectionTemplate = {
  level: 'quarter',
  version: 1,
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
  version: 1,
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
