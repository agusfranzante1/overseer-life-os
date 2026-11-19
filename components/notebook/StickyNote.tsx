'use client'
/**
 * Una sticky note pegada en la hoja. Se arrastra por la tira de arriba (con
 * pointer capture, así funciona igual adentro de la ventana Picture-in-Picture)
 * y la posición se guarda recién al soltar: guardar en cada movimiento
 * sincronizaría la hoja entera decenas de veces por segundo.
 */
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { Pin, X } from 'lucide-react'
import { COLORES_STICKY, type Sticky } from '@/lib/store/notebookStore'
import { STICKY } from './paper'

export const ANCHO_STICKY = 176

interface Props {
  sticky: Sticky
  /** Ancho de la hoja en px (para pasar de fracción a px y de vuelta). */
  anchoHoja: number
  onCambiar: (id: string, patch: Partial<Omit<Sticky, 'id'>>) => void
  onBorrar: (id: string) => void
}

function StickyNoteBase({ sticky, anchoHoja, onCambiar, onBorrar }: Props) {
  const c = STICKY[sticky.color]
  const ancho = Math.min(ANCHO_STICKY, Math.max(140, anchoHoja * 0.46))
  const maxX = Math.max(0, anchoHoja - ancho)
  const [arrastre, setArrastre] = useState<{ dx: number; dy: number } | null>(null)
  const inicio = useRef<{ px: number; py: number } | null>(null)
  const texto = useRef<HTMLTextAreaElement>(null)

  // El textarea crece con lo que se escribe: una sticky no scrollea.
  useLayoutEffect(() => {
    const el = texto.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(96, el.scrollHeight)}px`
  }, [sticky.texto, ancho])

  const left = Math.min(maxX, sticky.x * anchoHoja) + (arrastre?.dx ?? 0)
  const top = sticky.y + (arrastre?.dy ?? 0)

  const siguienteColor = () => {
    const i = COLORES_STICKY.indexOf(sticky.color)
    onCambiar(sticky.id, { color: COLORES_STICKY[(i + 1) % COLORES_STICKY.length] })
  }

  return (
    <div
      className="absolute group/sticky select-none"
      data-sticky={sticky.id}
      style={{
        left, top, width: ancho, zIndex: arrastre ? 30 : 20,
        transform: `rotate(${arrastre ? 0 : sticky.rot}deg) scale(${arrastre ? 1.04 : 1})`,
        transition: arrastre ? 'none' : 'transform 160ms ease',
        filter: arrastre
          ? 'drop-shadow(0 18px 22px rgba(0,0,0,0.30))'
          : 'drop-shadow(0 6px 8px rgba(0,0,0,0.16)) drop-shadow(0 1px 1px rgba(0,0,0,0.12))',
      }}
    >
      {/* Cinta adhesiva */}
      <div
        aria-hidden
        className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-16 h-5 rounded-[2px] pointer-events-none"
        style={{ background: 'rgba(255,255,255,0.45)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', transform: 'translateX(-50%) rotate(-3deg)' }}
      />
      <div className="rounded-[3px] overflow-hidden" style={{ background: c.fondo }}>
        <div
          className="h-6 flex items-center justify-end gap-1 px-1.5 cursor-grab active:cursor-grabbing touch-none"
          style={{ background: c.tira }}
          title="Arrastrá para moverla"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            inicio.current = { px: e.clientX, py: e.clientY }
            setArrastre({ dx: 0, dy: 0 })
          }}
          onPointerMove={(e) => {
            if (!inicio.current) return
            setArrastre({ dx: e.clientX - inicio.current.px, dy: e.clientY - inicio.current.py })
          }}
          onPointerUp={(e) => {
            if (!inicio.current) return
            const dx = e.clientX - inicio.current.px
            const dy = e.clientY - inicio.current.py
            inicio.current = null
            setArrastre(null)
            if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return
            const nx = Math.min(maxX, Math.max(0, Math.min(maxX, sticky.x * anchoHoja) + dx))
            onCambiar(sticky.id, {
              x: anchoHoja > 0 ? nx / anchoHoja : 0,
              y: Math.max(0, sticky.y + dy),
            })
          }}
          onPointerCancel={() => { inicio.current = null; setArrastre(null) }}
        >
          {/* Fijar: la sticky aparece todos los días. Fijada, el pin se ve siempre. */}
          <button
            onClick={() => onCambiar(sticky.id, { fijo: !sticky.fijo })}
            className={`mr-auto w-5 h-5 grid place-items-center rounded hover:bg-black/10 transition-opacity ${sticky.fijo ? 'opacity-100' : 'opacity-0 group-hover/sticky:opacity-70'}`}
            style={{ color: c.tinta }}
            title={sticky.fijo ? 'Desfijar (deja de aparecer en los otros días)' : 'Fijar: aparece todos los días'}
            aria-label={sticky.fijo ? 'Desfijar sticky' : 'Fijar sticky'}
          >
            <Pin className={`w-3.5 h-3.5 ${sticky.fijo ? 'rotate-45 fill-current' : ''}`} />
          </button>
          <button
            onClick={siguienteColor}
            className="w-3.5 h-3.5 rounded-full border border-black/15 opacity-0 group-hover/sticky:opacity-100 transition-opacity"
            style={{ background: STICKY[COLORES_STICKY[(COLORES_STICKY.indexOf(sticky.color) + 1) % COLORES_STICKY.length]].fondo }}
            title="Cambiar color"
            aria-label="Cambiar color"
          />
          <button
            onClick={() => onBorrar(sticky.id)}
            className="w-5 h-5 grid place-items-center rounded opacity-0 group-hover/sticky:opacity-100 hover:bg-black/10 transition-opacity"
            style={{ color: c.tinta }}
            title="Despegar (borrar)"
            aria-label="Borrar nota"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <textarea
          ref={texto}
          value={sticky.texto}
          onChange={(e) => onCambiar(sticky.id, { texto: e.target.value })}
          placeholder="Anotá…"
          spellCheck={false}
          className="block w-full resize-none bg-transparent outline-none px-3 pt-1.5 pb-3 overflow-hidden placeholder:opacity-40 select-text"
          style={{ color: c.tinta, fontFamily: 'var(--font-script), cursive', fontSize: 23, lineHeight: '25px' }}
        />
      </div>
    </div>
  )
}

export const StickyNote = memo(StickyNoteBase)
