'use client'
/**
 * El Cuaderno siempre a mano: vive en el AppShell, arriba de cualquier sección.
 *
 *  - `cerrado`: solo la pestañita en el borde derecho (Alt+N lo abre).
 *  - `lateral`: pegado al costado derecho, de alto completo. El borde
 *    izquierdo se arrastra para hacerlo más ancho.
 *  - `flotante`: ventana que se arrastra desde la tapa y se agranda desde la
 *    esquina. Queda donde la dejaste (por dispositivo, ver notebookUiStore).
 *  - Picture-in-Picture: el navegador lo saca a una ventanita que queda
 *    ARRIBA DE TODAS LAS APPS de la compu (Chrome/Edge, API Document PiP).
 *    Es lo único que permite "siempre al frente" fuera de la pestaña.
 *  - En el celu: pantalla completa.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { NotebookPen } from 'lucide-react'
import {
  useNotebookUiStore, encajarRect, rectInicial, ANCHO_LATERAL_MIN, ANCHO_LATERAL_MAX, type Rect,
} from '@/lib/store/notebookUiStore'
import { NotebookBody, type BarraArrastre } from './NotebookBody'

type DocPip = { requestWindow: (o: { width: number; height: number }) => Promise<Window> }
const docPip = (): DocPip | null =>
  typeof window !== 'undefined' && 'documentPictureInPicture' in window
    ? (window as unknown as { documentPictureInPicture: DocPip }).documentPictureInPicture
    : null

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

export function NotebookDock() {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  const ui = useNotebookUiStore()
  const movil = useEsMovil()
  const vp = useViewport()
  const [pip, setPip] = useState<{ win: Window; root: HTMLElement } | null>(null)

  // ── Rect flotante: en vivo mientras se arrastra, al store al soltar ──
  const [vivo, setVivo] = useState<Rect | null>(null)
  const gesto = useRef<{ tipo: 'mover' | 'tamano'; px: number; py: number; r: Rect } | null>(null)
  const rectGuardado = ui.flotante ? encajarRect(ui.flotante, vp.w, vp.h) : rectInicial(vp.w, vp.h)
  const rect = vivo ?? rectGuardado

  const empezar = (tipo: 'mover' | 'tamano') => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    gesto.current = { tipo, px: e.clientX, py: e.clientY, r: rect }
    setVivo(rect)
  }
  const mover = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesto.current
    if (!g) return
    const dx = e.clientX - g.px, dy = e.clientY - g.py
    const r = g.tipo === 'mover'
      ? { ...g.r, x: g.r.x + dx, y: g.r.y + dy }
      : { ...g.r, w: g.r.w + dx, h: g.r.h + dy }
    setVivo(encajarRect(r, vp.w, vp.h))
  }
  const soltar = () => {
    if (!gesto.current) return
    gesto.current = null
    if (vivo) ui.set({ flotante: vivo })
    setVivo(null)
  }
  const barraFlotante: BarraArrastre = { onPointerDown: empezar('mover'), onPointerMove: mover, onPointerUp: soltar }

  // ── Ancho del lateral ──
  const [anchoVivo, setAnchoVivo] = useState<number | null>(null)
  const gestoAncho = useRef<{ px: number; w: number } | null>(null)
  const anchoMax = Math.min(ANCHO_LATERAL_MAX, vp.w - 120)
  const ancho = Math.max(ANCHO_LATERAL_MIN, Math.min(anchoMax, anchoVivo ?? ui.anchoLateral))

  // ── Atajo Alt+N ──
  const alternar = useCallback(() => {
    const s = useNotebookUiStore.getState()
    if (s.modo === 'cerrado') s.abrir()
    else s.cerrar()
  }, [])
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) {
        e.preventDefault()
        alternar()
      }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [alternar])

  // ── Picture-in-Picture ──
  const abrirPip = useCallback(async () => {
    const api = docPip()
    if (!api) return
    let win: Window
    try {
      win = await api.requestWindow({ width: 420, height: Math.min(720, window.screen.availHeight - 80) })
    } catch (e) {
      console.warn('[cuaderno] no se pudo abrir la ventana flotante', e)
      return
    }
    const d = win.document
    // Las URLs de las fuentes son relativas al sitio: sin <base> la ventana
    // (que arranca en about:blank) no las encuentra y cae a la letra default.
    const base = d.createElement('base')
    base.href = `${location.origin}/`
    d.head.append(base)
    d.title = 'Cuaderno · Overseer'
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const st = d.createElement('style')
        st.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n')
        d.head.append(st)
      } catch {
        if (sheet.href) {
          const l = d.createElement('link')
          l.rel = 'stylesheet'
          l.href = sheet.href
          d.head.append(l)
        }
      }
    }
    d.documentElement.className = document.documentElement.className
    d.body.style.margin = '0'
    d.body.style.background = '#221c3a'
    const root = d.createElement('div')
    root.style.height = '100vh'
    d.body.append(root)
    win.addEventListener('pagehide', () => {
      setPip(null)
      useNotebookUiStore.getState().abrir()
    })
    setPip({ win, root })
    useNotebookUiStore.getState().cerrar()
  }, [])

  if (!montado) return null

  const abierto = ui.modo !== 'cerrado' && !pip
  const modo = movil ? 'movil' : ui.modo
  const pipDisponible = !!docPip()

  return (
    <>
      {/* ── Pestañita ── */}
      <AnimatePresence>
        {!abierto && (
          <motion.button
            key="pestana"
            initial={{ x: 40 }}
            animate={{ x: 0 }}
            exit={{ x: 40 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onClick={() => (pip ? pip.win.close() : ui.abrir())}
            title={pip ? 'El cuaderno está en una ventana aparte — tocá para traerlo' : 'Abrir el cuaderno (Alt+N)'}
            aria-label="Abrir el cuaderno"
            className="fixed right-0 z-[45] flex flex-col items-center gap-2 py-3 pl-1.5 pr-1 rounded-l-xl text-[#ece6ff] hover:pr-2.5 transition-[padding] duration-200"
            style={{
              top: movil ? '62%' : '50%',
              transform: 'translateY(-50%)',
              background: 'linear-gradient(180deg, #4a3b78 0%, #2e2550 100%)',
              boxShadow: '-4px 6px 16px rgba(0,0,0,0.35), inset 1px 1px 0 rgba(255,255,255,0.14)',
            }}
          >
            <NotebookPen className="w-4 h-4" />
            {!movil && (
              <span className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                {pip ? 'Afuera' : 'Cuaderno'}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── El cuaderno abierto ── */}
      <AnimatePresence>
        {abierto && modo === 'movil' && (
          <motion.div
            key="movil"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed inset-0 z-[45] overflow-hidden"
          >
            <NotebookBody variante="movil" onCerrar={ui.cerrar} />
          </motion.div>
        )}

        {abierto && modo === 'lateral' && (
          <motion.div
            key="lateral"
            initial={{ x: ancho + 40, opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: ancho + 40, opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed top-2.5 bottom-2.5 right-2.5 z-[45] rounded-[20px] overflow-hidden"
            style={{ width: ancho, boxShadow: '0 24px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)' }}
            data-cuaderno="lateral"
          >
            {/* manija para el ancho */}
            <div
              className="absolute left-0 top-0 bottom-0 w-2 z-10 cursor-ew-resize hover:bg-violet-400/30 transition-colors touch-none"
              title="Arrastrá para cambiar el ancho"
              onPointerDown={(e) => {
                e.preventDefault()
                e.currentTarget.setPointerCapture(e.pointerId)
                gestoAncho.current = { px: e.clientX, w: ancho }
                setAnchoVivo(ancho)
              }}
              onPointerMove={(e) => {
                const g = gestoAncho.current
                if (!g) return
                setAnchoVivo(Math.max(ANCHO_LATERAL_MIN, Math.min(anchoMax, g.w - (e.clientX - g.px))))
              }}
              onPointerUp={() => {
                if (!gestoAncho.current) return
                gestoAncho.current = null
                if (anchoVivo != null) ui.set({ anchoLateral: anchoVivo })
                setAnchoVivo(null)
              }}
            />
            <NotebookBody
              variante="lateral"
              onCerrar={ui.cerrar}
              onModo={(m) => ui.abrir(m)}
              onPip={pipDisponible ? abrirPip : undefined}
            />
          </motion.div>
        )}

        {abierto && modo === 'flotante' && (
          <motion.div
            key="flotante"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="fixed z-[45] rounded-[20px] overflow-hidden"
            style={{
              left: rect.x, top: rect.y, width: rect.w, height: rect.h,
              boxShadow: vivo ? '0 40px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(167,139,250,0.35)' : '0 28px 70px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
            data-cuaderno="flotante"
          >
            <NotebookBody
              variante="flotante"
              onCerrar={ui.cerrar}
              onModo={(m) => ui.abrir(m)}
              onPip={pipDisponible ? abrirPip : undefined}
              arrastre={barraFlotante}
            />
            {/* esquina para agrandar */}
            <div
              className="absolute right-0 bottom-0 w-6 h-6 z-10 cursor-nwse-resize touch-none"
              title="Arrastrá para agrandar"
              onPointerDown={empezar('tamano')}
              onPointerMove={mover}
              onPointerUp={soltar}
              style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(116,87,224,0.45) 50%, rgba(116,87,224,0.45) 58%, transparent 58%, transparent 70%, rgba(116,87,224,0.45) 70%, rgba(116,87,224,0.45) 78%, transparent 78%)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {pip && createPortal(
        <NotebookBody variante="pip" onCerrar={() => pip.win.close()} />,
        pip.root,
      )}
    </>
  )
}
