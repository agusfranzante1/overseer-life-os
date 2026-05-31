import type { LabCategory, LabExercise } from './types'

/** ─── CATEGORÍAS ──────────────────────────────────────────────────────────
 *  Cada categoría es un "pabellón" del laboratorio. Pensadas para que el
 *  usuario sepa rápido dónde meterse según lo que está sintiendo HOY.
 */
export const LAB_CATEGORIES: LabCategory[] = [
  {
    key: 'creencias',
    emoji: '🧠',
    title: 'Creencias',
    color: '#a855f7',  // purple
    tagline: 'Encontrar, cuestionar y reencuadrar las creencias que te frenan.',
    intro: 'Cuando encontrás una creencia, YA ES. Te convertís en observador. Trascender no es luchar contra ella — es verla y dejar de comprarla. Si la escucho y la veo, es porque no LO SOY. Cuando la veo, dejo de ser eso. Soy el observador.',
  },
  {
    key: 'emociones',
    emoji: '💗',
    title: 'Gestión Emocional',
    color: '#f97316',  // orange
    tagline: 'Identificar, regular y eliminar emociones que dominan la acción.',
    intro: 'Tus pensamientos producen emociones, y desde tus emociones decidís. Regular no es reprimir — es sentir conscientemente y elegir desde otro lugar.',
  },
  {
    key: 'pensamientos',
    emoji: '💭',
    title: 'Pensamientos',
    color: '#3b82f6',  // blue
    tagline: 'Refinar un pensamiento concreto y observarlo desde afuera.',
    intro: 'Si elegís una frase muy larga, no funciona. Tenés que seleccionar UN PENSAMIENTO y trabajarlo. Los pensamientos son la cuerda de la creencia.',
  },
  {
    key: 'identidad',
    emoji: '🪞',
    title: 'Identidad · "YO SOY"',
    color: '#10b981',  // emerald
    tagline: 'Quién creo que soy. Construir el autoconcepto que sostiene la acción.',
    intro: 'Actuás por cómo te ves, no por tu checklist. Validar la identidad con preguntas tipo "¿por qué es fácil para mí…?" es más potente que afirmaciones positivas vacías.',
  },
  {
    key: 'problemas',
    emoji: '🧩',
    title: 'Resolución de Problemas',
    color: '#6366f1',  // indigo
    tagline: 'Cuando un objetivo se siente difícil, lo bajamos por capas.',
    intro: 'Primera capa: ver la realidad sin filtro. Segunda capa: cambiar el diálogo interno. Tercera capa: diseñar el plan desde compasión radical.',
  },
  {
    key: 'inercia',
    emoji: '🪨',
    title: 'Resolución de Inercia',
    color: '#facc15',  // yellow
    tagline: 'Estoy estancado. Qué me traba y cuál es la pieza dominó de 21 días.',
    intro: 'La inercia se rompe con una acción mínima sostenida — la pieza dominó. Identificar lo que se repite y elegir la acción más pequeña que destraba todo el resto.',
  },
]

/** Helper — devuelve la categoría por key (o undefined). */
export function findCategory(key: string): LabCategory | undefined {
  return LAB_CATEGORIES.find((c) => c.key === key)
}

// ─── EJERCICIOS ──────────────────────────────────────────────────────────
// Cada ejercicio tiene fields y/o steps. Los `steps` se renderizan como
// secciones colapsables (estilo "capa 1, capa 2..."). Los `fields` globales
// quedan arriba sin agrupación.
// ─────────────────────────────────────────────────────────────────────────

const CREENCIAS_EXERCISES: LabExercise[] = [
  {
    key: 'diagnostico-creencias',
    categoryKey: 'creencias',
    emoji: '🔍',
    title: 'Diagnóstico de Creencias',
    shortDescription: 'Preguntas guiadas por área (dinero, vos, relaciones, trabajo…) para detectar qué creencias estás cargando.',
    titleField: { stepKey: 'captura', fieldKey: 'detectadas' },
    intro: 'Antes de reencuadrar, hay que VER. Este diagnóstico te lleva por las 7 áreas más cargadas de creencias inconscientes. No filtres — escribí lo PRIMERO que aparezca, aunque te avergüence. Al final, llevá las que detectaste a "Tus Creencias" arriba para trabajarlas con Reencuadre.',
    steps: [
      {
        key: 'dinero',
        emoji: '💰',
        title: 'Dinero',
        intro: 'Quizás el área donde más creencias inconscientes operan. Mucho viene de la infancia.',
        fields: [
          { key: 'es', label: 'Completá la frase: "El dinero es..."', type: 'textarea', hint: 'Lo primero que aparezca, sin filtrar.' },
          { key: 'familia', label: '¿Qué frases sobre dinero escuchabas de chico en tu casa?', type: 'textarea' },
          { key: 'ricos', label: '¿Qué creés que pasa con la gente que gana MUCHO dinero?', type: 'textarea', hint: '"Son corruptos", "perdieron el alma", "trabajan demasiado"... la respuesta visceral.' },
          { key: 'mio', label: '¿Qué te decís cuando ves a alguien con mucho dinero?', type: 'textarea' },
          { key: 'merezco', label: '¿Cuánto sentís que MERECÉS ganar al mes? ¿Por qué ese número?', type: 'textarea' },
        ],
      },
      {
        key: 'yo',
        emoji: '🪞',
        title: 'Yo mismo',
        intro: 'Lo que creés sobre vos define el techo de todo lo demás.',
        fields: [
          { key: 'soy', label: 'Completá: "Soy una persona que..."', type: 'textarea', hint: 'Sin maquillaje. Lo que realmente creés.' },
          { key: 'no_soy', label: 'Completá: "No soy capaz de..."', type: 'textarea' },
          { key: 'mereco', label: '¿Qué cosas creés que NO MERECÉS tener / ser / hacer?', type: 'textarea' },
          { key: 'me_dicen', label: 'Frases que te dijeron de chico que todavía te resuenan', type: 'textarea' },
        ],
      },
      {
        key: 'trabajo',
        emoji: '🚀',
        title: 'Trabajo / Profesión / Éxito',
        fields: [
          { key: 'exito_es', label: 'Completá: "El éxito es..."', type: 'textarea' },
          { key: 'cuesta', label: '¿Qué creés que CUESTA tener éxito? (tiempo, sacrificio, suerte…)', type: 'textarea' },
          { key: 'trabajo_duro', label: '¿Es verdad que para hacer dinero hay que trabajar muy duro? ¿Por qué?', type: 'textarea' },
          { key: 'destacar', label: '¿Qué pasa si te destacás demasiado de los demás?', type: 'textarea', hint: '"Me envidian", "se alejan", "me odian"...' },
        ],
      },
      {
        key: 'relaciones',
        emoji: '💗',
        title: 'Relaciones / Amor',
        fields: [
          { key: 'amor_es', label: 'Completá: "El amor es..."', type: 'textarea' },
          { key: 'merezco_amor', label: '¿Qué creés que merecés en una relación?', type: 'textarea' },
          { key: 'confianza', label: '¿Es fácil confiar en otros? ¿Por qué sí / por qué no?', type: 'textarea' },
          { key: 'pierdo', label: '¿Qué pasa si me entrego completamente a alguien?', type: 'textarea' },
        ],
      },
      {
        key: 'cuerpo',
        emoji: '🏋️',
        title: 'Cuerpo / Salud',
        fields: [
          { key: 'cuerpo_es', label: 'Completá: "Mi cuerpo es..."', type: 'textarea' },
          { key: 'merezco_salud', label: '¿Sentís que tu cuerpo te responde cuando lo cuidás?', type: 'textarea' },
          { key: 'dificil', label: '¿Qué creés que es DIFÍCIL de cambiar en tu cuerpo?', type: 'textarea' },
        ],
      },
      {
        key: 'tiempo',
        emoji: '⏳',
        title: 'Tiempo / Procesos',
        intro: 'Las creencias sobre el tiempo explican por qué nos apuramos, postergamos, o nos rendimos antes.',
        fields: [
          { key: 'tarde', label: '¿Sentís que es tarde para algo? ¿Para qué? ¿Por qué?', type: 'textarea' },
          { key: 'rapido', label: '¿Cuánto tiempo "debería" tomar lograr X? ¿De dónde sale ese número?', type: 'textarea' },
          { key: 'paciencia', label: '¿Es fácil ser paciente con un proceso largo? ¿Por qué sí / no?', type: 'textarea' },
        ],
      },
      {
        key: 'proposito',
        emoji: '🌟',
        title: 'Propósito / Espiritualidad',
        defaultCollapsed: true,
        fields: [
          { key: 'guiado', label: '¿Creés que algo te guía / sostiene? ¿Qué?', type: 'textarea' },
          { key: 'aporte', label: '¿Sentís que tenés algo único para aportar al mundo? ¿Qué?', type: 'textarea' },
          { key: 'pierdo_si', label: '¿Qué creés que perdés / arriesgás si vas detrás de tu propósito?', type: 'textarea' },
        ],
      },
      {
        key: 'captura',
        emoji: '📥',
        title: 'Captura · llevá las creencias a tu lista',
        intro: 'Releé lo que escribiste. Las creencias más fuertes son las que más TE PESAN al leerlas. Anotalas acá en frases cortas — después agregalas una por una a "Tus Creencias" arriba para trabajarlas con Reencuadre.',
        fields: [
          { key: 'detectadas', label: 'Creencias detectadas (una por línea, frase corta)', type: 'textarea', placeholder: '- El dinero es difícil de obtener\n- No merezco lo mejor\n- Es tarde para mí\n- ...', hint: 'Tip: el formato más útil es "Yo + verbo + creencia". Ej: "Yo creo que el dinero es difícil".' },
          { key: 'mas_fuerte', label: '¿Cuál te pega MÁS al leerla en voz alta?', type: 'textarea', hint: 'Esa es la que vale la pena trabajar primero.' },
        ],
      },
    ],
    outro: 'Ahora subí a "Tus Creencias" y agregalas una por una. Después en cada una tocá "Trabajar con Reencuadre" — te abre el ejercicio con la creencia pre-cargada.',
  },

  {
    key: 'reencuadre-complejo',
    categoryKey: 'creencias',
    emoji: '🔧',
    title: 'Reencuadre Cognitivo',
    shortDescription: 'Trabajar una creencia. Reconocer primero, cuestionar y transformar después.',
    titleField: { fieldKey: 'pensamiento_inicial' },
    intro: 'Funciona tanto para creencias claramente falsas como para creencias que parcialmente son verdad. NO PUEDO TRANSFORMAR ALGO QUE NO RECONOZCO. A veces necesitamos admitir que SÍ pensamos algo antes de poder reencuadrarlo.',
    fields: [
      { key: 'pensamiento_inicial', label: 'El pensamiento como aparece en tu cabeza', type: 'textarea', hint: 'Literal. Ej: "Cuando no se dan los resultados, dudo de mi capacidad".' },
    ],
    steps: [
      {
        key: 'refinar',
        emoji: '🔧',
        title: 'Paso 1 · Refinar el pensamiento real',
        intro: 'El problema no son los resultados — es cómo me siento respecto a ellos. Separar el HECHO de la INTERPRETACIÓN. Necesitamos claridad del pensamiento que realmente nos duele.',
        fields: [
          { key: 'hecho', label: '¿Cuál es el HECHO objetivo?', type: 'textarea', hint: 'Sin interpretación. Solo lo que pasó.' },
          { key: 'interpretacion', label: '¿Cuál es tu INTERPRETACIÓN del hecho?', type: 'textarea', hint: 'La historia que te contás encima del hecho.' },
          { key: 'pensamiento_refinado', label: 'El pensamiento REFINADO (lo que realmente duele)', type: 'textarea' },
        ],
      },
      {
        key: 'cuestionar_complejo',
        emoji: '❓',
        title: 'Paso 2 · Cuestionar el pensamiento refinado',
        fields: [
          { key: 'es_verdad', label: '¿Es verdad este pensamiento refinado?', type: 'textarea' },
          { key: 'certeza', label: '¿Tenés absoluta certeza? ¿Hoy sí, mañana también?', type: 'textarea', hint: 'A veces la respuesta honesta es "HOY NO".' },
          { key: 'como_te_sentis', label: 'Cuando creés este pensamiento, ¿cómo te sentís?', type: 'textarea' },
        ],
      },
      {
        key: 'reconocer',
        emoji: '🪧',
        title: 'Paso 3 · Reconocer (la inversión honesta)',
        intro: 'A veces nos acostumbramos a ir directo a la afirmación positiva, pero no podés reencuadrar sin antes RECONOCER que sí pensás eso. Reconocelo. Vivilo. Dejá de pelear con ello.',
        fields: [
          { key: 'admito', label: 'Admito que pienso esto: "..."', type: 'textarea', hint: 'Sin maquillaje. Si me digo desde el positivismo "soy capaz" pero mi inconsciente cree lo contrario, mi sistema entra en cortocircuito.' },
          { key: 'como_me_siento_al_admitir', label: '¿Cómo me siento al RECONOCER que pienso eso?', type: 'textarea', hint: 'Muchas veces, más libre. La carga se libera al ser nombrada.' },
        ],
      },
      {
        key: 'eleccion',
        emoji: '🧭',
        title: 'Paso 4 · La elección consciente',
        intro: 'Diferencia entre REENCUADRAR y NO ACTUAR EN BASE A LOS PENSAMIENTOS. Reconocerlos, ver si es verdad, y SEGUIR mi paso a paso igualmente. Soy ser humano, siento, no me peleo con la sensación.',
        fields: [
          { key: 'quien_serias', label: '¿Quién serías si por un momento ese pensamiento desapareciera?', type: 'textarea' },
          { key: 'que_elijo', label: 'Puedo sentir la duda. ¿QUÉ ELIJO igualmente?', type: 'textarea', hint: 'Aún cuando dudo, elijo seguir mi paso a paso al 100%. Elijo presentarme.' },
          { key: 'compromiso', label: 'Mi compromiso desde la conciencia (no desde la duda)', type: 'textarea' },
        ],
      },
    ],
    outro: 'Me permito atravesar esa sensación con naturaleza humana. Reconozco, no actúo desde la duda. Elijo seguir mi paso a paso.',
  },
]

const EMOCIONES_EXERCISES: LabExercise[] = [
  {
    key: 'regulacion-tipi',
    categoryKey: 'emociones',
    emoji: '🌊',
    title: 'Regulación de una Emoción · TIPI',
    shortDescription: 'Una emoción difícil. Sentirla en el cuerpo y dejarla atravesar hasta que se regule.',
    titleField: { fieldKey: 'emocion' },
    intro: 'TIPI: identificás la emoción, la sentís en el cuerpo, NO te identificás con la historia, dejás que la sensación se exprese hasta que se transforma sola. No es reprimir — es atravesar.',
    fields: [
      { key: 'emocion', label: 'Nombre de la emoción', type: 'text', placeholder: 'Ansiedad, miedo, frustración, rabia, culpa, tristeza...' },
      { key: 'disparador', label: '¿Qué la disparó?', type: 'textarea', hint: 'El hecho concreto, no la interpretación.' },
    ],
    steps: [
      {
        key: 'cuerpo',
        emoji: '🫀',
        title: 'Sentir en el cuerpo',
        fields: [
          { key: 'donde', label: '¿Dónde la sentís en el cuerpo? (pecho, garganta, estómago, hombros...)', type: 'textarea' },
          { key: 'forma', label: '¿Qué forma / textura tiene? (peso, calor, presión, vacío...)', type: 'textarea', hint: 'No es metáfora — es percepción directa. Cerrá los ojos si ayuda.' },
          { key: 'intensidad_inicial', label: 'Intensidad inicial (0-10)', type: 'text' },
        ],
      },
      {
        key: 'atravesar',
        emoji: '🌀',
        title: 'Dejarla atravesar',
        intro: 'Quedate con la sensación corporal sin agregarle historia. No "por qué siento esto" — solo "esto se siente así". Esperá. La sensación va a cambiar sola.',
        fields: [
          { key: 'cambios', label: '¿Qué cambios notás en la sensación a medida que la observás?', type: 'textarea', hint: 'Se mueve, baja, sube, se transforma, se va.' },
          { key: 'intensidad_final', label: 'Intensidad al final (0-10)', type: 'text' },
        ],
      },
      {
        key: 'cierre_tipi',
        emoji: '🌅',
        title: 'Cierre · ¿qué se reveló?',
        fields: [
          { key: 'aprendizaje', label: '¿Qué información traía esta emoción?', type: 'textarea', hint: 'Las emociones son mensajes — no enemigos. Qué te quería decir.' },
          { key: 'eleccion', label: '¿Desde dónde elegís actuar ahora?', type: 'textarea' },
        ],
      },
    ],
    outro: 'No es reprimir, no es analizar — es atravesar. Cuando la emoción se vive sin historia, se regula sola.',
  },

  {
    key: 'diario-emociones',
    categoryKey: 'emociones',
    emoji: '📔',
    title: 'Diario de Emociones a Regular',
    shortDescription: 'Tu lista corriendo de emociones por estado: a regular / regulada / eliminada.',
    intro: 'Para llevar el track de qué emociones venís trabajando. Cada vez que regulás una, anotala como "regulada" o "eliminada". Es tu mapa de progreso emocional.',
    fields: [
      { key: 'a_regular', label: '🟡 A REGULAR (en proceso)', type: 'textarea', placeholder: '- Incertidumbre · miedo a no lograr lo que quiero\n- Frustración cuando la realidad no avanza tan rápido como yo quisiera\n- Culpa por pensar que debería estar más avanzado' },
      { key: 'reguladas', label: '🟢 REGULADAS (ya las podés atravesar)', type: 'textarea', placeholder: '- Ansiedad cuando configuro mal el copiador\n- ...' },
      { key: 'eliminadas', label: '⭐ ELIMINADAS (ya no aparecen)', type: 'textarea', placeholder: '- Trade en DD me genere emociones\n- Quemar las cuentas tras perder en racha\n- Ver a otros con X resultados me da ansiedad\n- ...' },
    ],
    outro: 'Ver el progreso en lista te recuerda que ya lograste mucho. La regulación es músculo — se entrena.',
  },
]

const PENSAMIENTOS_EXERCISES: LabExercise[] = [
  {
    key: 'refinador',
    categoryKey: 'pensamientos',
    emoji: '🔬',
    title: 'Refinador de Pensamientos',
    shortDescription: 'Tomá una frase larga y destilala a UN pensamiento concreto, trabajable.',
    titleField: { fieldKey: 'frase_larga' },
    intro: 'Si elegís una frase muy larga de lo que está pasando, no funciona bien. Tenés que seleccionar UN PENSAMIENTO y trabajarlo. Vamos a refinar el pensamiento.',
    fields: [
      { key: 'frase_larga', label: 'La frase larga como aparece', type: 'textarea', placeholder: 'Ej: "No sé, siento que cuando no me salen las cosas como quiero me deprimo y empiezo a pensar que nunca voy a lograr nada y que en realidad no soy capaz..."' },
    ],
    steps: [
      {
        key: 'destilar',
        emoji: '⚗️',
        title: 'Destilar a UN pensamiento',
        fields: [
          { key: 'componentes', label: 'Listá los pensamientos que están MEZCLADOS en esa frase', type: 'textarea', hint: 'Uno por línea. Vas a ver que son varios disfrazados de uno.' },
          { key: 'el_pensamiento', label: 'Cuál es EL pensamiento que más duele / más se repite', type: 'textarea', hint: 'Uno solo. El que si lo cambiás, los demás caen.' },
        ],
      },
      {
        key: 'observar',
        emoji: '👁️',
        title: 'Observarlo desde afuera',
        intro: 'Cuando lo veo y lo escucho, dejo de ser eso. Soy el observador.',
        fields: [
          { key: 'voz', label: '¿De quién es la voz que dice este pensamiento? (tuya, de un familiar, de alguien del pasado...)', type: 'textarea' },
          { key: 'cuando_aparece', label: '¿En qué momentos / contextos suele aparecer?', type: 'textarea' },
          { key: 'que_protege', label: '¿De qué te está "protegiendo" pensar así?', type: 'textarea', hint: 'Todos los pensamientos repetidos tienen un beneficio secundario.' },
        ],
      },
    ],
    outro: 'Ahora tenés UN pensamiento clarito. Llevalo a "Reencuadre Simple" o "Complejo" si querés trabajarlo a fondo.',
  },
]

const IDENTIDAD_EXERCISES: LabExercise[] = [
  {
    key: 'yo-soy',
    categoryKey: 'identidad',
    emoji: '🌟',
    title: 'Yo Soy · Declaración de Identidad',
    shortDescription: 'Escribir quién querés ser, no como afirmación, sino como elección que sostiene la acción.',
    titleField: { fieldKey: 'soy_1' },
    intro: 'Con qué LENTES ELIJO VERME. Actúo por cómo me veo, no por mi checklist. Estas declaraciones son la versión tuya que estás eligiendo encarnar.',
    fields: [
      { key: 'soy_1', label: 'Yo soy...', type: 'textarea', placeholder: 'Soy rendición. Dejo que DIOS me guíe. Elijo soltar y confiar.' },
      { key: 'soy_2', label: 'Yo soy...', type: 'textarea', placeholder: 'Soy super abundante. Tengo desapego al dinero. Me sostengo de quien soy.' },
      { key: 'soy_3', label: 'Yo soy...', type: 'textarea', placeholder: 'Hacer dinero es tan simple como respirar.' },
      { key: 'soy_4', label: 'Yo soy...', type: 'textarea', placeholder: 'Soy fuerte, me alimento bien. Soy atleta.' },
      { key: 'soy_5', label: 'Yo soy...', type: 'textarea', placeholder: 'Soy amor. Entrego todo de mí a las personas.' },
      { key: 'soy_6', label: 'Yo soy...', type: 'textarea', placeholder: 'Soy capaz, soy único. Nadie dijo que era fácil — había que ejecutar BRUTALMENTE.' },
    ],
    outro: 'Releé esto cuando dudes. Estas son las lentes que ELEGISTE — no esperes a sentirlo para serlo. Sé desde ahora.',
  },

  {
    key: 'validador-identidad',
    categoryKey: 'identidad',
    emoji: '🔑',
    title: 'Validador de Identidad · "¿Por qué es fácil para mí…?"',
    shortDescription: 'En vez de afirmar, validar. Más potente que "soy X" es "por qué es fácil para mí X".',
    titleField: { fieldKey: 'identidad_objetivo' },
    intro: 'Hack: validá tus pensamientos. En vez de "soy millonario" decí "¿POR QUÉ es fácil para mí tener ideas que traen millones siempre?". El cerebro busca la respuesta y construye evidencia.',
    fields: [
      { key: 'identidad_objetivo', label: 'La identidad que estás construyendo', type: 'text', placeholder: 'Ej: trader rentable, persona ordenada, comunicador claro...' },
      { key: 'pregunta_1', label: '¿Por qué es fácil para mí...?', type: 'textarea', placeholder: '¿Por qué es fácil para mí seguir mi plan al pie de la letra?' },
      { key: 'pregunta_2', label: '¿Por qué es fácil para mí...?', type: 'textarea', placeholder: '¿Por qué es fácil para mí levantarme temprano cada día?' },
      { key: 'pregunta_3', label: '¿Por qué es fácil para mí...?', type: 'textarea' },
      { key: 'pregunta_4', label: '¿Por qué es fácil para mí...?', type: 'textarea' },
      { key: 'pregunta_5', label: '¿Por qué es fácil para mí...?', type: 'textarea' },
    ],
    outro: 'Releélas en voz alta. SER para tener — no esperes a tener para ser.',
  },

  {
    key: 'autoconcepto',
    categoryKey: 'identidad',
    emoji: '🎖️',
    title: 'Autoconcepto · Quién creo que soy',
    shortDescription: 'Reflexión profunda sobre tu autoconcepto en cada área de la vida.',
    intro: 'El éxito va más allá de lo financiero. Hay otras áreas donde se refleja primero — un cambio interior que se ve afuera inevitablemente. "Como es dentro, es fuera."',
    fields: [
      { key: 'serenidad', label: 'Serenidad — ¿estoy en paz ante las circunstancias?', type: 'textarea' },
      { key: 'habitos', label: 'Hábitos — ¿estoy accionando 1% cada día?', type: 'textarea' },
      { key: 'entrega', label: 'Entrega — ¿entrego de mí a quien lo requiere?', type: 'textarea' },
      { key: 'alimentacion', label: 'Alimentación — ¿le doy a mi cuerpo el combustible correcto?', type: 'textarea' },
      { key: 'salud', label: 'Salud / Entrenamiento — ¿entrenando a conciencia?', type: 'textarea' },
      { key: 'pensamientos', label: 'Pensamientos — ¿soy el observador, no mis pensamientos?', type: 'textarea' },
      { key: 'relaciones', label: 'Relaciones — ¿comunicación más certera, límites más claros?', type: 'textarea' },
      { key: 'profesion', label: 'Profesión — ¿alineada, pero sin apego?', type: 'textarea' },
      { key: 'espiritualidad', label: 'Espiritualidad — ¿me conecto día a día con mi energía?', type: 'textarea' },
    ],
    outro: 'Con qué LENTES ELIJO VERME. Volvé acá cuando sientas que perdiste el centro.',
  },

  {
    key: 'valor-propio',
    categoryKey: 'identidad',
    emoji: '💎',
    title: 'Valor Propio · más allá de los resultados',
    shortDescription: 'Si tu valor depende de lo que producís, vas a colapsar cuando los resultados no estén.',
    titleField: { fieldKey: 'condicional' },
    intro: 'Valés por ser, por ser vos, por haber nacido vos y ser diferente al resto. NADIE me va a ganar en ser yo, porque soy el único yo. Si vas a medirte, medilo en cuánto estás respetando tu plan — no en la métrica $.',
    fields: [
      { key: 'condicional', label: '¿En qué basás hoy tu valor? (sé honesto)', type: 'textarea', hint: 'Producción, dinero, lo que digan otros, físico, logros...' },
      { key: 'incondicional', label: '¿Por qué otra cosa podrías valerte si no fuera por eso?', type: 'textarea', hint: 'Ejecutar el plan al 100. Presentarte. Ser único. Darle evidencia a eso.' },
      { key: 'celebrar', label: '¿Qué pequeñas evoluciones podés CELEBRAR hoy?', type: 'textarea', hint: 'Celebrate. Aplaudite. La autoestima es clave.' },
    ],
    outro: 'Ya estás acá, en la conversación. Valés por ser persona — no por el dinero que ganás en el trading.',
  },
]

const PROBLEMAS_EXERCISES: LabExercise[] = [
  {
    key: 'tres-capas',
    categoryKey: 'problemas',
    emoji: '🧩',
    title: 'Objetivo Retador · Desgranar en 3 Capas',
    shortDescription: 'Cuando un objetivo grande se siente difícil, lo bajamos por capas: ver, dialogar, planear.',
    titleField: { stepKey: 'capa_1', fieldKey: 'objetivo_retador' },
    intro: 'Cuando hay un objetivo grande que se siente difícil, lo bajamos por capas. Primera: ver la realidad. Segunda: cambiar el diálogo. Tercera: diseñar el plan con compasión.',
    steps: [
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
    outro: 'Tres capas. Ver, hablar, planear. Volvé acá cuando sientas que el objetivo te aplasta.',
  },
]

const INERCIA_EXERCISES: LabExercise[] = [
  {
    key: 'donde-estoy-trabado',
    categoryKey: 'inercia',
    emoji: '🪨',
    title: 'Dónde Estoy Trabado · diagnóstico',
    shortDescription: 'No estás avanzando. Antes de empujar más, vamos a entender qué te está reteniendo.',
    titleField: { fieldKey: 'area_estancada' },
    intro: 'La inercia no se rompe con más fuerza — se rompe identificando QUÉ exactamente te está reteniendo. Muchas veces es un miedo, una creencia o un costo emocional escondido.',
    isQuick: true,
    fields: [
      { key: 'area_estancada', label: '¿Qué área de tu vida está estancada ahora mismo?', type: 'textarea' },
      { key: 'cuanto_tiempo', label: '¿Cuánto tiempo hace que está así?', type: 'text' },
      { key: 'que_te_retiene', label: '¿Qué te está reteniendo? (lo que sentís, no lo que pensás)', type: 'textarea', hint: 'Miedo a algo, costo emocional, no querer renunciar a algo cómodo, esperar la situación perfecta...' },
      { key: 'beneficio_secundario', label: '¿Qué BENEFICIO secundario te da seguir trabado? Honestidad radical.', type: 'textarea', hint: 'No tener que enfrentar la posibilidad de fracasar, no perder la identidad actual, no decepcionar a alguien...' },
      { key: 'costo_seguir_asi', label: '¿Cuál es el COSTO de seguir así otros 6 meses?', type: 'textarea', hint: 'Hacelo visceral. El dolor de no moverte tiene que pesar más que el dolor de moverte.' },
    ],
    outro: 'Reconocer el beneficio secundario es el 80% del trabajo. Ahora ya tenés con qué hablar — pasá a "Pieza Dominó" si querés definir la acción que destraba.',
  },

  {
    key: 'pieza-domino',
    categoryKey: 'inercia',
    emoji: '🀫',
    title: 'Pieza Dominó · 21 días',
    shortDescription: 'La acción mínima sostenida durante 21 días que destraba todo el resto.',
    titleField: { fieldKey: 'objetivo' },
    intro: 'No es la acción más ambiciosa — es la más PEQUEÑA que, sostenida 21 días, cambia tu identidad y abre el resto. Una sola.',
    isQuick: true,
    fields: [
      { key: 'objetivo', label: '¿Qué área querés desestancar?', type: 'textarea' },
      { key: 'pieza_domino', label: 'La pieza dominó · acción mínima sostenida (21 días)', type: 'textarea', hint: 'Tiene que ser ridículamente pequeña. Si pensás "esto es muy poco", está bien. Mejor 5 min/día durante 21 días que 1h hoy.' },
      { key: 'cuando', label: '¿En qué momento del día la vas a hacer? (anclá a algo que YA hacés)', type: 'textarea', hint: 'Ej: "Después del primer mate, antes de abrir el celular".' },
      { key: 'evidencia', label: '¿Cómo vas a marcar que la cumpliste cada día?', type: 'text', hint: 'Habit del Overseer, palito en papel, app...' },
      { key: 'si_fallo', label: 'Si fallo un día, ¿qué hago? (la regla del "nunca dos seguidos")', type: 'textarea' },
    ],
    outro: 'Una acción mínima · 21 días · anclada a algo cotidiano · con una regla para el fallo. Eso es todo lo que necesitás.',
  },
]

export const LAB_EXERCISES: LabExercise[] = [
  ...CREENCIAS_EXERCISES,
  ...EMOCIONES_EXERCISES,
  ...PENSAMIENTOS_EXERCISES,
  ...IDENTIDAD_EXERCISES,
  ...PROBLEMAS_EXERCISES,
  ...INERCIA_EXERCISES,
]

/** Helper — busca un ejercicio por su key. */
export function findExercise(key: string): LabExercise | undefined {
  return LAB_EXERCISES.find((e) => e.key === key)
}

/** Helper — devuelve los ejercicios de una categoría. */
export function exercisesByCategory(categoryKey: string): LabExercise[] {
  return LAB_EXERCISES.filter((e) => e.categoryKey === categoryKey)
}
