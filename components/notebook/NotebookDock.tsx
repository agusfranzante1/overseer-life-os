'use client'
/**
 * El Cuaderno, flotando arriba de cualquier sección (vive en el AppShell).
 *
 *  - `oculto`: solo la pestañita en el borde derecho, con el color de la tapa.
 *  - `tapa`: el cuaderno cerrado. Se ve la tapa; tocarla lo abre.
 *  - `abierto`: la tapa gira sobre el lomo y queda la hoja.
 * En los dos estados se ARRASTRA a cualquier lugar de la pantalla agarrándolo
 * de la tapa (el borde alrededor de la hoja, o la tapa entera si está cerrado)
 * y se agranda desde la esquina de abajo a la derecha. Queda donde lo dejaste,
 * por dispositivo. En el celu ocupa la pantalla entera. Alt+N lo muestra/esconde.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Palette } from 'lucide-react'
import { useNotebookStore } from '@/lib/store/notebookStore'
import { useNotebookUiStore, encajarRect, rectInicial, type Rect } from '@/lib/store/notebookUiStore'
import { NotebookBody, MenuCuaderno } from './NotebookBody'
import { NotebookCover } from './NotebookCover'
import { TAPAS, fondoInterior, fondoTapa } from './tapas'

function useEsMovil() {
  const [movil, setMovil] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const f = () => setMovil(mq.matches)
    f()
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return movil
}

function useViewport() {
  const [vp, setVp] = useState({ w: 1280, h: 800 })
  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return vp
}

/** Lo que NO arrastra el cuaderno aunque esté encima de la tapa. */
const NO_ARRASTRA = 'button, input, textarea, a, select, [data-hojas], [data-menu]'

export function NotebookDock() {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  const ui = useNotebookUiStore()
  const tapa = useNotebookStore((s) => s.tapa)
  const movil = useEsMovil()
  const vp = useViewport()
  const [menuTapa, setMenuTapa] = useState(false)

  // ── Posición: en vivo mientras se arrastra, al store al soltar ──
  const [vivo, setVivo] = useState<Rect | null>(null)
  // `ultimo` guarda la posición en vivo en un ref: al soltar no se puede leer
  // `vivo` del render, que puede ir un movimiento atrasado.
  const gesto = useRef<{ tipo: 'mover' | 'tamano'; px: number; py: number; r: Rect; movio: boolean; ultimo: Rect | null } | null>(null)
  const rect = vivo ?? (ui.rect ? encajarRect(ui.rect, vp.w, vp.h) : rectInicial(vp.w, vp.h))

  const empezar = (tipo: 'mover' | 'tamano') => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if (tipo === 'mover' && (e.target as HTMLElement).closest(NO_ARRASTRA)) return
    // En el celu no se arrastra (ocupa la pantalla), pero el toque igual cuenta
    // para abrir la tapa.
    if (!movil) {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    gesto.current = { tipo, px: e.clientX, py: e.clientY, r: rect, movio: false, ultimo: null }
  }
  const mover = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesto.current
    if (!g || movil) return
    const dx = e.clientX - g.px, dy = e.clientY - g.py
    if (!g.movio && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    g.movio = true
    const r = g.tipo === 'mover' ? { ...g.r, x: g.r.x + dx, y: g.r.y + dy } : { ...g.r, w: g.r.w + dx, h: g.r.h + dy }
    g.ultimo = encajarRect(r, vp.w, vp.h)
    setVivo(g.ultimo)
  }
  /** Devuelve true si fue un toque (sin arrastrar). */
  const soltar = (): boolean => {
    const g = gesto.current
    gesto.current = null
    if (!g) return false
    if (g.movio && g.ultimo) ui.set({ rect: g.ultimo })
    setVivo(null)
    return !g.movio
  }

  // ── Alt+N ──
  const alternar = useCallback(() => {
    const s = useNotebookUiStore.getState()
    if (s.modo === 'oculto') s.mostrar()
    else s.esconder()
  }, [])
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyN' || e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        alternar()
      }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [alternar])

  if (!montado) return null

  const visible = ui.modo !== 'oculto'
  const abierto = ui.modo === 'abierto'
  const p = TAPAS[tapa.color]
  const caja: React.CSSProperties = movil
    ? { left: 0, top: 0, width: '100vw', height: '100dvh' }
    : { left: rect.x, top: rect.y, width: rect.w, height: rect.h }

  return (
    <>
      {/* ── Pestañita: un cuadernito asomando del borde ── */}
      <AnimatePresence>
        {!visible && (
          <motion.button
            key="pestana"
            initial={{ x: 48 }} animate={{ x: 0 }} exit={{ x: 48 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onClick={() => ui.mostrar()}
            title="Abrir el cuaderno (Alt+N)"
            aria-label="Abrir el cuaderno"
            className="fixed right-0 z-[45] w-[34px] rounded-l-[9px] overflow-hidden hover:w-[44px] transition-[width] duration-200"
            style={{
              top: movil ? '62%' : '50%', height: movil ? 78 : 104, translate: '0 -50%',
              boxShadow: '-5px 8px 18px rgba(0,0,0,0.4)',
              ...fondoTapa(tapa.color, tapa.estilo),
            }}
          >
            <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[6px]" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.35), rgba(255,255,255,0.1))' }} />
            <span aria-hidden className="absolute top-0 bottom-0 right-[9px] w-[5px]" style={{ background: p.elastico, boxShadow: '-1px 0 2px rgba(0,0,0,0.3)' }} />
            {/* hojas asomando */}
            <span aria-hidden className="absolute -bottom-px left-2 right-2 h-[3px]" style={{ background: 'repeating-linear-gradient(90deg,#f4eedf 0 3px,#d9cfb5 3px 4px)' }} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── El cuaderno ── */}
      <AnimatePresence>
        {visible && (
          <motion.div
            key="cuaderno"
            data-cuaderno={ui.modo}
            initial={{ opacity: 0, scale: 0.92, x: 40 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.92, x: 40 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            className={`fixed z-[45] ${movil ? '' : 'touch-none'}`}
            style={{ ...caja, perspective: 2200 }}
            onPointerDown={empezar('mover')}
            onPointerMove={mover}
            onPointerUp={() => {
              const fueToque = soltar()
              // Tocar la tapa cerrada la abre (arrastrarla no).
              if (fueToque && useNotebookUiStore.getState().modo === 'tapa' && !menuTapa) ui.set({ modo: 'abierto' })
            }}
          >
            {/* hojas asomando por el canto (se ven con la tapa cerrada y abierta) */}
            {!movil && (
              <>
                <div aria-hidden className="absolute top-[7px] bottom-[7px] -right-[5px] w-[9px] rounded-r-[5px]" style={{
                  background: 'repeating-linear-gradient(180deg, #f6f1e4 0 2px, #ddd3bb 2px 3px)',
                  boxShadow: '3px 0 6px rgba(0,0,0,0.25)',
                }} />
                <div aria-hidden className="absolute left-[30px] right-[7px] -bottom-[5px] h-[8px] rounded-b-[5px]" style={{
                  background: 'repeating-linear-gradient(90deg, #f6f1e4 0 2px, #ddd3bb 2px 3px)',
                }} />
              </>
            )}

            {/* el adentro: interior de la tapa + hoja */}
            <div
              className={`absolute inset-0 overflow-hidden ${movil ? '' : 'rounded-r-[16px] rounded-l-[7px]'}`}
              style={{
                ...fondoInterior(tapa.color),
                boxShadow: vivo ? '0 40px 90px rgba(0,0,0,0.55)' : '0 26px 60px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)',
                cursor: abierto && !movil ? (vivo ? 'grabbing' : 'grab') : undefined,
              }}
            >
              {/* lomo del lado de adentro */}
              {!movil && <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[10px]" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.35), transparent)' }} />}
              <NotebookBody
                movil={movil}
                tapa={tapa}
                onCerrarTapa={() => ui.set({ modo: 'tapa' })}
                onEsconder={() => ui.esconder()}
              />
            </div>

            {/* la tapa: gira sobre el lomo para abrir y cerrar */}
            {/* Dos caras: el frente y el lado de adentro. Pasando los 90° se ve
                el adentro, como una tapa de verdad; al terminar de abrir se
                desvanece (abierta del todo taparía lo que está a la izquierda). */}
            <motion.div
              className="absolute inset-0 group/tapa"
              initial={false}
              animate={{ rotateY: abierto ? -172 : 0 }}
              transition={{ duration: 0.9, ease: [0.36, 0.66, 0.2, 1] }}
              style={{
                transformOrigin: 'left center',
                transformStyle: 'preserve-3d',
                pointerEvents: abierto ? 'none' : 'auto',
                cursor: abierto ? undefined : vivo ? 'grabbing' : 'pointer',
              }}
              title={abierto ? undefined : 'Tocá para abrir · arrastrá para moverlo'}
            >
              {/* OJO: la opacidad va en esta cara, no en la tapa que gira —
                  una opacidad < 1 en el padre aplana el 3D y el frente se ve
                  al revés a través del adentro. */}
              <motion.div aria-hidden className={`absolute inset-0 ${movil ? '' : 'rounded-l-[16px] rounded-r-[7px]'}`}
                initial={false}
                animate={{ opacity: abierto ? [1, 1, 0] : 1 }}
                transition={abierto ? { duration: 0.9, times: [0, 0.8, 1] } : { duration: 0 }}
                style={{
                  transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', ...fondoInterior(tapa.color),
                  boxShadow: 'inset -14px 0 24px rgba(0,0,0,0.35)',
                }} />
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
                <NotebookCover tapa={tapa} />
              </div>
              {!abierto && (
                <div className="absolute top-3 right-[46px] flex gap-1 opacity-0 group-hover/tapa:opacity-100 focus-within:opacity-100 transition-opacity" style={{ color: p.tinta }}>
                  <button onClick={() => setMenuTapa((v) => !v)} title="Personalizar la tapa" aria-label="Personalizar la tapa"
                    className="w-8 h-8 grid place-items-center rounded-lg bg-black/25 hover:bg-black/40 backdrop-blur-sm">
                    <Palette className="w-4 h-4" />
                  </button>
                  <button onClick={() => ui.esconder()} title="Esconder (Alt+N)" aria-label="Esconder"
                    className="w-8 h-8 grid place-items-center rounded-lg bg-black/25 hover:bg-black/40 backdrop-blur-sm">
                    <Minus className="w-4 h-4" />
                  </button>
                </div>
              )}
              {!abierto && menuTapa && (
                <MenuCuaderno soloTapa tapa={tapa} onCerrar={() => setMenuTapa(false)} className="absolute right-3 top-12 z-50" />
              )}
            </motion.div>

            {/* esquina para agrandar */}
            {!movil && (
              <div
                className="absolute -right-1 -bottom-1 w-7 h-7 z-20 cursor-nwse-resize"
                title="Arrastrá para agrandar"
                onPointerDown={(e) => { e.stopPropagation(); empezar('tamano')(e) }}
                onPointerMove={mover}
                onPointerUp={(e) => { e.stopPropagation(); soltar() }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
