import type { ProjectionTemplate, SPISection, SPILane } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// EAGLE / VISTA DE ÁGUILA — on-demand reflection workspace.
//
// "Antes de Anual" en la UI. No tiene cadencia — abrís cuando querés hacer
// un examen profundo. Usa el sistema de carriles del SPI semanal pero las
// secciones están orientadas a DESCUBRIR qué metas anuales valen la pena.
//
// Es solo conversación / guía. Las metas finales se escriben en Anual
// mirando lo que sale de acá (no hay cascada automática).
// ─────────────────────────────────────────────────────────────────────────────

const EAGLE_LANES: SPILane[] = [
  {
    key: 'profundo',
    emoji: '🧘',
    title: 'Profundo',
    description: 'Identidad. Quién querés ser cuando termine el año.',
    color: '#a855f7',  // purple
  },
  {
    key: 'estrategico',
    emoji: '🧭',
    title: 'Estratégico',
    description: 'Dónde está la palanca. Qué áreas mueven todo el resto.',
    color: '#3b82f6',  // blue
  },
  {
    key: 'reflexivo',
    emoji: '👁️',
    title: 'Reflexivo',
    description: 'Patrones que se repiten. Qué querés romper este año.',
    color: '#10b981',  // emerald
  },
  {
    key: 'tactico',
    emoji: '🎯',
    title: 'Táctico',
    description: 'El borrador concreto. 1-2 metas por área para llevarte a Anual.',
    color: '#f59e0b',  // amber
  },
]

export const EAGLE_TEMPLATE: ProjectionTemplate = {
  level: 'eagle',
  version: 1,
  title: 'Vista de Águila',
  intro: 'Un examen on-demand para volar alto antes de bajar al año. Puntuá tu rueda, recorré los carriles que necesites, y al final llevate tus borradores a "Anual" para escribir las metas en limpio.',
  lanes: EAGLE_LANES,
  sections: [
    // ─── Wheel of Life — siempre visible, sin laneKey ─────────────────────
    {
      key: 'wheel_of_life',
      emoji: '🎯',
      title: 'Rueda de la vida · ¿dónde estás hoy?',
      intro: 'Puntuá cada área del 0 al 100 según cómo la sentís HOY. Es un diagnóstico, no un objetivo. Las áreas más bajas son las que más mueven la aguja si las subís.',
      fields: [
        { key: 'fisica',            label: 'Salud Física',              type: 'score', hint: 'Energía, fuerza, entrenamiento, descanso.' },
        { key: 'mental_emocional',  label: 'Salud Mental/Emocional',    type: 'score', hint: 'Claridad, foco, descanso cognitivo, autorregulación, cómo manejás tus emociones.' },
        { key: 'espiritual',        label: 'Conexión Espiritual',       type: 'score', hint: 'Sentido de algo más grande, prácticas internas.' },
        { key: 'relaciones',        label: 'Relaciones Personales',     type: 'score', hint: 'Familia, pareja, amigos, vínculos cercanos.' },
        { key: 'profesional',       label: 'Profesional / Carrera',     type: 'score', hint: 'Trabajo, propósito vocacional, ejecución.' },
        { key: 'financiera',        label: 'Salud Financiera',          type: 'score', hint: 'Ingresos, ahorro, gestión, sostenibilidad.' },
        { key: 'legado',            label: 'Propósito / Legado',        type: 'score', hint: 'Aporte al mundo, contribución, juego infinito.' },
        { key: 'hobbies',           label: 'Hobbies / Pasiones',        type: 'score', hint: 'Instrumentos, idiomas, deportes recreativos, pintura, lectura, lo que te enciende fuera del trabajo.' },
        { key: 'creatividad',       label: 'Creatividad',               type: 'score', hint: 'Output creativo — escribir, componer, diseñar, construir, contar historias. Qué tan viva está tu pulsión de hacer.' },
      ],
    },

    // ━━━ PROFUNDO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      key: 'eagle_persona',
      laneKey: 'profundo',
      emoji: '♥️',
      title: '¿Qué persona estás dejando germinar este año?',
      intro: 'Antes de hablar de metas, hablemos de identidad. Las metas que valen la pena son consecuencia de quién querés ser.',
      fields: [
        { key: 'persona_vision', label: 'La versión tuya que querés ver en el espejo el 31 de diciembre', type: 'textarea', hint: 'Cómo se mueve, qué decide, qué energía emana.' },
        { key: 'temas_anuales', label: 'Temas / pilares del año (3-5 palabras-fuerza)', type: 'textarea', placeholder: '1. Disciplina\n2. Profundidad\n3. Conexión\n4. ...' },
      ],
    },
    {
      key: 'eagle_una_cosa',
      laneKey: 'profundo',
      emoji: '🌅',
      title: 'Si solo lograras UNA cosa este año, ¿cuál sería?',
      intro: 'La que si la cumplís, hizo que el año valiera la pena. La que te deja en paz aunque todo lo demás falle.',
      defaultCollapsed: true,
      fields: [
        { key: 'una_cosa', label: 'Esa UNA cosa', type: 'textarea' },
        { key: 'yo_diciembre', label: 'Cómo se siente tu Yo de Diciembre cuando ya lo logró', type: 'textarea', hint: 'Descrilo en tiempo presente — "Estoy...", "Tengo...".' },
      ],
    },

    // ━━━ ESTRATÉGICO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      key: 'eagle_palanca',
      laneKey: 'estrategico',
      emoji: '🧭',
      title: 'Dónde está la palanca',
      intro: 'Mirá tu rueda de arriba. No todas las áreas pesan igual. Vamos a encontrar las 1-2 que, si las movés, mueven todo.',
      fields: [
        { key: 'rueda_mas_baja', label: '¿Qué área(s) están MÁS bajas y por qué?', type: 'textarea', hint: 'No te juzgues — describí la situación con honestidad.' },
        { key: 'area_palanca', label: '¿Cuál de las áreas, si la subís 30 puntos, eleva a las demás?', type: 'textarea', hint: 'A veces no es la más baja, es la que tiene mejor ROI.' },
        { key: 'movida_80_20', label: '¿Qué movida del 20% mueve el 80% del resultado en esas áreas?', type: 'textarea' },
      ],
    },
    {
      key: 'eagle_apuesta',
      laneKey: 'estrategico',
      emoji: '🎲',
      title: 'Apuesta · ¿cuáles serían tus áreas principales?',
      intro: 'Si tuvieras que apostar tu año a unas pocas áreas (las que vas a trabajar activamente), ¿cuáles? Pueden ser 1, 2, 3 o las que necesites. El resto queda como referencia.',
      defaultCollapsed: true,
      fields: [
        { key: 'principal_1', label: 'Apuesta #1 — área + por qué', type: 'textarea' },
        { key: 'principal_2', label: 'Apuesta #2 — área + por qué', type: 'textarea' },
        { key: 'costo_no_elegidas', label: '¿Qué dejás sin trabajar este año? ¿Estás OK con eso?', type: 'textarea', hint: 'Elegir es renunciar. Hacelo consciente.' },
      ],
    },

    // ━━━ REFLEXIVO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      key: 'eagle_patrones',
      laneKey: 'reflexivo',
      emoji: '🔁',
      title: 'Patrones que se repiten',
      intro: 'Antes de planear el año, miremos el patrón. Lo que se repite año a año tiene más peso que cualquier plan nuevo.',
      fields: [
        { key: 'patron_repite', label: '¿Qué patrón tuyo se repite año tras año y este año querés romper?', type: 'textarea' },
        { key: 'creencias_freno', label: '¿Qué creencias te frenan en las áreas que están bajas?', type: 'textarea', hint: 'Las frases que aparecen en tu cabeza cuando intentás moverte ahí.' },
        { key: 'postergacion', label: '¿Qué área venís postergando hace tiempo y por qué?', type: 'textarea' },
      ],
    },
    {
      key: 'eagle_energia',
      laneKey: 'reflexivo',
      emoji: '⚡',
      title: 'Energía — qué te drena, qué te recarga',
      intro: 'Cualquier meta requiere energía sostenida. Identificar los flujos te ahorra meses.',
      defaultCollapsed: true,
      fields: [
        { key: 'recarga', label: '¿Qué acciones / contextos te RECARGAN al 100%?', type: 'textarea' },
        { key: 'drena', label: '¿Qué acciones / contextos te DRENAN sin retorno?', type: 'textarea' },
        { key: 'recursos', label: '¿Qué recursos tenés a favor para el año?', type: 'textarea', hint: 'Skills, contactos, capital, energía, tiempo, conocimiento.' },
      ],
    },

    // ━━━ TÁCTICO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      key: 'eagle_borrador',
      laneKey: 'tactico',
      emoji: '📝',
      title: 'Borrador de metas por área',
      intro: 'Salida del examen. Escribí 1-2 metas tentativas por área (las que sentís después de los carriles anteriores). Esto es BORRADOR — después lo pulís en Anual con tranquilidad.',
      fields: [
        { key: 'borrador_fisica',           label: 'Borrador · Salud Física',              type: 'textarea' },
        { key: 'borrador_mental_emocional', label: 'Borrador · Salud Mental/Emocional',    type: 'textarea' },
        { key: 'borrador_espiritual',       label: 'Borrador · Conexión Espiritual',       type: 'textarea' },
        { key: 'borrador_relaciones',       label: 'Borrador · Relaciones',                type: 'textarea' },
        { key: 'borrador_profesional',      label: 'Borrador · Profesional / Carrera',     type: 'textarea' },
        { key: 'borrador_financiera',       label: 'Borrador · Salud Financiera',          type: 'textarea' },
        { key: 'borrador_legado',           label: 'Borrador · Propósito / Legado',        type: 'textarea' },
        { key: 'borrador_hobbies',          label: 'Borrador · Hobbies / Pasiones',        type: 'textarea' },
        { key: 'borrador_creatividad',      label: 'Borrador · Creatividad',               type: 'textarea' },
      ],
    },
    {
      key: 'eagle_sistema',
      laneKey: 'tactico',
      emoji: '⚙️',
      title: 'Sistema que sostiene las metas',
      intro: 'Las metas se cumplen con sistemas, no con voluntad. Definí ahora qué hábitos y qué obstáculos vienen con el paquete.',
      defaultCollapsed: true,
      fields: [
        { key: 'habitos_clave', label: 'Hábitos clave que sostienen estas metas', type: 'textarea', placeholder: 'Ej: gym 4x/sem, deep work 4hs/día, journal diario...' },
        { key: 'pieza_domino', label: 'La "pieza dominó" — una acción mínima de 21 días que destraba todo', type: 'textarea' },
        { key: 'obstaculos', label: 'Obstáculos previsibles + cómo navegarlos', type: 'textarea' },
      ],
    },
    {
      key: 'eagle_cierre',
      emoji: '🦅',
      title: 'Cierre · llevá esto a Anual',
      intro: 'Cuando sientas que el examen está listo, abrí la pestaña Anual y escribí tus metas finales mirando los borradores de arriba. No hay cascada automática — esto es para que la decisión final pase por vos.',
      defaultCollapsed: true,
      fields: [
        { key: 'aprendizajes', label: 'Aprendizajes principales del examen', type: 'textarea', hint: 'Lo que se te reveló mientras escribías arriba.' },
        { key: 'proximo_paso', label: 'Próximo paso concreto', type: 'text', hint: 'Ej: "Esta semana, pasar metas pulidas a Anual".' },
      ],
    },
  ],
}

/** Annual template — sets the tone for the year.
 *  Heavy reflection, identity-level, long-horizon.
 *  Filled once at year start, revisited mid-year for course correction.
 *
 *  v3 changes:
 *    - `wheel_of_life` section MOVED out to the new EAGLE_TEMPLATE
 *      (Vista de Águila). Anual now starts directly with identity → metas.
 *      The user does the diagnostic-and-discovery exam in Vista de Águila
 *      and then writes the polished metas here. */
export const ANNUAL_TEMPLATE: ProjectionTemplate = {
  level: 'year',
  version: 3,
  title: 'Visión Anual',
  intro: 'El año es el horizonte largo. Acá definís quién querés ser, qué pilares activar y qué grandes metas perseguir. Lo trimestral, mensual y semanal salen de acá. (Tip: si querés explorar antes de escribir las metas, abrí "Vista de Águila".)',
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
      intro: 'Una meta por área (las mismas de la rueda). Después marcá las que vas a trabajar activamente como PRINCIPALES — pueden ser 1, 2, 3 o las que necesites. Las demás son referencia, no se trabajan activamente.',
      fields: [
        { key: 'fisica',           label: 'Meta · Salud Física',              type: 'textarea', hint: 'Ej: "Correr media maratón sub-2hs", "5 entrenamientos/semana sostenidos".' },
        { key: 'mental_emocional', label: 'Meta · Salud Mental/Emocional',    type: 'textarea', hint: 'Ej: "Meditar 10min/día", "Journal diario", "Terapia mensual", "Terminar 12 libros".' },
        { key: 'espiritual',       label: 'Meta · Conexión Espiritual',       type: 'textarea', hint: 'Ej: "Retiro silencioso 1x/año", "Práctica de gratitud".' },
        { key: 'relaciones',       label: 'Meta · Relaciones Personales',     type: 'textarea', hint: 'Ej: "Cena familiar semanal", "Llamar a un amigo viejo cada mes".' },
        { key: 'profesional',      label: 'Meta · Profesional / Carrera',     type: 'textarea', hint: 'Ej: "USD 10k MRR", "Cuenta fondeada de USD 100k".' },
        { key: 'financiera',       label: 'Meta · Salud Financiera',          type: 'textarea', hint: 'Ej: "USD 50k ahorrado", "30% de ingresos invertido cada mes".' },
        { key: 'legado',           label: 'Meta · Propósito / Legado',        type: 'textarea', hint: 'Ej: "Lanzar curso público", "Mentoría a 10 personas".' },
        { key: 'hobbies',          label: 'Meta · Hobbies / Pasiones',        type: 'textarea', hint: 'Ej: "Tocar 3 canciones nuevas en guitarra", "B1 de italiano", "Volver a pintar 1x/semana".' },
        { key: 'creatividad',      label: 'Meta · Creatividad',               type: 'textarea', hint: 'Ej: "Escribir 1 ensayo por mes", "Lanzar mini-álbum de 4 canciones", "Diseñar y publicar 12 piezas".' },
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
  version: 4,
  title: 'Plan Trimestral',
  intro: 'Tus áreas principales del año bajan acá automáticamente (arriba). Acá solo definís la alineación estratégica y, si ya cerraste un Q antes, sus aprendizajes.',
  sections: [
    // Cascade FROM annual principales — special block, no fields (renders
    // dynamically based on the parent annual plan).
    {
      key: 'principal_cascade',
      emoji: '🎯',
      title: 'Tus áreas principales · desglose trimestral',
      intro: 'De las áreas que marcaste como principales en el plan anual, cada una se baja a 3 sub-metas para este trimestre. Podés escribirlas a mano o usar la IA para que las proponga.',
    },
    {
      key: 'alineacion',
      emoji: '🧭',
      title: 'Notas estratégicas',
      defaultCollapsed: true,
      fields: [
        { key: 'una_batalla', label: 'La UNA batalla principal del trimestre', type: 'textarea', hint: '¿Cuál es el frente donde más vas a empujar?' },
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
  version: 3,
  title: 'Plan Mensual',
  intro: 'El mes es la bisagra entre el trimestre y la semana. Cada sub-meta del trimestre se baja a 3 sub-metas mensuales para esas áreas principales.',
  sections: [
    // Cascade FROM quarter sub-goals
    {
      key: 'principal_cascade',
      emoji: '🎯',
      title: 'Tus áreas principales · desglose mensual',
      intro: 'Las sub-metas trimestrales de cada área se desglosan ahora en 3 sub-metas para este mes. Lo más concreto posible — para que la semana ya tenga tareas claras.',
    },
    {
      key: 'alineacion_m',
      emoji: '🧭',
      title: 'Otras notas del mes',
      defaultCollapsed: true,
      fields: [
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

export const ALL_TEMPLATES: Record<'eagle' | 'year' | 'quarter' | 'month', ProjectionTemplate> = {
  eagle: EAGLE_TEMPLATE,
  year: ANNUAL_TEMPLATE,
  quarter: QUARTER_TEMPLATE,
  month: MONTH_TEMPLATE,
}

/** Wheel-of-Life areas — exported so the radar chart can pull labels/keys
 *  from a single source of truth. Must match the field keys in the
 *  `wheel_of_life` section above. */
export const WHEEL_AREAS: { key: string; label: string }[] = [
  { key: 'fisica',            label: 'Física' },
  // v2: 'mental' + 'emocional' fused into a single area. The two
  // overlapped in practice — autoregulación, claridad y descanso
  // cognitivo viven en el mismo eje. Old data is migrated on rehydrate
  // by projectionStore (see `onRehydrateStorage`).
  { key: 'mental_emocional',  label: 'Mental/Emocional' },
  { key: 'espiritual',        label: 'Espiritual' },
  { key: 'relaciones',        label: 'Relaciones' },
  { key: 'profesional',       label: 'Profesional' },
  { key: 'financiera',        label: 'Financiera' },
  { key: 'legado',            label: 'Legado' },
  // v2: nueva área para hobbies / pasiones / aprendizaje recreativo
  // (instrumentos, idiomas, deportes recreativos, pintura, lectura,
  // etc). Existing plans no tendrán este campo → se ve vacío hasta que
  // el usuario lo complete.
  { key: 'hobbies',           label: 'Hobbies' },
  // v3: creatividad como eje propio — expresión, hacer cosas nuevas,
  // estética, narrativa. Diferente de hobbies (que es "qué te enciende")
  // y de profesional (que es ejecución). Acá vive el output creativo
  // (escribir, componer, diseñar, construir, contar historias).
  { key: 'creatividad',       label: 'Creatividad' },
]
