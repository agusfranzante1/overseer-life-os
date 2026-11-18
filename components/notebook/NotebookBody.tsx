'use client'
/**
 * El contenido del Cuaderno: la tapa (barra de arriba) y la hoja, o el índice.
 * No sabe dónde está montado: lo usa el panel lateral, la ventana flotante y
 * la ventana Picture-in-Picture (otro `document`, por eso los listeners se
 * cuelgan del `ownerDocument` y nunca de `window`/`document` directo).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen, ChevronLeft, ChevronRight, ChevronsRight, FilePlus2, Maximize2, PanelRight,
  PictureInPicture2, StickyNote as StickyIcon, Trash2, Palette, ArrowLeft, Check,
} from 'lucide-react'
import {
  useNotebookStore, idDia, hoyLocal, correrDia, indiceCuaderno, resumenHoja,
  PAPELES, COLORES_STICKY, type HojaCuaderno, type Papel, type Sticky, type ColorSticky,
} from '@/lib/store/notebookStore'
import { useNotebookUiStore, type TonoPapel, type Letra } from '@/lib/store/notebookUiStore'
import { LINEA, MARGEN, TONOS, GRANO, STICKY, NOMBRE_PAPEL, fondoPapel, tituloDia } from './paper'
import { StickyNote } from './StickyNote'

export type Variante = 'lateral' | 'flotante' | 'pip' | 'movil'

export interface BarraArrastre {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
}

interface Props {
  variante: Variante
  onCerrar: () => void
  onModo?: (m: 'lateral' | 'flotante') => void
  onPip?: () => void
  arrastre?: BarraArrastre
}

const hojaVacia = (fecha: string, papel: Papel): HojaCuaderno => ({
  id: idDia(fecha), tipo: 'dia', fecha, titulo: '', texto: '', papel, stickies: [],
  createdAt: '', updatedAt: '',
})

export function NotebookBody({ variante, onCerrar, onModo, onPip, arrastre }: Props) {
  const hojas = useNotebookStore((s) => s.hojas)
  const ui = useNotebookUiStore()
  const [vista, setVista] = useState<'hoja' | 'indice'>('hoja')
  const [menuPapel, setMenuPapel] = useState(false)

  const hoy = hoyLocal()
  const fecha = ui.fechaDiario ?? hoy
  const nota = ui.hojaId ? hojas.find((h) => h.id === ui.hojaId) : undefined
  const hoja: HojaCuaderno = nota ?? hojas.find((h) => h.id === idDia(fecha)) ?? hojaVacia(fecha, ui.papelDefault)
  const t = TONOS[ui.tono]

  // Si la nota abierta se borró (acá u otro dispositivo), volver al diario.
  useEffect(() => {
    if (ui.hojaId && !nota) ui.set({ hojaId: null })
  }, [ui, nota])

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

  const scrollRef = useRef<HTMLDivElement>(null)

  const pegarSticky = (color: ColorSticky = 'amarillo') => {
    const st = useNotebookStore.getState()
    // La hoja del día recién existe cuando se le pega o escribe algo.
    if (hoja.tipo === 'dia' && !st.hojas.some((h) => h.id === hoja.id)) {
      st.editarDia(hoja.fecha, {}, ui.papelDefault)
    }
    const scroll = scrollRef.current?.scrollTop ?? 0
    const n = hoja.stickies.length
    st.agregarSticky(hoja.id, {
      texto: '',
      color,
      x: 0.5 + ((n * 0.07) % 0.2),
      y: scroll + LINEA * 2 + 12 + ((n * 26) % 120),
      rot: Math.round((Math.random() * 6 - 3) * 10) / 10,
    })
    setVista('hoja')
  }

  const elegirPapel = (p: Papel) => {
    editar({ papel: p })
    ui.set({ papelDefault: p })
  }

  const irADia = (f: string) => { ui.set({ hojaId: null, fechaDiario: f === hoy ? null : f }); setVista('hoja') }
  const abrirHoja = (h: HojaCuaderno) => {
    if (h.tipo === 'nota') ui.set({ hojaId: h.id })
    else ui.set({ hojaId: null, fechaDiario: h.fecha === hoy ? null : h.fecha })
    setVista('hoja')
  }
  const nuevaNota = () => {
    const id = useNotebookStore.getState().crearNota(ui.papelDefault)
    ui.set({ hojaId: id })
    setVista('hoja')
  }

  const movil = variante === 'movil'
  const esHoy = hoja.tipo === 'dia' && hoja.fecha === hoy

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: t.papel }}>
      {/* ── La tapa ─────────────────────────────────────────────── */}
      <div
        {...arrastre}
        className={`relative shrink-0 flex items-center gap-0.5 px-2 text-[#e9e3f7] select-none ${arrastre ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
        style={{
          height: movil ? 52 : 46,
          paddingTop: movil ? 'env(safe-area-inset-top, 0px)' : undefined,
          boxSizing: 'content-box',
          background: 'linear-gradient(180deg, #3a2f5c 0%, #2a2245 55%, #221c3a 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 2px 6px rgba(0,0,0,0.25)',
        }}
      >
        {/* costura de la tapa */}
        <div aria-hidden className="absolute left-2 right-2 bottom-[5px] border-b border-dashed border-white/15 pointer-events-none" />

        <BotonTapa titulo={vista === 'indice' ? 'Volver a la hoja' : 'Índice'} activo={vista === 'indice'} onClick={() => setVista(vista === 'indice' ? 'hoja' : 'indice')}>
          <BookOpen className="w-[18px] h-[18px]" />
        </BotonTapa>

        {vista === 'hoja' && hoja.tipo === 'dia' && (
          <div className="flex items-center ml-0.5">
            <BotonTapa titulo="Día anterior" onClick={() => irADia(correrDia(fecha, -1))}><ChevronLeft className="w-4 h-4" /></BotonTapa>
            <button
              onClick={() => irADia(hoy)}
              className="px-2 h-8 rounded-lg text-[13px] font-semibold tracking-wide hover:bg-white/10 transition-colors whitespace-nowrap"
              title="Ir a hoy"
            >
              {esHoy ? 'Hoy' : fechaCorta(fecha)}
            </button>
            <BotonTapa titulo="Día siguiente" onClick={() => irADia(correrDia(fecha, 1))}><ChevronRight className="w-4 h-4" /></BotonTapa>
          </div>
        )}
        {vista === 'hoja' && hoja.tipo === 'nota' && (
          <button onClick={() => irADia(hoy)} className="ml-0.5 flex items-center gap-1 px-2 h-8 rounded-lg text-[13px] font-semibold hover:bg-white/10" title="Volver al diario de hoy">
            <ArrowLeft className="w-4 h-4" /> Diario
          </button>
        )}
        {vista === 'indice' && <span className="ml-1.5 text-[13px] font-semibold tracking-wide">Índice</span>}

        <div className="flex-1" />

        {vista === 'hoja' && (
          <>
            <div className="relative">
              <BotonTapa titulo="Papel" activo={menuPapel} onClick={() => setMenuPapel((v) => !v)}><Palette className="w-[18px] h-[18px]" /></BotonTapa>
              {menuPapel && (
                <MenuPapel
                  papel={hoja.papel}
                  tono={ui.tono}
                  letra={ui.letra}
                  onPapel={elegirPapel}
                  onTono={(x) => ui.set({ tono: x })}
                  onLetra={(x) => ui.set({ letra: x })}
                  onSticky={(c) => { pegarSticky(c); setMenuPapel(false) }}
                  onCerrar={() => setMenuPapel(false)}
                />
              )}
            </div>
            <BotonTapa titulo="Pegar una sticky note" onClick={() => pegarSticky()}><StickyIcon className="w-[18px] h-[18px]" /></BotonTapa>
          </>
        )}
        <BotonTapa titulo="Nueva nota" onClick={nuevaNota}><FilePlus2 className="w-[18px] h-[18px]" /></BotonTapa>

        {!movil && variante !== 'pip' && onModo && (
          variante === 'lateral'
            ? <BotonTapa titulo="Agrandar y mover (ventana flotante)" onClick={() => onModo('flotante')}><Maximize2 className="w-4 h-4" /></BotonTapa>
            : <BotonTapa titulo="Volver al costado" onClick={() => onModo('lateral')}><PanelRight className="w-4 h-4" /></BotonTapa>
        )}
        {onPip && variante !== 'pip' && !movil && (
          <BotonTapa titulo="Sacarlo arriba de todas las ventanas (Picture-in-Picture)" onClick={onPip}><PictureInPicture2 className="w-4 h-4" /></BotonTapa>
        )}
        <BotonTapa titulo={variante === 'pip' ? 'Devolverlo a Overseer' : 'Esconder (Alt+N)'} onClick={onCerrar}>
          <ChevronsRight className="w-[18px] h-[18px]" />
        </BotonTapa>
      </div>

      {vista === 'indice'
        ? <Indice hojas={hojas} tinta={t} onAbrir={abrirHoja} onNueva={nuevaNota} onHoy={() => irADia(hoy)} />
        : <Hoja
            key={hoja.id}
            hoja={hoja}
            scrollRef={scrollRef}
            letra={ui.letra}
            tono={ui.tono}
            esHoy={esHoy}
            onEditar={editar}
            onCambiarSticky={cambiarSticky}
            onBorrarSticky={borrarSticky}
            onBorrarNota={() => {
              if (!confirm('¿Borrar esta nota? No se puede deshacer.')) return
              useNotebookStore.getState().borrarHoja(hoja.id)
              irADia(hoy)
            }}
          />}
    </div>
  )
}

// ─── La hoja ────────────────────────────────────────────────────────────────

interface HojaProps {
  hoja: HojaCuaderno
  scrollRef: React.RefObject<HTMLDivElement | null>
  letra: Letra
  tono: TonoPapel
  esHoy: boolean
  onEditar: (patch: Partial<Pick<HojaCuaderno, 'titulo' | 'texto' | 'papel'>>) => void
  onCambiarSticky: (id: string, patch: Partial<Omit<Sticky, 'id'>>) => void
  onBorrarSticky: (id: string) => void
  onBorrarNota: () => void
}

function Hoja({ hoja, scrollRef, letra, tono, esHoy, onEditar, onCambiarSticky, onBorrarSticky, onBorrarNota }: HojaProps) {
  const t = TONOS[tono]
  const hojaRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [med, setMed] = useState({ ancho: 0, alto: 0 })

  // Ancho de la hoja (las stickies guardan x como fracción) y alto visible
  // (el textarea llena al menos la hoja, así se puede tocar en cualquier renglón).
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const el = hojaRef.current
    if (!sc || !el) return
    const win = el.ownerDocument.defaultView
    const medir = () => setMed({ ancho: el.clientWidth, alto: sc.clientHeight })
    medir()
    if (!win || !('ResizeObserver' in win)) return
    const ro = new (win as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver(medir)
    ro.observe(sc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollRef])

  const cabecera = LINEA * 2
  const minTexto = Math.max(LINEA * 6, Math.floor((med.alto - cabecera) / LINEA) * LINEA)
  const bajoStickies = hoja.stickies.reduce((m, s) => Math.max(m, s.y + 220), 0)

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = '0px'
    const alto = Math.ceil(el.scrollHeight / LINEA) * LINEA
    el.style.height = `${Math.max(minTexto, alto + LINEA * 2)}px`
  }, [hoja.texto, minTexto, med.ancho, letra])

  const conMargen = hoja.papel === 'renglones'
  const padIzq = conMargen ? MARGEN + 14 : 30
  const fuente = letra === 'manuscrita'
    ? { fontFamily: 'var(--font-hand), cursive', fontSize: 19, fontWeight: 400 }
    : { fontFamily: 'var(--font-book), Georgia, serif', fontSize: 17, fontWeight: 400 }

  return (
    <div ref={scrollRef} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
      style={{ background: t.papel, scrollbarWidth: 'thin', scrollbarColor: `${t.papelBorde} transparent` }}>
      <div
        ref={hojaRef}
        className="relative"
        style={{ minHeight: Math.max(med.alto, cabecera + minTexto, bajoStickies), ...fondoPapel(hoja.papel, t) }}
      >
        {/* grano del papel */}
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRANO, opacity: tono === 'noche' ? 0.35 : 0.5, mixBlendMode: tono === 'noche' ? 'screen' : 'multiply' }} />
        {/* anillado */}
        <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[22px] pointer-events-none" style={{
          backgroundImage: [
            `radial-gradient(circle at 12px ${LINEA / 2}px, rgba(0,0,0,${tono === 'noche' ? 0.65 : 0.38}) 3.6px, transparent 4.4px)`,
            `radial-gradient(ellipse 13px 4px at 3px ${LINEA / 2 - 1}px, #c9cdd8 0, #9aa0b2 55%, #6b7184 80%, transparent 100%)`,
          ].join(','),
          backgroundSize: `22px ${LINEA}px`,
        }} />
        {/* cinta señaladora */}
        <div aria-hidden className="absolute top-0 right-7 w-[14px] h-[58px] pointer-events-none" style={{
          background: 'linear-gradient(90deg, #6d4fd6, #8b6cf0 50%, #6247c9)',
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }} />

        {/* cabecera: dos renglones exactos, así el texto cae sobre las líneas */}
        <div className="relative flex items-end gap-2 pr-12" style={{ height: cabecera, paddingLeft: padIzq, paddingBottom: 4 }}>
          {hoja.tipo === 'dia' ? (
            // Dos renglones: el día de la semana chiquito arriba y la fecha
            // grande abajo — entra entera aun en el panel más angosto.
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

        <textarea
          ref={areaRef}
          value={hoja.texto}
          onChange={(e) => onEditar({ texto: e.target.value })}
          placeholder={hoja.tipo === 'dia' ? (esHoy ? '¿Qué hay hoy?' : 'Escribí acá…') : 'Escribí acá…'}
          spellCheck={false}
          className="relative block w-full resize-none bg-transparent outline-none overflow-hidden placeholder:text-[var(--ph)]"
          style={{
            ...fuente,
            lineHeight: `${LINEA}px`,
            color: t.tinta,
            caretColor: '#7457e0',
            paddingLeft: padIzq,
            paddingRight: 26,
            paddingTop: 0,
            paddingBottom: 0,
            ['--ph' as string]: t.tintaSuave,
          } as React.CSSProperties}
        />

        {med.ancho > 0 && hoja.stickies.map((s) => (
          <StickyNote key={s.id} sticky={s} anchoHoja={med.ancho} onCambiar={onCambiarSticky} onBorrar={onBorrarSticky} />
        ))}
      </div>
    </div>
  )
}

// ─── El índice ──────────────────────────────────────────────────────────────

function Indice({ hojas, tinta: t, onAbrir, onNueva, onHoy }: {
  hojas: HojaCuaderno[]; tinta: (typeof TONOS)[TonoPapel]
  onAbrir: (h: HojaCuaderno) => void; onNueva: () => void; onHoy: () => void
}) {
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
    <div className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4" style={{ background: t.papel }}>
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRANO, opacity: 0.45, mixBlendMode: 'multiply' }} />
      <div className="relative space-y-5">
        <div className="flex gap-2">
          <button onClick={onHoy} className="flex-1 h-10 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(180deg,#7a5cf0,#6247c9)' }}>Hoja de hoy</button>
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
      className={`w-8 h-8 shrink-0 grid place-items-center rounded-lg transition-colors ${activo ? 'bg-white/15 text-white' : 'text-[#d9d1f2] hover:bg-white/10 hover:text-white'}`}
    >
      {children}
    </button>
  )
}

function MenuPapel({ papel, tono, letra, onPapel, onTono, onLetra, onSticky, onCerrar }: {
  papel: Papel; tono: TonoPapel; letra: Letra
  onPapel: (p: Papel) => void; onTono: (t: TonoPapel) => void; onLetra: (l: Letra) => void
  onSticky: (c: ColorSticky) => void; onCerrar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const doc = ref.current?.ownerDocument
    if (!doc) return
    const fuera = (e: PointerEvent) => {
      const el = e.target as Node
      if (ref.current && !ref.current.contains(el) && !(el as HTMLElement).closest?.('[title="Papel"]')) onCerrar()
    }
    doc.addEventListener('pointerdown', fuera)
    return () => doc.removeEventListener('pointerdown', fuera)
  }, [onCerrar])
  const tn = TONOS[tono]
  return (
    <div ref={ref} onPointerDown={(e) => e.stopPropagation()}
      className="absolute right-0 top-10 z-50 w-[264px] rounded-2xl p-3 text-zinc-100 shadow-2xl border border-white/10"
      style={{ background: 'rgba(28,24,44,0.97)', backdropFilter: 'blur(12px)' }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 mb-2">Hoja</p>
      <div className="grid grid-cols-4 gap-1.5">
        {PAPELES.map((p) => (
          <button key={p} onClick={() => onPapel(p)} title={NOMBRE_PAPEL[p]}
            className={`flex flex-col items-center gap-1 rounded-lg p-1 transition-colors ${papel === p ? 'bg-white/12 ring-1 ring-violet-400' : 'hover:bg-white/5'}`}>
            <span className="relative w-12 h-14 rounded-[4px] overflow-hidden" style={{ background: tn.papel, ...fondoPapelMini(p, tn) }} />
            <span className="text-[10.5px] text-zinc-300">{NOMBRE_PAPEL[p]}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 mt-3 mb-2">Papel</p>
      <div className="flex gap-1.5">
        {(['crema', 'blanco', 'noche'] as TonoPapel[]).map((x) => (
          <button key={x} onClick={() => onTono(x)}
            className={`flex-1 h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 border ${tono === x ? 'border-violet-400' : 'border-white/10 hover:border-white/25'}`}
            style={{ background: TONOS[x].papel, color: TONOS[x].tinta }}>
            {tono === x && <Check className="w-3 h-3" />}{x === 'crema' ? 'Crema' : x === 'blanco' ? 'Blanco' : 'Noche'}
          </button>
        ))}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 mt-3 mb-2">Letra</p>
      <div className="flex gap-1.5">
        {(['manuscrita', 'clasica'] as Letra[]).map((x) => (
          <button key={x} onClick={() => onLetra(x)}
            className={`flex-1 h-9 rounded-lg text-[15px] border ${letra === x ? 'border-violet-400 bg-white/10' : 'border-white/10 hover:border-white/25'}`}
            style={{ fontFamily: x === 'manuscrita' ? 'var(--font-hand), cursive' : 'var(--font-book), serif' }}>
            {x === 'manuscrita' ? 'A mano' : 'Clásica'}
          </button>
        ))}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 mt-3 mb-2">Pegar sticky</p>
      <div className="flex gap-2">
        {COLORES_STICKY.map((c) => (
          <button key={c} onClick={() => onSticky(c)} title={`Sticky ${c}`}
            className="w-8 h-8 rounded-md shadow-sm hover:scale-110 transition-transform"
            style={{ background: STICKY[c].fondo, transform: 'rotate(-3deg)' }} />
        ))}
      </div>
    </div>
  )
}

/** Miniatura del papel para el menú: mismo fondo, renglón más chico. */
function fondoPapelMini(p: Papel, t: (typeof TONOS)[TonoPapel]): React.CSSProperties {
  const f = fondoPapel(p, t)
  if (p === 'renglones') return { ...f, backgroundSize: 'auto, 100% 8px', backgroundImage: [
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
