'use client'
/**
 * Lo que se escribe y se dibuja "en cualquier lado" de la hoja:
 *  - `Renglon`: una línea de texto en cualquier renglón y en cualquier lugar de
 *    la línea, como en Notion: texto, tarea con tilde (tildada = tachada) o
 *    viñeta. Enter abre el renglón de abajo (una tarea abre otra tarea),
 *    Backspace en un renglón vacío lo borra, ↑↓ pasan de renglón. Atajos al
 *    empezar: "[] " tarea, "- " viñeta. El pin lo FIJA: aparece todos los días.
 *    Siempre arranca en un renglón exacto (y múltiplo de LINEA). Se mueve
 *    desde la manija.
 *  - `CapaRegla`: las líneas trazadas con la regla (SVG) y, con la regla en la
 *    mano, la superficie para trazar: se ve una regla de plástico siguiendo el
 *    trazo, la línea se endereza sola cerca de horizontal/vertical y la
 *    horizontal se apoya sobre el renglón más cercano.
 */
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { Check, GripVertical, List, ListTodo, Pin, PinOff } from 'lucide-react'
import { detectarAtajo, type BloqueTexto, type Trazo, type Tinta } from '@/lib/store/notebookStore'
import type { TonoPapel } from '@/lib/store/notebookUiStore'
import { LINEA, colorTinta } from './paper'

// ─── Renglón ────────────────────────────────────────────────────────────────

export type Enfoque = { id: string; donde: 'inicio' | 'fin' }

interface RenglonProps {
  bloque: BloqueTexto
  /** Hoja donde vive (un renglón fijado se ve en otras hojas pero se guarda en la suya). */
  origen: string
  /** Se está viendo en otra hoja porque está fijado. */
  prestado: boolean
  anchoHoja: number
  fuente: React.CSSProperties
  color: string
  acento: string
  enfocar: Enfoque['donde'] | null
  onEnfocado: () => void
  onCambiar: (origen: string, id: string, patch: Partial<Omit<BloqueTexto, 'id'>>) => void
  onBorrar: (origen: string, id: string) => void
  /** Enter: renglón nuevo abajo (de la misma clase si es lista) con lo que
   *  quedaba a la derecha del cursor. */
  onEnter: (bloque: BloqueTexto, alto: number, resto: string) => void
  /** Backspace en un renglón vacío: se borra y el foco sube. */
  onBorrarVacio: (origen: string, bloque: BloqueTexto) => void
  onNavegar: (id: string, dir: -1 | 1) => void
}

function RenglonBase({
  bloque, origen, prestado, anchoHoja, fuente, color, acento, enfocar, onEnfocado,
  onCambiar, onBorrar, onEnter, onBorrarVacio, onNavegar,
}: RenglonProps) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [mov, setMov] = useState<{ dx: number; dy: number } | null>(null)
  const ini = useRef<{ px: number; py: number } | null>(null)
  const tipo = bloque.tipo ?? 'texto'
  const sangria = tipo === 'tarea' ? 27 : tipo === 'vineta' ? 19 : 0
  const left = bloque.x * anchoHoja
  const ancho = Math.max(96, anchoHoja - left - 22)
  const cambiar = (patch: Partial<Omit<BloqueTexto, 'id'>>) => onCambiar(origen, bloque.id, patch)

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(LINEA, Math.ceil(el.scrollHeight / LINEA) * LINEA)}px`
  }, [bloque.texto, ancho, tipo])

  useLayoutEffect(() => {
    const el = area.current
    if (!enfocar || !el) return
    el.focus()
    const pos = enfocar === 'fin' ? el.value.length : 0
    el.setSelectionRange(pos, pos)
    onEnfocado()
  }, [enfocar, onEnfocado])

  const teclas = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const enInicio = el.selectionStart === 0 && el.selectionEnd === 0
    const enFin = el.selectionStart === el.value.length
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      // Enter en una tarea/viñeta vacía la vuelve texto (como en Notion).
      if (tipo !== 'texto' && !el.value.trim()) { cambiar({ tipo: 'texto', hecho: false }); return }
      // Como en Notion: lo que está a la derecha del cursor baja al renglón nuevo.
      const antes = el.value.slice(0, el.selectionStart)
      const resto = el.value.slice(el.selectionEnd)
      if (resto) cambiar({ texto: antes })
      onEnter(bloque, resto ? LINEA : el.offsetHeight, resto)
      return
    }
    if (e.key === 'Backspace' && enInicio) {
      if (tipo !== 'texto') { e.preventDefault(); cambiar({ tipo: 'texto', hecho: false }); return }
      if (!el.value) { e.preventDefault(); onBorrarVacio(origen, bloque); return }
    }
    if (e.key === 'ArrowUp' && enInicio) { e.preventDefault(); onNavegar(bloque.id, -1) }
    if (e.key === 'ArrowDown' && enFin) { e.preventDefault(); onNavegar(bloque.id, 1) }
  }

  const tachado = tipo === 'tarea' && bloque.hecho

  return (
    <div
      data-bloque={bloque.id}
      className="absolute group/bloque"
      style={{ left: left + (mov?.dx ?? 0), top: bloque.y + (mov?.dy ?? 0), width: ancho, zIndex: mov ? 25 : 10, opacity: mov ? 0.85 : 1 }}
    >
      {/* manija para moverlo */}
      <div
        data-manija
        className="absolute -left-[18px] top-[6px] w-4 h-[18px] grid place-items-center rounded cursor-grab active:cursor-grabbing opacity-0 group-hover/bloque:opacity-60 hover:!opacity-100 touch-none"
        style={{ color }}
        title="Arrastrá para mover este renglón"
        onPointerDown={(e) => {
          e.preventDefault(); e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          ini.current = { px: e.clientX, py: e.clientY }
          setMov({ dx: 0, dy: 0 })
        }}
        onPointerMove={(e) => { if (ini.current) setMov({ dx: e.clientX - ini.current.px, dy: e.clientY - ini.current.py }) }}
        onPointerUp={(e) => {
          if (!ini.current) return
          const dx = e.clientX - ini.current.px, dy = e.clientY - ini.current.py
          ini.current = null
          setMov(null)
          const nx = Math.min(anchoHoja - 96, Math.max(24, left + dx))
          const ny = Math.max(LINEA * 2, Math.round((bloque.y + dy) / LINEA) * LINEA)
          cambiar({ x: anchoHoja > 0 ? nx / anchoHoja : bloque.x, y: ny })
        }}
        onPointerCancel={() => { ini.current = null; setMov(null) }}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* pin de los fijados: siempre visible, así se sabe que viaja de día en día */}
      {bloque.fijo && (
        <Pin aria-label="Fijado" className="absolute -left-[34px] top-[8px] w-3.5 h-3.5 rotate-45 pointer-events-none group-hover/bloque:opacity-0" style={{ color: acento }} />
      )}

      {/* tilde o viñeta */}
      {tipo === 'tarea' && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => cambiar({ hecho: !bloque.hecho })}
          title={bloque.hecho ? 'Desmarcar' : 'Marcar como hecha'}
          aria-label={bloque.hecho ? 'Desmarcar tarea' : 'Marcar tarea como hecha'}
          className="absolute left-0 top-[6px] w-[18px] h-[18px] rounded-[5px] grid place-items-center transition-colors"
          style={{
            border: `1.7px solid ${bloque.hecho ? acento : color}`,
            background: bloque.hecho ? acento : 'transparent',
            opacity: bloque.hecho ? 1 : 0.75,
          }}
        >
          {bloque.hecho && <Check className="w-3 h-3 text-white" strokeWidth={3.2} />}
        </button>
      )}
      {tipo === 'vineta' && (
        <span aria-hidden className="absolute left-[4px] top-[12px] w-[6px] h-[6px] rounded-full" style={{ background: color, opacity: 0.85 }} />
      )}

      {/* barrita de formato: aparece con el renglón activo, a la derecha (ahí la línea de arriba suele estar vacía) */}
      <div
        className="absolute -top-[29px] right-1 hidden group-focus-within/bloque:flex items-center gap-0.5 px-1 py-0.5 rounded-lg shadow-lg border border-black/10 z-30"
        style={{ background: 'rgba(24,21,38,0.94)' }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <BotonFormato activo={tipo === 'tarea'} titulo="Tarea con tilde ( [] )" onClick={() => cambiar(tipo === 'tarea' ? { tipo: 'texto', hecho: false } : { tipo: 'tarea' })}><ListTodo className="w-3.5 h-3.5" /></BotonFormato>
        <BotonFormato activo={tipo === 'vineta'} titulo="Viñeta ( - )" onClick={() => cambiar(tipo === 'vineta' ? { tipo: 'texto' } : { tipo: 'vineta', hecho: false })}><List className="w-3.5 h-3.5" /></BotonFormato>
        <span className="w-px h-4 bg-white/15 mx-0.5" />
        <BotonFormato activo={!!bloque.fijo} titulo={bloque.fijo ? 'Desfijar (deja de aparecer en los otros días)' : 'Fijar: aparece todos los días'} onClick={() => cambiar({ fijo: !bloque.fijo })}>
          {bloque.fijo ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </BotonFormato>
        {prestado && <span className="text-[10px] text-zinc-400 pl-1 pr-1.5 whitespace-nowrap">fijado</span>}
      </div>

      <textarea
        ref={area}
        value={bloque.texto}
        onChange={(e) => {
          const v = e.target.value
          // Atajos al empezar el renglón: "[] " tarea, "- " viñeta.
          if (tipo === 'texto') {
            const a = detectarAtajo(v)
            if (a) { cambiar({ texto: a.resto, tipo: a.tipo, hecho: a.hecho }); return }
          }
          cambiar({ texto: v })
        }}
        onKeyDown={teclas}
        // Un renglón suelto que quedó vacío (y sin tilde ni viñeta) no deja nada.
        onBlur={(e) => { if (!e.target.value.trim() && tipo === 'texto' && !bloque.fijo) onBorrar(origen, bloque.id) }}
        spellCheck={false}
        className="block w-full resize-none bg-transparent outline-none overflow-hidden p-0"
        style={{
          ...fuente,
          lineHeight: `${LINEA}px`,
          color,
          caretColor: acento,
          touchAction: 'pan-y',
          paddingLeft: sangria,
          textDecoration: tachado ? 'line-through' : undefined,
          textDecorationColor: tachado ? acento : undefined,
          textDecorationThickness: tachado ? '1.5px' : undefined,
          opacity: tachado ? 0.5 : 1,
          transition: 'opacity 160ms',
        }}
      />
    </div>
  )
}

export const Renglon = memo(RenglonBase)

function BotonFormato({ activo, titulo, onClick, children }: { activo: boolean; titulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={titulo} aria-label={titulo}
      className={`w-6 h-6 grid place-items-center rounded-md transition-colors ${activo ? 'bg-violet-500 text-white' : 'text-zinc-300 hover:bg-white/10'}`}>
      {children}
    </button>
  )
}

// ─── Regla ──────────────────────────────────────────────────────────────────

interface Punto { x: number; y: number }

/** Endereza el trazo: cerca de horizontal → horizontal apoyada en el renglón
 *  más cercano; cerca de vertical → vertical. Puro (con test). */
export function enderezar(a: Punto, b: Punto, tolGrados = 6): { a: Punto; b: Punto } {
  const ang = Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)
  const casiH = ang < tolGrados || ang > 180 - tolGrados
  const casiV = Math.abs(ang - 90) < tolGrados
  if (casiH) {
    // El renglón está dibujado en el último px de cada LINEA.
    const r = Math.round(a.y / LINEA) * LINEA - 0.5
    const y = Math.abs(r - a.y) <= 7 ? r : a.y
    return { a: { x: a.x, y }, b: { x: b.x, y } }
  }
  if (casiV) return { a, b: { x: a.x, y: b.y } }
  return { a, b }
}

interface CapaReglaProps {
  trazos: Trazo[]
  ancho: number
  alto: number
  tono: TonoPapel
  activa: boolean
  tinta: Tinta
  onTrazar: (t: Omit<Trazo, 'id'>) => void
  onBorrar: (id: string) => void
}

function CapaReglaBase({ trazos, ancho, alto, tono, activa, tinta, onTrazar, onBorrar }: CapaReglaProps) {
  const [dib, setDib] = useState<{ a: Punto; b: Punto } | null>(null)
  // El inicio vive en un ref: con eventos seguidos el estado del render puede
  // ir atrasado y se perdía el comienzo del trazo.
  const inicio = useRef<Punto | null>(null)
  const sup = useRef<HTMLDivElement>(null)
  const local = (e: React.PointerEvent) => {
    const r = sup.current!.getBoundingClientRect()
    return { x: Math.min(ancho, Math.max(0, e.clientX - r.left)), y: Math.max(0, e.clientY - r.top) }
  }
  const linea = dib ? enderezar(dib.a, dib.b) : null
  const largo = linea ? Math.hypot(linea.b.x - linea.a.x, linea.b.y - linea.a.y) : 0
  const ang = linea ? Math.atan2(linea.b.y - linea.a.y, linea.b.x - linea.a.x) : 0

  return (
    <>
      {activa && (
        <div
          ref={sup}
          data-regla
          className="absolute inset-0 z-[35] cursor-crosshair touch-none"
          onPointerDown={(e) => {
            e.preventDefault(); e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            const p = local(e)
            inicio.current = p
            setDib({ a: p, b: p })
          }}
          onPointerMove={(e) => { if (inicio.current) setDib({ a: inicio.current, b: local(e) }) }}
          onPointerUp={(e) => {
            e.stopPropagation()
            const ini = inicio.current
            inicio.current = null
            if (!ini) return
            const { a, b } = enderezar(ini, local(e))
            setDib(null)
            if (Math.hypot(b.x - a.x, b.y - a.y) < 8 || ancho <= 0) return
            onTrazar({ x1: a.x / ancho, y1: a.y, x2: b.x / ancho, y2: b.y, tinta })
          }}
          onPointerCancel={() => { inicio.current = null; setDib(null) }}
        />
      )}

      <svg className="absolute left-0 top-0 z-[36] overflow-visible" width={ancho} height={alto} style={{ pointerEvents: 'none' }}>
        {trazos.map((t) => {
          const c = colorTinta(t.tinta, tono)
          return (
            <g key={t.id} className="group/trazo">
              <line x1={t.x1 * ancho} y1={t.y1} x2={t.x2 * ancho} y2={t.y2} stroke={c} strokeWidth={1.8} strokeLinecap="round" opacity={0.92} />
              {activa && (
                // Zona ancha e invisible para poder tocar la línea y borrarla.
                <line
                  x1={t.x1 * ancho} y1={t.y1} x2={t.x2 * ancho} y2={t.y2}
                  stroke="#e5484d" strokeOpacity={0} strokeWidth={14} strokeLinecap="round"
                  className="cursor-pointer hover:[stroke-opacity:0.25]"
                  style={{ pointerEvents: 'stroke' }}
                  onClick={() => onBorrar(t.id)}
                >
                  <title>Tocá para borrar esta línea</title>
                </line>
              )}
            </g>
          )
        })}
        {linea && largo > 2 && (
          <line x1={linea.a.x} y1={linea.a.y} x2={linea.b.x} y2={linea.b.y} stroke={colorTinta(tinta, tono)} strokeWidth={1.8} strokeLinecap="round" />
        )}
      </svg>

      {/* la regla de plástico, apoyada sobre el trazo mientras se dibuja */}
      {linea && largo > 2 && (
        <div aria-hidden className="absolute z-[37] pointer-events-none" style={{
          left: linea.a.x, top: linea.a.y,
          width: largo + 48, height: 38,
          transform: `rotate(${ang}rad) translate(-24px, -40px)`,
          transformOrigin: '0 0',
          borderRadius: 4,
          background: [
            'repeating-linear-gradient(90deg, rgba(20,30,60,0.55) 0 1px, transparent 1px 50px) left bottom / 100% 15px no-repeat',
            'repeating-linear-gradient(90deg, rgba(20,30,60,0.45) 0 1px, transparent 1px 10px) left bottom / 100% 8px no-repeat',
            'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(225,235,255,0.40))',
          ].join(','),
          backgroundPosition: '24px bottom, 24px bottom, 0 0',
          border: '1px solid rgba(90,110,160,0.35)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.7)',
        }} />
      )}
    </>
  )
}

export const CapaRegla = memo(CapaReglaBase)
