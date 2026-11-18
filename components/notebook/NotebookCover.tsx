'use client'
/**
 * El frente de la tapa: lomo, costura, el nombre grabado en dorado (o en
 * relieve en las tapas claras), el elástico y la cinta asomando abajo.
 * Es puramente visual: abrir, arrastrar y los botones los maneja el Dock.
 */
import { memo } from 'react'
import type { TapaCuaderno } from '@/lib/store/notebookStore'
import { TAPAS, fondoTapa } from './tapas'

function NotebookCoverBase({ tapa, chica = false }: { tapa: TapaCuaderno; chica?: boolean }) {
  const p = TAPAS[tapa.color]
  const costura = tapa.estilo === 'cuero' || tapa.estilo === 'tela'
  const anio = new Date().getFullYear()
  return (
    // backfaceVisibility en cada capa con filtro: si no, al girar la tapa el
    // nombre se ve al revés del otro lado.
    <div className="absolute inset-0 overflow-hidden rounded-r-[16px] rounded-l-[7px]" style={{ ...fondoTapa(tapa.color, tapa.estilo), backfaceVisibility: 'hidden' }}>
      {/* lomo */}
      <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[26px]" style={{
        background: 'linear-gradient(90deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.12) 55%, rgba(255,255,255,0.10) 80%, rgba(0,0,0,0.25) 100%)',
      }} />
      {/* bisagra: la marca donde dobla la tapa */}
      <div aria-hidden className="absolute top-0 bottom-0 left-[30px] w-[3px]" style={{
        background: 'linear-gradient(90deg, rgba(0,0,0,0.28), rgba(255,255,255,0.12))',
      }} />

      {/* costura */}
      {costura && !chica && (
        <div aria-hidden className="absolute rounded-r-[10px] rounded-l-[3px] pointer-events-none" style={{
          inset: '12px 14px 12px 42px',
          border: '1.5px dashed rgba(255,255,255,0.28)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.10)',
        }} />
      )}

      {/* nombre grabado */}
      {!chica && (
        <div className="absolute left-[34px] right-[46px] top-[24%] flex flex-col items-center text-center px-3 pointer-events-none" style={{ backfaceVisibility: 'hidden' }}>
          <span aria-hidden className="block w-16 h-[1.5px] mb-4 opacity-80" style={{ background: p.foil }} />
          <h2
            className="leading-[0.95] break-words max-w-full"
            style={{
              fontFamily: 'var(--font-script), cursive',
              fontWeight: 700,
              fontSize: tapa.nombre.length > 16 ? 40 : 54,
              backgroundImage: p.foil,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.35)) drop-shadow(0 -1px 0 rgba(255,255,255,0.12))',
              backfaceVisibility: 'hidden',
            }}
          >
            {tapa.nombre || 'Cuaderno'}
          </h2>
          <span aria-hidden className="block w-16 h-[1.5px] mt-4 opacity-80" style={{ background: p.foil }} />
          <span className="mt-3 text-[11px] font-bold tracking-[0.42em]" style={{
            backgroundImage: p.foil, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>{anio}</span>
        </div>
      )}

      {/* elástico */}
      <div aria-hidden className="absolute top-0 bottom-0" style={{
        right: chica ? 6 : 24,
        width: chica ? 5 : 13,
        background: `linear-gradient(90deg, rgba(0,0,0,0.35), ${p.elastico} 20%, color-mix(in srgb, ${p.elastico} 70%, white) 48%, ${p.elastico} 75%, rgba(0,0,0,0.4))`,
        boxShadow: '-3px 0 6px rgba(0,0,0,0.25), 3px 0 6px rgba(0,0,0,0.18)',
      }} />
    </div>
  )
}

export const NotebookCover = memo(NotebookCoverBase)
