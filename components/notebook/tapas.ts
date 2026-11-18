/**
 * Las tapas del Cuaderno: 10 colores × 4 terminaciones, todo con gradientes y
 * SVG inline (nada de imágenes): escala perfecto en pantallas HiDPI.
 */
import type { ColorTapa, EstiloTapa } from '@/lib/store/notebookStore'

export interface PaletaTapa {
  nombre: string
  /** Arriba-izquierda → abajo-derecha del frente. */
  claro: string
  base: string
  oscuro: string
  /** El lado de adentro de la tapa (el marco alrededor de la hoja abierta). */
  interior: string
  /** Texto y botones sobre la tapa. */
  tinta: string
  /** Dorado para tapas oscuras, grabado oscuro para las claras. */
  foil: string
  elastico: string
}

const DORADO = 'linear-gradient(180deg, #fbe9b0 0%, #d9ad52 45%, #a87a2a 60%, #f3d68e 100%)'
const PLATA = 'linear-gradient(180deg, #ffffff 0%, #c9ced8 45%, #8e95a4 60%, #eef0f4 100%)'
const GRABADO = (c: string) => `linear-gradient(180deg, ${c} 0%, ${c} 100%)`

export const TAPAS: Record<ColorTapa, PaletaTapa> = {
  violeta:    { nombre: 'Violeta',    claro: '#5d48a8', base: '#46358a', oscuro: '#2b1f5e', interior: '#3a2d72', tinta: '#efe9ff', foil: DORADO, elastico: '#1e1645' },
  medianoche: { nombre: 'Medianoche', claro: '#2e3f66', base: '#1f2c4d', oscuro: '#111a31', interior: '#1b2643', tinta: '#e6edff', foil: PLATA,  elastico: '#0a1022' },
  borgona:    { nombre: 'Borgoña',    claro: '#943047', base: '#74213a', oscuro: '#4a1022', interior: '#651c32', tinta: '#ffe8ee', foil: DORADO, elastico: '#2d0712' },
  bosque:     { nombre: 'Bosque',     claro: '#3f7559', base: '#2d5a43', oscuro: '#173828', interior: '#264d39', tinta: '#e6f7ee', foil: DORADO, elastico: '#0d2418' },
  oceano:     { nombre: 'Océano',     claro: '#3592b3', base: '#23708f', oscuro: '#134a61', interior: '#1e637f', tinta: '#e6f7ff', foil: PLATA,  elastico: '#0b3344' },
  caramelo:   { nombre: 'Caramelo',   claro: '#c1844a', base: '#a1652f', oscuro: '#6c3f17', interior: '#8f5829', tinta: '#fff2e3', foil: DORADO, elastico: '#4a2a0e' },
  mostaza:    { nombre: 'Mostaza',    claro: '#e6bb46', base: '#cf9e25', oscuro: '#9a7010', interior: '#c08f1f', tinta: '#3d2b05', foil: GRABADO('#5a3f08'), elastico: '#6e4f0a' },
  rosa:       { nombre: 'Rosa',       claro: '#eeb0c3', base: '#de8fa9', oscuro: '#b9627f', interior: '#d4849f', tinta: '#4a1828', foil: GRABADO('#7a2d47'), elastico: '#8f3d59' },
  arena:      { nombre: 'Arena',      claro: '#ecdfc4', base: '#d9c7a2', oscuro: '#b19c74', interior: '#cfbc95', tinta: '#3c3020', foil: GRABADO('#6b5634'), elastico: '#7a6440' },
  grafito:    { nombre: 'Grafito',    claro: '#45464d', base: '#2f3036', oscuro: '#18191c', interior: '#2a2b30', tinta: '#eeeef2', foil: PLATA,  elastico: '#0d0d0f' },
}

export const NOMBRE_ESTILO: Record<EstiloTapa, string> = {
  cuero: 'Cuero', tela: 'Tela', estrellas: 'Estrellas', rayas: 'Rayas',
}

const svg = (s: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(s)}")`

/** Grano de cuero: ruido fino con relieve (luz y sombra). */
const GRANO_CUERO = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/><feDiffuseLighting lighting-color='#fff' surfaceScale='1.6'><feDistantLight azimuth='45' elevation='58'/></feDiffuseLighting><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0 0 0 -0.62'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`)
const SOMBRA_CUERO = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.42'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`)
const FIBRA = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.08 2.2' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.35 -0.08'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`)

/** Cielo de estrellas en una baldosa de 160×160 (puntos de distinto brillo + dos destellos). */
const ESTRELLAS = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' fill='#fff'>
<circle cx='12' cy='18' r='0.9' opacity='.8'/><circle cx='47' cy='9' r='0.6' opacity='.5'/><circle cx='83' cy='31' r='1.1' opacity='.9'/>
<circle cx='131' cy='14' r='0.7' opacity='.6'/><circle cx='150' cy='57' r='0.9' opacity='.7'/><circle cx='28' cy='66' r='0.6' opacity='.45'/>
<circle cx='66' cy='78' r='0.8' opacity='.75'/><circle cx='104' cy='92' r='0.6' opacity='.5'/><circle cx='9' cy='121' r='1' opacity='.85'/>
<circle cx='52' cy='139' r='0.7' opacity='.55'/><circle cx='95' cy='150' r='0.9' opacity='.7'/><circle cx='141' cy='128' r='0.6' opacity='.5'/>
<circle cx='121' cy='71' r='0.5' opacity='.4'/><circle cx='75' cy='118' r='0.5' opacity='.4'/>
<path d='M118 40 l1.2 3.6 3.6 1.2 -3.6 1.2 -1.2 3.6 -1.2 -3.6 -3.6 -1.2 3.6 -1.2z' opacity='.9'/>
<path d='M34 100 l.9 2.7 2.7 .9 -2.7 .9 -.9 2.7 -.9 -2.7 -2.7 -.9 2.7 -.9z' opacity='.75'/></svg>`)

/** Frente de la tapa: color + terminación + luz. */
export function fondoTapa(color: ColorTapa, estilo: EstiloTapa): React.CSSProperties {
  const p = TAPAS[color]
  const luz = 'linear-gradient(115deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 28%, transparent 45%, rgba(0,0,0,0.10) 80%, rgba(0,0,0,0.22) 100%)'
  const vineta = 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.28) 100%)'
  const base = `linear-gradient(160deg, ${p.claro} 0%, ${p.base} 48%, ${p.oscuro} 100%)`
  switch (estilo) {
    case 'cuero':
      return { backgroundImage: [luz, vineta, GRANO_CUERO, SOMBRA_CUERO, base].join(','), backgroundSize: 'auto, auto, 180px, 180px, auto' }
    case 'tela':
      return {
        backgroundImage: [
          luz, vineta, FIBRA,
          'repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)',
          'repeating-linear-gradient(90deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 3px)',
          base,
        ].join(','),
        backgroundSize: 'auto, auto, 120px, auto, auto, auto',
      }
    case 'estrellas':
      return {
        backgroundImage: [
          luz, vineta, ESTRELLAS,
          'radial-gradient(60% 40% at 75% 20%, rgba(255,255,255,0.10), transparent 70%)',
          base,
        ].join(','),
        backgroundSize: 'auto, auto, 160px, auto, auto',
      }
    case 'rayas':
      return {
        backgroundImage: [
          luz, vineta, FIBRA,
          'repeating-linear-gradient(135deg, rgba(255,255,255,0.075) 0 9px, transparent 9px 22px)',
          base,
        ].join(','),
        backgroundSize: 'auto, auto, 120px, auto, auto',
      }
  }
}

/** El lado de adentro de la tapa: liso, con un poco de textura. */
export function fondoInterior(color: ColorTapa): React.CSSProperties {
  const p = TAPAS[color]
  return {
    backgroundColor: p.interior,
    backgroundImage: [`linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12))`, FIBRA].join(','),
    backgroundSize: 'auto, 120px',
  }
}
