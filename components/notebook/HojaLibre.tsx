'use client'
/**
 * Lo que se escribe y se dibuja "en cualquier lado" de la hoja:
 *  - `Bloque`: texto en cualquier renglón y a cualquier altura de la línea.
 *    Siempre arranca en un renglón exacto (y múltiplo de LINEA), así cae sobre
 *    la línea igual que el texto de arriba. Se mueve desde la manija.
 *  - `CapaRegla`: las líneas trazadas con la regla (SVG) y, con la regla en la
 *    mano, la superficie para trazar: se ve una regla de plástico siguiendo el
 *    trazo, la línea se endereza sola cerca de horizontal/vertical y la
 *    horizontal se apoya sobre el renglón más cercano.
 */
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { BloqueTexto, Trazo, Tinta } from '@/lib/store/notebookStore'
import type { TonoPapel } from '@/lib/store/notebookUiStore'
import { LINEA, colorTinta } from './paper'

// ─── Bloque de texto ────────────────────────────────────────────────────────

interface BloqueProps {
  bloque: BloqueTexto
  anchoHoja: number
  fuente: React.CSSProperties
  color: string
  enfocar: boolean
  onEnfocado: () => void
  onCambiar: (id: string, patch: Partial<Omit<BloqueTexto, 'id'>>) => void
  onBorrar: (id: string) => void
}

function BloqueBase({ bloque, anchoHoja, fuente, color, enfocar, onEnfocado, onCambiar, onBorrar }: BloqueProps) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [mov, setMov] = useState<{ dx: number; dy: number } | null>(null)
  const ini = useRef<{ px: number; py: number } | null>(null)
  const left = bloque.x * anchoHoja
  const ancho = Math.max(96, anchoHoja - left - 22)

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(LINEA, Math.ceil(el.scrollHeight / LINEA) * LINEA)}px`
  }, [bloque.texto, ancho])

  useLayoutEffect(() => {
    if (enfocar && area.current) { area.current.focus(); onEnfocado() }
  }, [enfocar, onEnfocado])

  return (
    <div
      data-bloque={bloque.id}
      className="absolute group/bloque"
      style={{ left: left + (mov?.dx ?? 0), top: bloque.y + (mov?.dy ?? 0), width: ancho, zIndex: mov ? 25 : 10, opacity: mov ? 0.85 : 1 }}
    >
      <div
        className="absolute -left-[18px] top-[6px] w-4 h-[18px] grid place-items-center rounded cursor-grab active:cursor-grabbing opacity-0 group-hover/bloque:opacity-60 group-focus-within/bloque:opacity-60 hover:!opacity-100 touch-none"
        style={{ color }}
        title="Arrastrá para mover este texto"
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
          onCambiar(bloque.id, { x: anchoHoja > 0 ? nx / anchoHoja : bloque.x, y: ny })
        }}
        onPointerCancel={() => { ini.current = null; setMov(null) }}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <textarea
        ref={area}
        value={bloque.texto}
        onChange={(e) => onCambiar(bloque.id, { texto: e.target.value })}
        // Un texto suelto que quedó vacío no deja nada en la hoja.
        onBlur={(e) => { if (!e.target.value.trim()) onBorrar(bloque.id) }}
        spellCheck={false}
        className="block w-full resize-none bg-transparent outline-none overflow-hidden p-0"
        style={{ ...fuente, lineHeight: `${LINEA}px`, color, caretColor: '#7457e0', touchAction: 'pan-y' }}
      />
    </div>
  )
}

export const Bloque = memo(BloqueBase)

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
