/**
 * Guion del recorrido inicial.
 *
 * Cada paso navega a una sección real y explica para qué sirve. El orden va de
 * lo más usado a lo más específico, y termina en Configuración, que es desde
 * donde se ajusta todo lo demás.
 *
 * Está en un archivo aparte (sin JSX) para que sea fácil de editar sin tocar
 * el componente.
 */
export interface TourStep {
  /** A dónde navega el paso. null = no navega (se queda donde está). */
  href: string | null
  title: string
  body: string
  /** Se muestra como "tip" resaltado abajo del cuerpo. */
  tip?: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    href: '/dashboard',
    title: 'Bienvenido a Overseer',
    body: 'Tu sistema personal de gestión: tareas, plata, hábitos, salud, estudio y contenido en un solo lugar. Todo se guarda solo y se sincroniza entre tu compu y tu celu.',
    tip: 'Este recorrido son 9 pantallas. Lo podés cortar cuando quieras.',
  },
  {
    href: '/dashboard',
    title: 'Panel',
    body: 'La pantalla de arranque del día. Te junta las prioridades de hoy, los hábitos que te faltan marcar y cómo venís con lo que te propusiste.',
    tip: 'Si abrís la app sin saber qué hacer, empezá acá.',
  },
  {
    href: '/tasks',
    title: 'Tareas',
    body: 'Tus proyectos y todo lo que tenés pendiente. Cada proyecto tiene sus propias columnas de estado, y podés verlo como lista o como tablero.',
    tip: 'Pegá una lista de varios renglones y te pregunta si querés una tarea por línea o todo junto en una.',
  },
  {
    href: '/calendar',
    title: 'Calendario',
    body: 'Tu semana. Se conecta con Google Calendar, así que lo que agregás acá aparece en tu teléfono y al revés.',
    tip: 'Arrastrá un evento para moverlo de horario.',
  },
  {
    href: '/proyeccion',
    title: 'Proyección',
    body: 'Acá bajás lo grande a lo concreto: del año al trimestre, del trimestre al mes y del mes a la semana. Es lo que evita que los objetivos queden en una lista linda que nunca mirás.',
    tip: 'Cuando tengas una revisión pendiente, el menú te avisa con un punto titilando.',
  },
  {
    href: '/habits',
    title: 'Hábitos',
    body: 'Lo que querés sostener todos los días. Marcás y se arma la racha; la idea es no cortarla.',
    tip: 'Podés ponerle recordatorio a cada hábito por separado.',
  },
  {
    href: '/money',
    title: 'Billetera',
    body: 'Ingresos, gastos y en qué se te va la plata. Sin esto, el resto del sistema opina sobre tu vida sin saber cómo estás parado.',
  },
  {
    href: '/kpis',
    title: 'KPIs',
    body: 'Los números que decidiste mirar. Pocos y elegidos por vos: sirven para darte cuenta si estás avanzando o solo ocupado.',
  },
  {
    href: '/settings',
    title: 'Listo — armá tu menú',
    body: 'Arrancás con lo mínimo. El resto de las secciones (Journal, Mapas Mentales, YouTube, Gym, Comida, Trading, Salud, Estudio, Contenido, Laboratorio y Meditaciones) las agregás cuando las necesites.',
    tip: 'Tocá el ícono de ajustes arriba del menú lateral: desde ahí agregás, sacás, renombrás y reordenás secciones.',
  },
]
