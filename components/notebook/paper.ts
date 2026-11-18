/**
 * El papel del Cuaderno: colores por tono y el fondo de cada tipo de hoja.
 *
 * Todo se arma con gradientes CSS (nada de imágenes): escala perfecto en
 * pantallas HiDPI y el fondo crece con la hoja. La regla que hace que el texto
 * caiga SOBRE el renglón: el textarea usa `line-height = LINEA` y arranca en
 * un múltiplo de LINEA desde el borde de la hoja, así cada línea de texto
 * termina justo donde está dibujado el renglón.
 */
import type { Papel, ColorSticky } from '@/lib/store/notebookStore'
import type { TonoPapel } from '@/lib/store/notebookUiStore'

export const LINEA = 30
/** Dónde está la línea roja del margen (px desde el borde izquierdo de la hoja). */
export const MARGEN = 52

export interface Tinta {
  papel: string
  /** Un tono más oscuro del papel, para el borde y la sombra interior. */
  papelBorde: string
  tinta: string
  tintaSuave: string
  renglon: string
  margen: string
  punto: string
}

export const TONOS: Record<TonoPapel, Tinta> = {
  crema: {
    papel: '#fbf6ea', papelBorde: '#e9dfc8',
    tinta: '#26283a', tintaSuave: 'rgba(38,40,58,0.42)',
    renglon: 'rgba(74,118,196,0.30)', margen: 'rgba(222,86,96,0.55)', punto: 'rgba(60,62,90,0.34)',
  },
  blanco: {
    papel: '#fdfdfc', papelBorde: '#e4e4e0',
    tinta: '#1f2330', tintaSuave: 'rgba(31,35,48,0.40)',
    renglon: 'rgba(80,130,210,0.26)', margen: 'rgba(225,90,100,0.50)', punto: 'rgba(50,55,80,0.30)',
  },
  noche: {
    papel: '#1b1f29', papelBorde: '#2a3040',
    tinta: '#ece8dc', tintaSuave: 'rgba(236,232,220,0.38)',
    renglon: 'rgba(140,175,240,0.17)', margen: 'rgba(240,110,125,0.38)', punto: 'rgba(210,215,235,0.22)',
  },
}

/** Fondo de la hoja según el papel. El margen rojo va en los renglones (como
 *  un cuaderno escolar); puntos y cuadrícula van sin margen (como un bullet
 *  journal). */
export function fondoPapel(papel: Papel, t: Tinta): React.CSSProperties {
  const L = LINEA
  switch (papel) {
    case 'renglones':
      return {
        backgroundImage: [
          `linear-gradient(to right, transparent ${MARGEN}px, ${t.margen} ${MARGEN}px, ${t.margen} ${MARGEN + 1}px, transparent ${MARGEN + 1}px, transparent ${MARGEN + 4}px, ${t.margen} ${MARGEN + 4}px, ${t.margen} ${MARGEN + 5}px, transparent ${MARGEN + 5}px)`,
          `repeating-linear-gradient(to bottom, transparent 0, transparent ${L - 1}px, ${t.renglon} ${L - 1}px, ${t.renglon} ${L}px)`,
        ].join(','),
      }
    case 'puntos':
      return {
        backgroundImage: `radial-gradient(circle at ${L / 2}px ${L - 0.5}px, ${t.punto} 1.15px, transparent 1.7px)`,
        backgroundSize: `${L}px ${L}px`,
      }
    case 'cuadricula':
      return {
        backgroundImage: [
          `repeating-linear-gradient(to bottom, transparent 0, transparent ${L - 1}px, ${t.renglon} ${L - 1}px, ${t.renglon} ${L}px)`,
          `repeating-linear-gradient(to right, transparent 0, transparent ${L - 1}px, ${t.renglon} ${L - 1}px, ${t.renglon} ${L}px)`,
        ].join(','),
      }
    default:
      return {}
  }
}

/** Grano del papel: ruido fractal muy suave encima de todo (pointer-events
 *  none). Es lo que hace que no parezca un rectángulo de color plano. */
export const GRANO = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`

export const STICKY: Record<ColorSticky, { fondo: string; tira: string; tinta: string }> = {
  amarillo: { fondo: '#fff2a8', tira: '#f6e27a', tinta: '#4a3d10' },
  rosa: { fondo: '#ffd3e0', tira: '#f9b5ca', tinta: '#5a1f33' },
  celeste: { fondo: '#cfeaff', tira: '#a9d6fb', tinta: '#123b5c' },
  verde: { fondo: '#d4f5d0', tira: '#ade9a6', tinta: '#1d4a1a' },
  lila: { fondo: '#e6dcff', tira: '#cdbcfb', tinta: '#35215f' },
}

export const NOMBRE_PAPEL: Record<Papel, string> = {
  renglones: 'Renglones', puntos: 'Puntos', cuadricula: 'Cuadrícula', liso: 'Liso',
}

export function tituloDia(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const txt = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
  return (txt.charAt(0).toUpperCase() + txt.slice(1)).replace(',', '')
}
