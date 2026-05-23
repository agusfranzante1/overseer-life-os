import type { SPITemplate } from './types'

/** The default SPI template — based on the user's Notion "Semana X" but
 *  with two structural corrections requested in May 2026:
 *
 *  1. The Bitácora de Calibración is NO LONGER a template section. It
 *     became a cross-session persistent database (see BitacoraEntry +
 *     spiStore.bitacoraEntries). The UI renders it as a dedicated block
 *     above the AAA section, hardcoded — not template-driven.
 *
 *  2. The two AAA sections ("Visión" and "Táctico") got merged into a
 *     single "Protocolo de Control [AAA]" section. The Visión version
 *     was the latest; the Táctico version was an older iteration. The
 *     unique value from Táctico (Conclusión Semanal + Poner en Acción)
 *     was preserved as the final two subsections of the merged AAA.
 *
 *  Version bumped to 2 → triggers auto-migration in spiStore for any
 *  user holding the v1 template.
 */
export const DEFAULT_SPI_TEMPLATE: SPITemplate = {
  version: 2,

  mainChecklist: [
    { key: 'aaa', label: 'Ejecutar Protocolo de Control [AAA]' },
    { key: 'proyeccion', label: 'Revisar Proyección' },
    { key: 'calendar', label: 'Organizar Bloques Semanal en Google Calendar' },
    { key: 'cerrar', label: 'Cerrar el SPI y fijar puntuación' },
  ],

  sections: [
    // ─────────────────────────────────────────────────────────────────
    // 📇 PROTOCOLO DE CONTROL [AAA] — MERGED (visión + táctico)
    // ─────────────────────────────────────────────────────────────────
    {
      key: 'aaa',
      emoji: '📇',
      title: 'Protocolo de Control [AAA]',
      intro: 'Apunta a las estrellas, y llegarás al cielo.',
      defaultCollapsed: false,
      subsections: [
        {
          key: 'intencion',
          emoji: '♥️',
          title: 'Cómo quiero sentirme esta semana?',
          intro: 'Intencionar la semana para vivir desde nuestro mayor ser — el que detrás de su gran meta tiene otra gran meta: estar presente y disfrutar de todo lo que hace porque lo ELIGE.',
          fields: [
            {
              key: 'intencion',
              label: 'Intención para la semana',
              type: 'textarea',
              placeholder: 'Divertirse, mejorar, cumplir la meta, apegarme al sistema...',
              hint: 'Una sola idea-fuerza que ordena la semana entera.',
            },
          ],
        },
        {
          key: 'profundidad',
          emoji: '🌑',
          title: 'Necesito Profundidad? Acá la tenés',
          intro: 'Sólo abrir cuando sentís que la semana requiere reflexión extra. No es obligatorio cada sábado.',
          defaultCollapsed: true,
          subsections: [
            {
              key: 'que_buscamos',
              emoji: '🔍',
              title: 'Qué buscamos?',
              intro: 'Izamos las velas del barco. Repensamos a dónde queremos llegar para luego determinar los recursos que tenemos.',
              fields: [
                { key: 'meta_pro_q', label: 'Meta Profesional · trimestre', type: 'text' },
                { key: 'meta_pro_mes', label: 'Meta Profesional · mes', type: 'text' },
                { key: 'meta_pro_sem', label: 'Meta Profesional · semana', type: 'text' },
                { key: 'meta_per_q', label: 'Meta Personal · trimestre', type: 'text' },
                { key: 'meta_per_mes', label: 'Meta Personal · mes', type: 'text' },
                { key: 'meta_per_sem', label: 'Meta Personal · semana', type: 'text' },
              ],
            },
            {
              key: 'donde_estamos',
              emoji: '📍',
              title: 'Dónde estamos?',
              intro: 'Comprender dónde poner la energía. Cuál es el 20% que hace girar el 80% del reloj. + análisis de proyectos a vista de águila (generales, anuales, trimestrales, metas, objetivos y tareas).',
              fields: [
                {
                  key: 'foco_90dias',
                  label: 'En qué te enfocarías si quisieras ÉXITO ASEGURADO en los próximos 90 días',
                  type: 'textarea',
                  hint: 'Qué hábito, pilar o dominio sería. Qué tendrías en claro desde YA.',
                },
                {
                  key: 'persona_lograda',
                  label: 'Cómo se comporta la persona que ya consiguió eso?',
                  type: 'textarea',
                  hint: 'Cómo actúa, piensa, se mueve, qué energía emana. Debemos convertirnos en ello.',
                },
                {
                  key: 'analisis_proyectos',
                  label: 'Análisis de proyectos · estado actual y recursos',
                  type: 'textarea',
                  hint: 'Vista de águila a todos tus proyectos: distancia al objetivo, recursos disponibles, qué necesitás.',
                  epigraph: 'Sé impecable con tus palabras — con la forma en que te hablás y en cómo pensás. Honrá lo que te propusiste ser.',
                },
              ],
            },
            {
              key: 'detalles',
              emoji: '🧠',
              title: 'Qué detalles no estoy viendo?',
              intro: 'Sabiendo hacia dónde nos dirigimos, analizamos catalizadores de la rutina, drenajes de energía, pumps, momentum.',
              fields: [
                {
                  key: 'habito_clave',
                  label: 'Qué acción, convertida en HÁBITO en el calendario, generaría el resultado deseado?',
                  type: 'textarea',
                },
                {
                  key: 'energia_up',
                  label: 'Qué acción sostenida CAMBIA o SOSTIENE mi energía al 100%?',
                  type: 'textarea',
                },
                {
                  key: 'energia_down',
                  label: 'Qué acción/acciones DRENAN mi energía?',
                  type: 'textarea',
                },
                {
                  key: 'impacto_insights',
                  label: 'Cómo impacta cada insight en la forma en que cumplo mis hábitos?',
                  type: 'textarea',
                  hint: 'Te ayuda, te obstaculiza?',
                },
                {
                  key: 'compromiso_pendiente',
                  label: 'Qué compromiso conmigo u otra persona no estoy tomando por FALTA DE CORAJE?',
                  type: 'textarea',
                  hint: 'Dónde necesitás un ajuste de FUEGO?',
                },
                {
                  key: 'dejare_de_hacer',
                  label: '3 cosas que dejaré de hacer',
                  type: 'textarea',
                  placeholder: '1.\n2.\n3.',
                },
                {
                  key: 'empezare_a_hacer',
                  label: '3 cosas que empezaré a hacer',
                  type: 'textarea',
                  placeholder: '1.\n2.\n3.',
                  epigraph: 'No te tomes nada a personal — aplica mucho a los pensamientos.',
                },
              ],
            },
          ],
        },
        {
          key: 'como_ejecutar',
          emoji: '🧩',
          title: 'Cómo lo ejecutaremos?',
          intro: 'Sabiendo dónde estamos, qué tenemos y qué necesitamos ejecutar — definir CÓMO vamos a ejecutar. Reflexionar para pasar del pixel a la realidad.',
          fields: [
            {
              key: 'productividad',
              label: 'Qué cosas necesito aplicar para aumentar mi productividad y ejecutar las tareas 80/20?',
              type: 'textarea',
              hint: 'Cosas que necesitan estar fijas. Qué cosas no son tan importantes como pensaba. Para qué estoy haciendo cada tarea?',
            },
            {
              key: 'accion_concreta',
              label: 'Acción concreta que sale de la reflexión anterior',
              type: 'textarea',
              hint: 'Del pixel a la realidad — qué vas a hacer puntualmente.',
              epigraph: 'NO HAGAS SUPOSICIONES — me abro con curiosidad...',
            },
          ],
        },
        {
          key: 'quien_cuando',
          emoji: '⚒️',
          title: 'Quién lo hará y en qué tiempo?',
          intro: 'Ubicar las acciones en línea temporal. Estructurar las tareas. Hábitos / Block Times → Google Calendar. Tareas → SPI (abajo).',
          fields: [
            {
              key: 'bloques',
              label: 'Bloques / hábitos que van al calendario',
              type: 'textarea',
              placeholder: 'Ej: Lunes 8-9 ritual de anclaje, Lunes 9-13 deep work...',
            },
            {
              key: 'cronograma',
              label: 'Cronograma de las tareas más importantes',
              type: 'textarea',
              hint: 'Cuándo, en qué día, en qué bloque vas a ejecutar cada tarea clave.',
            },
          ],
        },
        {
          key: 'sitting',
          emoji: '👁️',
          title: 'Sitting & Thinking',
          intro: 'Observate como un águila, volá alto, contemplá tus posibilidades. Evaluá si estás dirigiendo tu energía hacia lo importante.',
          fields: [
            { key: 'como_siento', label: 'Cómo siento que estoy?', type: 'textarea' },
            { key: 'como_se_ve_10', label: 'Cómo se vería un 10?', type: 'textarea' },
            { key: 'camino_correcto', label: 'Estoy caminando por el camino correcto? Mis acciones estuvieron alineadas con mis metas?', type: 'textarea' },
            { key: 'decisiones_recientes', label: 'Qué decisiones he tomado recientemente?', type: 'textarea' },
            { key: 'efectividad', label: 'Fueron efectivas mis decisiones? Cómo las tomé? Cómo reaccioné a ellas?', type: 'textarea' },
            { key: 'area_ajuste', label: 'Qué área de mi vida necesita un ajuste?', type: 'textarea' },
          ],
        },
        {
          key: 'autoconcepto',
          emoji: '🎖️',
          title: 'Auto Concepto — "Como es dentro, es fuera"',
          intro: 'El éxito va más allá de lo financiero. Hay otras áreas donde se refleja primero — un cambio interior que se ve afuera inevitablemente.',
          defaultCollapsed: true,
          fields: [
            { key: 'serenidad', label: 'Serenidad — estoy en paz ante las circunstancias?', type: 'textarea' },
            { key: 'habitos', label: 'Hábitos — estoy accionando 1% cada día?', type: 'textarea' },
            { key: 'entrega', label: 'Entrega — entrego de mí a quien lo requiere?', type: 'textarea' },
            { key: 'alimentacion', label: 'Alimentación — le doy a mi cuerpo el combustible correcto?', type: 'textarea' },
            { key: 'salud', label: 'Salud / Entrenamiento — entrenando a consciencia?', type: 'textarea' },
            { key: 'pensamientos', label: 'Pensamientos — soy el observador, no mis pensamientos?', type: 'textarea' },
            { key: 'relaciones', label: 'Relaciones — comunicación más certera, límites más claros?', type: 'textarea' },
            { key: 'profesion', label: 'Profesión — alineada, pero sin apego?', type: 'textarea' },
            { key: 'espiritualidad', label: 'Espiritualidad — me conecto día a día con mi energía?', type: 'textarea' },
            { key: 'felicitar_domingo', label: 'Por qué te vas a felicitar el DOMINGO?', type: 'text' },
            { key: 'felicitar_lunes', label: 'Por qué te vas a felicitar el LUNES?', type: 'text' },
            { key: 'felicitar_martes', label: 'Por qué te vas a felicitar el MARTES?', type: 'text' },
            { key: 'felicitar_miercoles', label: 'Por qué te vas a felicitar el MIÉRCOLES?', type: 'text' },
            { key: 'felicitar_jueves', label: 'Por qué te vas a felicitar el JUEVES?', type: 'text' },
            { key: 'felicitar_viernes', label: 'Por qué te vas a felicitar el VIERNES?', type: 'text' },
            { key: 'felicitar_sabado', label: 'Por qué te vas a felicitar el SÁBADO?', type: 'text' },
          ],
        },
        // ── From old "Táctico" — preserved unique content ──────────────
        {
          key: 'conclusion_semanal',
          emoji: '🏁',
          title: 'Conclusión semanal',
          intro: 'Resumen del rendimiento de la semana, aprendizajes principales, errores identificados y pronóstico de los próximos 7 días.',
          fields: [
            { key: 'aprendizajes', label: 'Aprendizajes principales', type: 'textarea' },
            { key: 'errores', label: 'Errores identificados', type: 'textarea' },
            { key: 'pronostico', label: 'Pronóstico próximos 7 días', type: 'textarea' },
          ],
        },
        {
          key: 'poner_en_accion',
          emoji: '🚀',
          title: 'Poner en acción la conclusión',
          intro: 'Concretar la conclusión semanal en pasos accionables — qué vas a hacer puntualmente la próxima semana en base a lo que aprendiste.',
          fields: [
            { key: 'acciones_conclusion', label: 'Acciones concretas', type: 'textarea' },
          ],
        },
      ],
    },
  ],
}
