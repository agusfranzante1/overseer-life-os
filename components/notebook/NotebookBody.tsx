'use client'
/**
 * El adentro del Cuaderno abierto: los botones (sobre el interior de la tapa)
 * y la hoja, que se da vuelta como una hoja de verdad.
 *
 * Pasar de hoja:
 *  - swipe con el dedo (celu, tablet) o con dos dedos en el trackpad,
 *  - la esquinita doblada de abajo (derecha = siguiente, izquierda = anterior),
 *  - las flechas de arriba, o Alt+← / Alt+→.
 * En el diario, la siguiente hoja es el día siguiente; en las notas, la nota
 * siguiente. El índice es la primera hoja del cuaderno.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpen, ChevronLeft, ChevronRight, FilePlus2, StickyNote as StickyIcon, Trash2, Palette,
  ArrowLeft, Check, Book, Minus, Ruler,
} from 'lucide-react'
import {
  useNotebookStore, idDia, hoyLocal, correrDia, indiceCuaderno, resumenHoja,
  PAPELES, COLORES_STICKY, COLORES_TAPA, ESTILOS_TAPA,
  TINTAS, fijadosPara, necesitaNormalizar,
  type HojaCuaderno, type Papel, type Sticky, type ColorSticky, type TapaCuaderno,
  type BloqueTexto, type Trazo, type Tinta,
} from '@/lib/store/notebookStore'
import { useNotebookUiStore, type TonoPapel, type Letra } from '@/lib/store/notebookUiStore'
import { LINEA, MARGEN, TONOS, GRANO, STICKY, NOMBRE_PAPEL, fondoPapel, tituloDia, colorTinta } from './paper'
import { TAPAS, NOMBRE_ESTILO, fondoTapa } from './tapas'
import { StickyNote } from './StickyNote'
import { Bloque, CapaRegla, type Enfoque } from './HojaLibre'

interface Props {
  movil: boolean
  tapa: TapaCuaderno
  onCerrarTapa: () => void
  onEsconder: () => void
}

const hojaVacia = (fecha: string, papel: Papel): HojaCuaderno => ({
  id: idDia(fecha), tipo: 'dia', fecha, titulo: '', texto: '', papel, stickies: [], bloques: [], trazos: [],
  createdAt: '', updatedAt: '',
})

// Curva pareja: la mitad visible del giro (0 a 90°) dura lo suficiente para verse.
const GIRO = { duration: 0.72, ease: [0.42, 0.1, 0.28, 1] as const }
const variantesHoja = {
  // Adelante: la hoja de abajo ya está quieta y la de arriba se va girando a la
  // izquierda. Atrás: la hoja nueva vuelve girando desde la izquierda, encima.
  entra: (d: number) => (d > 0 ? { rotateY: 0, zIndex: 1, filter: 'brightness(0.92)' } : { rotateY: -118, zIndex: 3, filter: 'brightness(0.8)' }),
  quieta: { rotateY: 0, zIndex: 2, filter: 'brightness(1)', transition: GIRO },
  sale: (d: number) => (d > 0
    ? { rotateY: -118, zIndex: 3, filter: 'brightness(0.78)', transition: GIRO }
    : { rotateY: 0, zIndex: 1, filter: 'brightness(0.92)', transition: GIRO }),
}

export function NotebookBody({ movil, tapa, onCerrarTapa, onEsconder }: Props) {
  const hojas = useNotebookStore((s) => s.hojas)
  const ui = useNotebookUiStore()
  const [vista, setVista] = useState<'hoja' | 'indice'>('hoja')
  const [menu, setMenu] = useState(false)
  const [dir, setDir] = useState(1)
  /** escribir = tocar cualquier renglón y escribir ahí · regla = trazar líneas */
  const [herramienta, setHerramienta] = useState<'escribir' | 'regla'>('escribir')
  const [tinta, setTinta] = useState<Tinta>('azul')
  const paleta = TAPAS[tapa.color]

  const hoy = hoyLocal()
  const fecha = ui.fechaDiario ?? hoy
  const nota = ui.hojaId ? hojas.find((h) => h.id === ui.hojaId) : undefined
  const hoja: HojaCuaderno = nota ?? hojas.find((h) => h.id === idDia(fecha)) ?? hojaVacia(fecha, ui.papelDefault)
  const t = TONOS[ui.tono]

  // Si la nota abierta se borró (acá u otro dispositivo), volver al diario.
  useEffect(() => {
    if (ui.hojaId && !nota) ui.set({ hojaId: null })
  }, [ui, nota])

  const notasOrden = useMemo(
    () => hojas.filter((h) => h.tipo === 'nota').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [hojas],
  )

  const editar = useCallback((patch: Partial<Pick<HojaCuaderno, 'titulo' | 'texto' | 'papel'>>) => {
    const st = useNotebookStore.getState()
    if (hoja.tipo === 'nota') st.editarHoja(hoja.id, patch)
    else st.editarDia(hoja.fecha, patch, useNotebookUiStore.getState().papelDefault)
  }, [hoja.tipo, hoja.id, hoja.fecha])

  const cambiarSticky = useCallback((id: string, patch: Partial<Omit<Sticky, 'id'>>) => {
    useNotebookStore.getState().editarSticky(hoja.id, id, patch)
  }, [hoja.id])
  const borrarSticky = useCallback((id: string) => {
    useNotebookStore.getState().borrarSticky(hoja.id, id)
  }, [hoja.id])

  const scrollEl = useRef<HTMLDivElement | null>(null)
  // Estable: si cambiara en cada render, la hoja re-mediría en loop.
  const registrarScroll = useCallback((el: HTMLDivElement | null) => { if (el) scrollEl.current = el }, [])

  /** La hoja del día recién existe cuando se le pega, escribe o traza algo. */
  const asegurar = useCallback(() => {
    const st = useNotebookStore.getState()
    if (hoja.tipo === 'dia' && !st.hojas.some((h) => h.id === hoja.id)) {
      st.editarDia(hoja.fecha, {}, useNotebookUiStore.getState().papelDefault)
    }
  }, [hoja.tipo, hoja.id, hoja.fecha])

  const nuevoBloque = useCallback((x: number, y: number) => {
    asegurar()
    return useNotebookStore.getState().agregarBloque(hoja.id, { x, y, texto: '' })
  }, [asegurar, hoja.id])
  // Con `origen`: un renglón fijado se ve en todos los días pero se guarda en su hoja.
  const cambiarBloque = useCallback((origen: string, id: string, patch: Partial<Omit<BloqueTexto, 'id'>>) => {
    useNotebookStore.getState().editarBloque(origen, id, patch)
  }, [])
  const borrarBloque = useCallback((origen: string, id: string) => {
    useNotebookStore.getState().borrarBloque(origen, id)
  }, [])

  // Lo fijado en otras hojas (renglones y stickies) aparece en cada día del diario.
  const fijados = useMemo(
    () => (hoja.tipo === 'dia' ? fijadosPara(hojas, hoja.fecha, hoja.id) : { bloques: [], stickies: [] }),
    [hojas, hoja.tipo, hoja.fecha, hoja.id],
  )
  const trazar = useCallback((tr: Omit<Trazo, 'id'>) => {
    asegurar()
    useNotebookStore.getState().agregarTrazo(hoja.id, tr)
  }, [asegurar, hoja.id])
  const borrarTrazo = useCallback((id: string) => {
    useNotebookStore.getState().borrarTrazo(hoja.id, id)
  }, [hoja.id])

  const pegarSticky = (color: ColorSticky = 'amarillo') => {
    const st = useNotebookStore.getState()
    asegurar()
    const n = hoja.stickies.length
    st.agregarSticky(hoja.id, {
      texto: '', color,
      x: 0.5 + ((n * 0.07) % 0.2),
      y: (scrollEl.current?.scrollTop ?? 0) + LINEA * 2 + 12 + ((n * 26) % 120),
      rot: Math.round((Math.random() * 6 - 3) * 10) / 10,
    })
    setVista('hoja')
  }

  const elegirPapel = (p: Papel) => { editar({ papel: p }); ui.set({ papelDefault: p }) }

  // ── Navegación (cada salto dice para qué lado gira la hoja) ──
  const irADia = (f: string, d = f >= fecha ? 1 : -1) => {
    setDir(d); setVista('hoja'); ui.set({ hojaId: null, fechaDiario: f === hoy ? null : f })
  }
  const abrirHoja = (h: HojaCuaderno) => {
    setDir(1); setVista('hoja')
    if (h.tipo === 'nota') ui.set({ hojaId: h.id })
    else ui.set({ hojaId: null, fechaDiario: h.fecha === hoy ? null : h.fecha })
  }
  const nuevaNota = () => {
    const id = useNotebookStore.getState().crearNota(ui.papelDefault)
    setDir(1); setVista('hoja'); ui.set({ hojaId: id })
  }
  const verIndice = () => { setDir(-1); setVista('indice') }

  /** Swipe / esquina / flechas: +1 la siguiente, −1 la anterior. */
  const pasar = useCallback((d: 1 | -1) => {
    if (vista === 'indice') {
      if (d > 0) { setDir(1); setVista('hoja') }
      return
    }
    if (hoja.tipo === 'dia') { irADia(correrDia(fecha, d), d); return }
    const i = notasOrden.findIndex((h) => h.id === hoja.id)
    const sig = notasOrden[i + d]
    if (sig) { setDir(d); ui.set({ hojaId: sig.id }) }
    else if (d < 0) verIndice()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, hoja.tipo, hoja.id, fecha, notasOrden])

  // Alt+← / Alt+→
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const win = raiz.current?.ownerDocument.defaultView
    if (!win) return
    const f = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowRight') { e.preventDefault(); pasar(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); pasar(-1) }
    }
    win.addEventListener('keydown', f)
    return () => win.removeEventListener('keydown', f)
  }, [pasar])

  // Swipe con el dedo (touch/lápiz). El mouse usa las esquinas: arrastrar con
  // el mouse sobre la hoja es seleccionar texto.
  const toque = useRef<{ x: number; y: number; id: number } | null>(null)
  // Trackpad: dos dedos de costado llegan como wheel con deltaX.
  const rueda = useRef({ acc: 0, hasta: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> })

  const esHoy = hoja.tipo === 'dia' && hoja.fecha === hoy
  const clave = vista === 'indice' ? 'indice' : hoja.id

  return (
    <div ref={raiz} className="flex flex-col h-full min-h-0" style={{ color: paleta.tinta }}>
      {/* ── Botones, sobre el interior de la tapa (esta franja también arrastra el cuaderno) ── */}
      <div
        data-agarre
        className="relative shrink-0 flex items-center gap-0.5 pl-2 pr-1.5 select-none"
        style={{ height: movil ? 48 : 42, paddingTop: movil ? 'env(safe-area-inset-top, 0px)' : undefined, boxSizing: 'content-box' }}
      >
        <BotonTapa titulo={vista === 'indice' ? 'Volver a la hoja' : 'Índice'} activo={vista === 'indice'} onClick={() => (vista === 'indice' ? pasar(1) : verIndice())}>
          <BookOpen className="w-[18px] h-[18px]" />
        </BotonTapa>

        {vista === 'hoja' && hoja.tipo === 'dia' && (
          <div className="flex items-center">
            <BotonTapa titulo="Día anterior (Alt+←)" onClick={() => pasar(-1)}><ChevronLeft className="w-4 h-4" /></BotonTapa>
            <button
              onClick={() => irADia(hoy)}
              className="px-1.5 h-8 rounded-lg text-[13px] font-semibold tracking-wide hover:bg-white/10 transition-colors whitespace-nowrap"
              title="Ir a hoy"
            >
              {esHoy ? 'Hoy' : fechaCorta(fecha)}
            </button>
            <BotonTapa titulo="Día siguiente (Alt+→)" onClick={() => pasar(1)}><ChevronRight className="w-4 h-4" /></BotonTapa>
          </div>
        )}
        {vista === 'hoja' && hoja.tipo === 'nota' && (
          <button onClick={() => irADia(hoy, -1)} className="flex items-center gap-1 px-2 h-8 rounded-lg text-[13px] font-semibold hover:bg-white/10" title="Volver al diario de hoy">
            <ArrowLeft className="w-4 h-4" /> Diario
          </button>
        )}
        {vista === 'indice' && <span className="ml-1 text-[13px] font-semibold tracking-wide">Índice</span>}

        <div className="flex-1 min-w-2" />

        <div className="relative">
          <BotonTapa titulo="Papel y tapa" activo={menu} onClick={() => setMenu((v) => !v)}><Palette className="w-[18px] h-[18px]" /></BotonTapa>
          {menu && (
            <MenuCuaderno
              papel={hoja.papel} tono={ui.tono} letra={ui.letra} tapa={tapa}
              conHoja={vista === 'hoja'}
              onPapel={elegirPapel}
              onTono={(x) => ui.set({ tono: x })}
              onLetra={(x) => ui.set({ letra: x })}
              onSticky={(c) => { pegarSticky(c); setMenu(false) }}
              onCerrar={() => setMenu(false)}
            />
          )}
        </div>
        {vista === 'hoja' && <BotonTapa titulo="Regla: trazar líneas" activo={herramienta === 'regla'} onClick={() => setHerramienta((h) => (h === 'regla' ? 'escribir' : 'regla'))}><Ruler className="w-[18px] h-[18px]" /></BotonTapa>}
        {vista === 'hoja' && <BotonTapa titulo="Pegar una sticky note" onClick={() => pegarSticky()}><StickyIcon className="w-[18px] h-[18px]" /></BotonTapa>}
        <BotonTapa titulo="Nueva nota" onClick={nuevaNota}><FilePlus2 className="w-[18px] h-[18px]" /></BotonTapa>
        <BotonTapa titulo="Cerrar el cuaderno" onClick={onCerrarTapa}><Book className="w-[17px] h-[17px]" /></BotonTapa>
        <BotonTapa titulo="Esconder (Alt+N)" onClick={onEsconder}><Minus className="w-[18px] h-[18px]" /></BotonTapa>
      </div>

      {/* ── La hoja ── */}
      <div
        data-hojas
        className="@container relative flex-1 min-h-0 ml-3 mr-3.5 mb-3.5"
        style={{ perspective: 2000, touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          toque.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
        }}
        onPointerUp={(e) => {
          const s = toque.current
          toque.current = null
          if (!s || s.id !== e.pointerId) return
          const dx = e.clientX - s.x, dy = e.clientY - s.y
          // Sobre un renglón escrito el swipe SÍ pasa la hoja; mover un renglón (su manija), una sticky o la regla no.
          if ((e.target as HTMLElement).closest('[data-sticky], [data-manija], [data-regla]')) return
          if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) pasar(dx < 0 ? 1 : -1)
        }}
        onPointerCancel={() => { toque.current = null }}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2) return
          const r = rueda.current
          const ahora = Date.now()
          if (ahora < r.hasta) return
          r.acc += e.deltaX
          clearTimeout(r.timer)
          r.timer = setTimeout(() => { r.acc = 0 }, 220)
          if (Math.abs(r.acc) > 90) {
            pasar(r.acc > 0 ? 1 : -1)
            r.acc = 0
            r.hasta = ahora + 750
          }
        }}
      >
        {/* el resto del block de hojas, asomando abajo y a la derecha */}
        <div aria-hidden className="absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-r-[7px] rounded-l-[3px]" style={{ background: t.papelBorde, boxShadow: '0 10px 24px rgba(0,0,0,0.30)' }} />
        <div aria-hidden className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-r-[7px] rounded-l-[3px]" style={{ background: t.papel, filter: 'brightness(0.95)' }} />

        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={clave}
            custom={dir}
            variants={variantesHoja}
            initial="entra"
            animate="quieta"
            exit="sale"
            className="absolute inset-0 rounded-r-[7px] rounded-l-[3px] overflow-hidden"
            style={{ transformOrigin: 'left center', backfaceVisibility: 'hidden', background: t.papel, boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }}
          >
            {vista === 'indice'
              ? <Indice hojas={hojas} tono={ui.tono} onAbrir={abrirHoja} onNueva={nuevaNota} onHoy={() => irADia(hoy, 1)} />
              : <Hoja
                  hoja={hoja}
                  onScrollEl={registrarScroll}
                  letra={ui.letra}
                  tono={ui.tono}
                  cinta={paleta.claro}
                  esHoy={esHoy}
                  onEditar={editar}
                  onCambiarSticky={cambiarSticky}
                  onBorrarSticky={borrarSticky}
                  herramienta={herramienta}
                  tinta={tinta}
                  fijados={fijados}
                  onNuevoBloque={nuevoBloque}
                  onCambiarBloque={cambiarBloque}
                  onBorrarBloque={borrarBloque}
                  onTrazar={trazar}
                  onBorrarTrazo={borrarTrazo}
                  onBorrarNota={() => {
                    if (!confirm('¿Borrar esta nota? No se puede deshacer.')) return
                    useNotebookStore.getState().borrarHoja(hoja.id)
                    irADia(hoy, -1)
                  }}
                />}
            {/* esquinas dobladas: tocarlas da vuelta la hoja */}
            <Esquina lado="der" tono={ui.tono} onClick={() => pasar(1)} />
            {!(vista === 'indice') && <Esquina lado="izq" tono={ui.tono} onClick={() => pasar(-1)} />}
          </motion.div>
        </AnimatePresence>

        {herramienta === 'regla' && vista === 'hoja' && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-40 flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full shadow-xl border border-white/10 text-zinc-100 whitespace-nowrap"
            style={{ background: 'rgba(24,21,38,0.94)', backdropFilter: 'blur(10px)' }}>
            <Ruler className="w-4 h-4 text-violet-300 shrink-0" />
            <span className="text-[11.5px] text-zinc-300 mr-1 hidden @[460px]:inline">Arrastrá para trazar · tocá una línea para borrarla</span>
            {TINTAS.map((x) => (
              <button key={x} onClick={() => setTinta(x)} title={`Tinta ${x === 'tinta' ? 'negra' : x}`} aria-label={`Tinta ${x}`}
                className={`w-6 h-6 shrink-0 rounded-full border-2 transition-transform ${tinta === x ? 'border-white scale-110' : 'border-white/25 hover:scale-110'}`}
                style={{ background: colorTinta(x, 'crema') }} />
            ))}
            <button onClick={() => setHerramienta('escribir')} className="ml-1 h-7 px-3 rounded-full text-[12px] font-semibold bg-violet-500 hover:bg-violet-400">Listo</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Esquina doblada ────────────────────────────────────────────────────────

function Esquina({ lado, tono, onClick }: { lado: 'izq' | 'der'; tono: TonoPapel; onClick: () => void }) {
  const t = TONOS[tono]
  const der = lado === 'der'
  return (
    <button
      onClick={onClick}
      title={der ? 'Hoja siguiente' : 'Hoja anterior'}
      aria-label={der ? 'Hoja siguiente' : 'Hoja anterior'}
      className="group/esq absolute bottom-0 z-30 w-11 h-11"
      style={der ? { right: 0 } : { left: 0 }}
    >
      <span
        className="absolute bottom-0 w-[22px] h-[22px] group-hover/esq:w-[38px] group-hover/esq:h-[38px] transition-all duration-200"
        style={{
          [der ? 'right' : 'left']: 0,
          background: der
            ? `linear-gradient(315deg, transparent 50%, ${t.papelBorde} 50%, ${t.papel} 78%)`
            : `linear-gradient(45deg, transparent 50%, ${t.papelBorde} 50%, ${t.papel} 78%)`,
          boxShadow: der ? '-2px -2px 5px rgba(0,0,0,0.13)' : '2px -2px 5px rgba(0,0,0,0.13)',
          borderTopLeftRadius: der ? 4 : 0,
          borderTopRightRadius: der ? 0 : 4,
        } as React.CSSProperties}
      />
    </button>
  )
}

// ─── La hoja ────────────────────────────────────────────────────────────────

interface HojaProps {
  hoja: HojaCuaderno
  onScrollEl: (el: HTMLDivElement | null) => void
  letra: Letra
  tono: TonoPapel
  cinta: string
  esHoy: boolean
  onEditar: (patch: Partial<Pick<HojaCuaderno, 'titulo' | 'texto' | 'papel'>>) => void
  onCambiarSticky: (id: string, patch: Partial<Omit<Sticky, 'id'>>) => void
  onBorrarSticky: (id: string) => void
  onBorrarNota: () => void
  herramienta: 'escribir' | 'regla'
  tinta: Tinta
  fijados: ReturnType<typeof fijadosPara>
  onNuevoBloque: (x: number, y: number) => string
  onCambiarBloque: (origen: string, id: string, patch: Partial<Omit<BloqueTexto, 'id'>>) => void
  onBorrarBloque: (origen: string, id: string) => void
  onTrazar: (t: Omit<Trazo, 'id'>) => void
  onBorrarTrazo: (id: string) => void
}

function Hoja({
  hoja, onScrollEl, letra, tono, cinta, esHoy, onEditar, onCambiarSticky, onBorrarSticky, onBorrarNota,
  herramienta, tinta, fijados, onNuevoBloque, onCambiarBloque, onBorrarBloque, onTrazar, onBorrarTrazo,
}: HojaProps) {
  const t = TONOS[tono]
  const scrollRef = useRef<HTMLDivElement>(null)
  const hojaRef = useRef<HTMLDivElement>(null)
  const [med, setMed] = useState({ ancho: 0, alto: 0 })
  const [enfocar, setEnfocar] = useState<Enfoque | null>(null)
  const yaEnfocado = useCallback(() => setEnfocar(null), [])
  const bloques = hoja.bloques ?? []
  const trazos = hoja.trazos ?? []
  /** Todos los renglones que se ven (los de la hoja + los fijados), de arriba a abajo: para ↑↓. */
  const todos = useMemo(() => [
    ...bloques.map((b) => ({ origen: hoja.id, b, prestado: false })),
    ...fijados.bloques.map((f) => ({ origen: f.origen, b: f.item, prestado: true })),
  ].sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x), [bloques, fijados.bloques, hoja.id])
  const ordenRef = useRef(todos)
  ordenRef.current = todos

  // Ancho de la hoja (las stickies guardan x como fracción) y alto visible
  // (el textarea llena al menos la hoja, así se puede tocar en cualquier renglón).
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const el = hojaRef.current
    if (!sc || !el) return
    onScrollEl(sc)
    const medir = () => setMed({ ancho: el.clientWidth, alto: sc.clientHeight })
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(sc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onScrollEl])

  const cabecera = LINEA * 2
  const minTexto = Math.max(LINEA * 6, Math.floor((med.alto - cabecera) / LINEA) * LINEA)
  // La hoja se estira para que entre todo lo que está más abajo.
  const bajoStickies = Math.max(
    hoja.stickies.reduce((m, s) => Math.max(m, s.y + 220), 0),
    todos.reduce((m, x) => Math.max(m, x.b.y + LINEA * 6), 0),
    fijados.stickies.reduce((m, f) => Math.max(m, f.item.y + 220), 0),
    trazos.reduce((m, t) => Math.max(m, t.y1 + 80, t.y2 + 80), 0),
  )

  const conMargen = hoja.papel === 'renglones'
  const padIzq = conMargen ? MARGEN + 14 : 30

  // El texto corrido de las hojas viejas pasa a un bloque, así todo se escribe
  // igual: con tildes, viñetas y fijados.
  useEffect(() => {
    if (!hoja.texto.trim() || !hoja.createdAt || med.ancho <= 0) return
    useNotebookStore.getState().pasarTextoARenglones(hoja.id, padIzq / med.ancho)
  }, [hoja.texto, hoja.createdAt, hoja.id, med.ancho, padIzq])

  // Lo que la v3 separó (una checklist = un bloque por tarea) vuelve a juntarse.
  useEffect(() => {
    if (!hoja.createdAt || !necesitaNormalizar(bloques)) return
    useNotebookStore.getState().normalizarBloques(hoja.id)
  }, [bloques, hoja.createdAt, hoja.id])

  // ── ↑↓ y Backspace entre bloques (adentro de un bloque lo maneja el bloque) ──
  const navegar = useCallback((id: string, dir: -1 | 1) => {
    const lista = ordenRef.current
    const i = lista.findIndex((x) => x.b.id === id)
    const otro = lista[i + dir]
    if (otro) setEnfocar({ id: otro.b.id, linea: dir < 0 ? 'ultima' : 'primera', donde: dir < 0 ? 'fin' : 'inicio' })
  }, [])
  const borrarVacio = useCallback((origen: string, b: BloqueTexto) => {
    const lista = ordenRef.current
    const i = lista.findIndex((x) => x.b.id === b.id)
    const arriba = lista[i - 1]
    onBorrarBloque(origen, b.id)
    if (arriba) setEnfocar({ id: arriba.b.id, linea: 'ultima', donde: 'fin' })
  }, [onBorrarBloque])
  const fuente = useMemo(() => (letra === 'manuscrita'
    ? { fontFamily: 'var(--font-hand), cursive', fontSize: 19, fontWeight: 400 }
    : { fontFamily: 'var(--font-book), Georgia, serif', fontSize: 17, fontWeight: 400 }), [letra])

  /** Tocar el papel libre: un texto nuevo justo en ese renglón y en ese lugar de la línea. */
  const tocarPapel = (e: React.MouseEvent<HTMLDivElement>) => {
    if (herramienta !== 'escribir' || e.target !== hojaRef.current) return
    const r = hojaRef.current.getBoundingClientRect()
    const renglon = Math.floor((e.clientY - r.top) / LINEA)
    if (renglon < 2) return // la cabecera
    const x = Math.min(r.width - 110, Math.max(26, e.clientX - r.left - 3))
    // Los textos sueltos que quedaron vacíos no se acumulan (por si el blur
    // no llegó, p. ej. con la ventana sin foco).
    for (const b of bloques) if (!b.texto.trim() && !b.fijo) onBorrarBloque(hoja.id, b.id)
    const id = onNuevoBloque(x / r.width, renglon * LINEA)
    setEnfocar({ id, linea: 'primera', donde: 'inicio' })
  }

  return (
    <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain"
      style={{ background: t.papel, scrollbarWidth: 'thin', scrollbarColor: `${t.papelBorde} transparent`, touchAction: 'pan-y' }}>
      <div
        ref={hojaRef}
        className="relative"
        onClick={tocarPapel}
        style={{ cursor: herramienta === 'escribir' ? 'text' : undefined, minHeight: Math.max(med.alto, cabecera + minTexto, bajoStickies), ...fondoPapel(hoja.papel, t) }}
      >
        {/* grano del papel */}
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRANO, opacity: tono === 'noche' ? 0.35 : 0.5, mixBlendMode: tono === 'noche' ? 'screen' : 'multiply' }} />
        {/* anillado */}
        <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[22px] pointer-events-none" style={{
          backgroundImage: [
            `radial-gradient(circle at 12px ${LINEA / 2}px, rgba(0,0,0,${tono === 'noche' ? 0.65 : 0.38}) 3.6px, transparent 4.4px)`,
            `radial-gradient(ellipse 13px 4px at 3px ${LINEA / 2 - 1}px, #d6dae3 0, #9aa0b2 55%, #6b7184 80%, transparent 100%)`,
          ].join(','),
          backgroundSize: `22px ${LINEA}px`,
        }} />
        {/* cinta señaladora, del color de la tapa */}
        <div aria-hidden className="absolute top-0 right-7 w-[14px] h-[58px] pointer-events-none" style={{
          background: `linear-gradient(90deg, ${cinta}, color-mix(in srgb, ${cinta} 70%, white) 50%, ${cinta})`,
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)',
        }} />

        {/* cabecera: dos renglones exactos, así el texto cae sobre las líneas */}
        <div className="relative flex items-end gap-2 pr-12" style={{ height: cabecera, paddingLeft: padIzq, paddingBottom: 4 }}>
          {hoja.tipo === 'dia' ? (
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] leading-none mb-1.5" style={{ color: '#7457e0' }}>
                {diaSemana(hoja.fecha)}{esHoy && ' · hoy'}
              </p>
              <h2 className="truncate leading-none" style={{ fontFamily: 'var(--font-script), cursive', fontSize: 32, color: t.tinta, fontWeight: 600 }}>
                {fechaLarga(hoja.fecha)}
              </h2>
            </div>
          ) : (
            <>
              <input
                value={hoja.titulo}
                onChange={(e) => onEditar({ titulo: e.target.value })}
                placeholder="Título de la nota"
                className="flex-1 min-w-0 bg-transparent outline-none leading-none placeholder:opacity-40"
                style={{ fontFamily: 'var(--font-script), cursive', fontSize: 34, color: t.tinta, fontWeight: 600 }}
              />
              <button onClick={onBorrarNota} title="Borrar nota" className="shrink-0 mb-1 p-1.5 rounded-md opacity-50 hover:opacity-100 hover:bg-black/5" style={{ color: t.tinta }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* hoja vacía: la pista de cómo se escribe */}
        {todos.length === 0 && (
          <p aria-hidden className="absolute pointer-events-none" style={{
            ...fuente, top: cabecera, left: padIzq, lineHeight: `${LINEA}px`, color: t.tintaSuave,
          }}>
            {esHoy ? '¿Qué hay hoy? ' : ''}Tocá cualquier renglón para escribir
          </p>
        )}

        {med.ancho > 0 && todos.map(({ origen, b, prestado }) => (
          <Bloque key={b.id} bloque={b} origen={origen} prestado={prestado} anchoHoja={med.ancho} fuente={fuente}
            color={t.tinta} acento="#7457e0"
            enfocar={enfocar?.id === b.id ? enfocar : null} onEnfocado={yaEnfocado}
            onCambiar={onCambiarBloque} onBorrar={onBorrarBloque}
            onBorrarVacio={borrarVacio} onNavegar={navegar} />
        ))}

        {med.ancho > 0 && (
          <CapaRegla trazos={trazos} ancho={med.ancho} alto={hojaRef.current?.scrollHeight ?? med.alto} tono={tono}
            activa={herramienta === 'regla'} tinta={tinta} onTrazar={onTrazar} onBorrar={onBorrarTrazo} />
        )}

        {med.ancho > 0 && hoja.stickies.map((s) => (
          <StickyNote key={s.id} sticky={s} anchoHoja={med.ancho} onCambiar={onCambiarSticky} onBorrar={onBorrarSticky} />
        ))}
        {/* stickies fijadas en días anteriores: se editan en su hoja */}
        {med.ancho > 0 && fijados.stickies.map(({ origen, item }) => (
          <StickyNote key={item.id} sticky={item} anchoHoja={med.ancho}
            onCambiar={(id, patch) => useNotebookStore.getState().editarSticky(origen, id, patch)}
            onBorrar={(id) => useNotebookStore.getState().borrarSticky(origen, id)} />
        ))}
      </div>
    </div>
  )
}

// ─── El índice ──────────────────────────────────────────────────────────────

function Indice({ hojas, tono, onAbrir, onNueva, onHoy }: {
  hojas: HojaCuaderno[]; tono: TonoPapel
  onAbrir: (h: HojaCuaderno) => void; onNueva: () => void; onHoy: () => void
}) {
  const t = TONOS[tono]
  const { dias, notas } = useMemo(() => indiceCuaderno(hojas), [hojas])
  const borrar = (h: HojaCuaderno) => {
    const que = h.tipo === 'dia' ? `la hoja del ${tituloDia(h.fecha).toLowerCase()}` : `"${h.titulo || 'Sin título'}"`
    if (confirm(`¿Borrar ${que}? No se puede deshacer.`)) useNotebookStore.getState().borrarHoja(h.id)
  }
  const fila = (h: HojaCuaderno, titulo: string) => (
    <li key={h.id} className="group flex items-center">
      <button onClick={() => onAbrir(h)} className="flex-1 min-w-0 text-left px-3 py-2 rounded-lg hover:bg-black/[0.05] transition-colors">
        <div className="truncate" style={{ fontFamily: 'var(--font-script), cursive', fontSize: 23, color: t.tinta, lineHeight: 1.1 }}>{titulo}</div>
        <div className="truncate text-[13px]" style={{ fontFamily: 'var(--font-hand), cursive', color: t.tintaSuave }}>{resumenHoja(h) || '—'}</div>
      </button>
      <button onClick={() => borrar(h)} title="Borrar" className="p-2 rounded-md opacity-0 group-hover:opacity-60 hover:!opacity-100" style={{ color: t.tinta }}>
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  )
  return (
    <div className="absolute inset-0 overflow-y-auto pl-7 pr-4 py-5" style={{ background: t.papel, touchAction: 'pan-y' }}>
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRANO, opacity: 0.45, mixBlendMode: tono === 'noche' ? 'screen' : 'multiply' }} />
      <div className="relative space-y-5">
        <h2 className="px-3 leading-none" style={{ fontFamily: 'var(--font-script), cursive', fontSize: 36, color: t.tinta, fontWeight: 600 }}>Índice</h2>
        <div className="flex gap-2 px-1">
          <button onClick={onHoy} className="flex-1 h-10 rounded-xl text-sm font-semibold text-white shadow-sm" style={{ background: 'linear-gradient(180deg,#7a5cf0,#6247c9)' }}>Hoja de hoy</button>
          <button onClick={onNueva} className="flex-1 h-10 rounded-xl text-sm font-semibold border" style={{ color: t.tinta, borderColor: t.papelBorde }}>+ Nueva nota</button>
        </div>
        <section>
          <h3 className="px-3 mb-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: t.tintaSuave }}>Notas</h3>
          {notas.length === 0
            ? <p className="px-3 text-sm" style={{ fontFamily: 'var(--font-hand), cursive', color: t.tintaSuave }}>Todavía no hay notas sueltas.</p>
            : <ul>{notas.map((h) => fila(h, h.titulo || 'Sin título'))}</ul>}
        </section>
        <section>
          <h3 className="px-3 mb-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: t.tintaSuave }}>Diario</h3>
          {dias.length === 0
            ? <p className="px-3 text-sm" style={{ fontFamily: 'var(--font-hand), cursive', color: t.tintaSuave }}>Lo que escribas cada día queda acá.</p>
            : <ul>{dias.map((h) => fila(h, tituloDia(h.fecha)))}</ul>}
        </section>
      </div>
    </div>
  )
}

// ─── Piezas chicas ──────────────────────────────────────────────────────────

function BotonTapa({ titulo, activo, onClick, children }: { titulo: string; activo?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={`w-8 h-8 shrink-0 grid place-items-center rounded-lg transition-colors ${activo ? 'bg-white/20' : 'opacity-85 hover:opacity-100 hover:bg-white/15'}`}
    >
      {children}
    </button>
  )
}

/** Menú de papel + tapa. También lo usa la tapa cerrada (`soloTapa`). */
export function MenuCuaderno({ papel, tono, letra, tapa, conHoja, onPapel, onTono, onLetra, onSticky, onCerrar, soloTapa, className }: {
  papel?: Papel; tono?: TonoPapel; letra?: Letra; tapa: TapaCuaderno; conHoja?: boolean
  onPapel?: (p: Papel) => void; onTono?: (t: TonoPapel) => void; onLetra?: (l: Letra) => void
  onSticky?: (c: ColorSticky) => void; onCerrar: () => void; soloTapa?: boolean; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const doc = ref.current?.ownerDocument
    if (!doc) return
    const fuera = (e: PointerEvent) => {
      const el = e.target as HTMLElement
      if (ref.current && !ref.current.contains(el) && !el.closest?.('[title="Papel y tapa"], [title="Personalizar la tapa"]')) onCerrar()
    }
    doc.addEventListener('pointerdown', fuera)
    return () => doc.removeEventListener('pointerdown', fuera)
  }, [onCerrar])
  const setTapa = useNotebookStore.getState().setTapa
  const tn = TONOS[tono ?? 'crema']
  const Titulo = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 mt-3 first:mt-0 mb-2">{children}</p>
  )
  return (
    <div ref={ref} onPointerDown={(e) => e.stopPropagation()} data-menu
      className={className ?? 'absolute right-0 top-10 z-50'}
      style={{ width: 272 }}>
      <div className="max-h-[70vh] overflow-y-auto rounded-2xl p-3 text-zinc-100 shadow-2xl border border-white/10" style={{ background: 'rgba(24,21,38,0.97)', backdropFilter: 'blur(12px)' }}>
        <Titulo>Tapa</Titulo>
        <div className="grid grid-cols-5 gap-2">
          {COLORES_TAPA.map((c) => (
            <button key={c} onClick={() => setTapa({ color: c })} title={TAPAS[c].nombre}
              className={`relative h-10 rounded-[5px] rounded-l-[2px] shadow-md transition-transform hover:-translate-y-0.5 ${tapa.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#181526]' : ''}`}
              style={fondoTapa(c, tapa.estilo)}>
              <span className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-[2px]" style={{ background: 'rgba(0,0,0,0.25)' }} />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {ESTILOS_TAPA.map((e) => (
            <button key={e} onClick={() => setTapa({ estilo: e })}
              className={`flex flex-col items-center gap-1 rounded-lg p-1 ${tapa.estilo === e ? 'bg-white/10 ring-1 ring-violet-400' : 'hover:bg-white/5'}`}>
              <span className="w-full h-7 rounded-[4px]" style={fondoTapa(tapa.color, e)} />
              <span className="text-[10.5px] text-zinc-300">{NOMBRE_ESTILO[e]}</span>
            </button>
          ))}
        </div>
        <input
          value={tapa.nombre}
          onChange={(e) => setTapa({ nombre: e.target.value })}
          placeholder="Nombre en la tapa"
          maxLength={40}
          className="mt-2 w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 outline-none focus:border-violet-400 text-[18px]"
          style={{ fontFamily: 'var(--font-script), cursive' }}
        />

        {!soloTapa && conHoja && papel && onPapel && (
          <>
            <Titulo>Hoja</Titulo>
            <div className="grid grid-cols-4 gap-1.5">
              {PAPELES.map((p) => (
                <button key={p} onClick={() => onPapel(p)} title={NOMBRE_PAPEL[p]}
                  className={`flex flex-col items-center gap-1 rounded-lg p-1 transition-colors ${papel === p ? 'bg-white/12 ring-1 ring-violet-400' : 'hover:bg-white/5'}`}>
                  <span className="relative w-12 h-14 rounded-[4px] overflow-hidden" style={{ background: tn.papel, ...fondoPapelMini(p, tn) }} />
                  <span className="text-[10.5px] text-zinc-300">{NOMBRE_PAPEL[p]}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {!soloTapa && tono && onTono && (
          <>
            <Titulo>Papel</Titulo>
            <div className="flex gap-1.5">
              {(['crema', 'blanco', 'noche'] as TonoPapel[]).map((x) => (
                <button key={x} onClick={() => onTono(x)}
                  className={`flex-1 h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 border ${tono === x ? 'border-violet-400' : 'border-white/10 hover:border-white/25'}`}
                  style={{ background: TONOS[x].papel, color: TONOS[x].tinta }}>
                  {tono === x && <Check className="w-3 h-3" />}{x === 'crema' ? 'Crema' : x === 'blanco' ? 'Blanco' : 'Noche'}
                </button>
              ))}
            </div>
          </>
        )}
        {!soloTapa && letra && onLetra && (
          <>
            <Titulo>Letra</Titulo>
            <div className="flex gap-1.5">
              {(['manuscrita', 'clasica'] as Letra[]).map((x) => (
                <button key={x} onClick={() => onLetra(x)}
                  className={`flex-1 h-9 rounded-lg text-[15px] border ${letra === x ? 'border-violet-400 bg-white/10' : 'border-white/10 hover:border-white/25'}`}
                  style={{ fontFamily: x === 'manuscrita' ? 'var(--font-hand), cursive' : 'var(--font-book), serif' }}>
                  {x === 'manuscrita' ? 'A mano' : 'Clásica'}
                </button>
              ))}
            </div>
          </>
        )}
        {!soloTapa && conHoja && onSticky && (
          <>
            <Titulo>Pegar sticky</Titulo>
            <div className="flex gap-2">
              {COLORES_STICKY.map((c) => (
                <button key={c} onClick={() => onSticky(c)} title={`Sticky ${c}`}
                  className="w-8 h-8 rounded-md shadow-sm hover:scale-110 transition-transform"
                  style={{ background: STICKY[c].fondo, transform: 'rotate(-3deg)' }} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Miniatura del papel para el menú: mismo fondo, renglón más chico. */
function fondoPapelMini(p: Papel, t: (typeof TONOS)[TonoPapel]): React.CSSProperties {
  if (p === 'renglones') return { backgroundImage: [
    `linear-gradient(to right, transparent 10px, ${t.margen} 10px, ${t.margen} 11px, transparent 11px)`,
    `repeating-linear-gradient(to bottom, transparent 0, transparent 7px, ${t.renglon} 7px, ${t.renglon} 8px)`,
  ].join(',') }
  if (p === 'puntos') return { backgroundImage: `radial-gradient(circle, ${t.punto} 0.8px, transparent 1.2px)`, backgroundSize: '7px 7px' }
  if (p === 'cuadricula') return { backgroundImage: [
    `repeating-linear-gradient(to bottom, transparent 0, transparent 6px, ${t.renglon} 6px, ${t.renglon} 7px)`,
    `repeating-linear-gradient(to right, transparent 0, transparent 6px, ${t.renglon} 6px, ${t.renglon} 7px)`,
  ].join(',') }
  return {}
}

function diaSemana(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(new Date(y, m - 1, d))
}

function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const f = new Date(y, m - 1, d)
  const txt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(f)
  return f.getFullYear() === new Date().getFullYear() ? txt : `${txt} ${f.getFullYear()}`
}

function fechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d))
}
