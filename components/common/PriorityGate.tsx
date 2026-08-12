'use client'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, ArrowRight } from 'lucide-react'
import Link from 'next/link'

/**
 * Wrapper visual de bloqueo por prioridades — la MISMA reja que ya tenía la
 * card "Tu día" del Panel, ahora reutilizable en cualquier pantalla (Task
 * Manager, Calendario, …).
 *
 * Es UI PURA y props-driven: NO decide si hay acceso. Esa decisión (la única
 * fuente de verdad) vive en el hook `usePriorityGate()`; quien envuelve pasa
 * `locked` / `doneCount` / `total`. Así hay UN solo lugar donde se calcula el
 * acceso y UN solo lugar donde se dibuja el bloqueo — no tres sistemas.
 *
 * Comportamiento cuando `locked`:
 *  - el contenido de abajo se difumina, se deshabilita al puntero y sale del
 *    árbol de accesibilidad (`aria-hidden`) → queda VISIBLE pero intocable;
 *  - encima aparece el overlay violeta con el mensaje y el progreso;
 *  - un CTA lleva al Panel, que es donde se completan las prioridades (por eso
 *    el overlay cubre el contenido, no el sidebar).
 */
export interface PriorityGateProps {
  locked: boolean
  doneCount: number
  total: number
  /** Qué se desbloquea, para el mensaje. Ej: "tus tareas", "tu calendario". */
  label?: string
  /** Dónde se completan las prioridades. Default: el Panel. */
  ctaHref?: string
  ctaLabel?: string
  /** Mostrar el botón "Ir al Panel". En el propio Panel sobra (ya estás ahí),
   *  así que la card "Tu día" lo apaga. */
  showCta?: boolean
  /** Radio del recorte del overlay, para que matchee la caja que envuelve. */
  rounded?: string
  /** Clases del contenedor raíz. Para gatear una PÁGINA entera pasar `h-full`
   *  así el overlay cubre todo el alto disponible (no solo el contenido). */
  className?: string
  /** Clases del wrapper del contenido (el que se difumina). Para páginas full
   *  height pasar `h-full` así el layout de adentro no colapsa al bloquear. */
  contentClassName?: string
  children: ReactNode
}

export function PriorityGate({
  locked,
  doneCount,
  total,
  label = 'esta sección',
  ctaHref = '/dashboard',
  ctaLabel = 'Ir al Panel',
  showCta = true,
  rounded = 'rounded-2xl',
  className = '',
  contentClassName = '',
  children,
}: PriorityGateProps) {
  return (
    <div className={`relative ${className} ${locked ? `overflow-hidden ${rounded}` : ''}`}>
      {/* Contenido: visible siempre, pero difuminado e intocable si está trabado. */}
      <div
        className={`${contentClassName} ${locked ? 'blur-[6px] pointer-events-none select-none' : ''}`}
        aria-hidden={locked}
        // `inert` (React 19) deja el subárbol fuera de foco/tab además del
        // puntero. `|| undefined` evita renderizar inert="false".
        inert={locked || undefined}
      >
        {children}
      </div>

      <AnimatePresence>
        {locked && (
          <motion.div
            key="priority-gate-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // Velo violeta/lila coherente con el gate del Panel. `absolute
            // inset-0` cubre exactamente el contenido envuelto (no el sidebar).
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-center px-6"
            style={{
              background: `
                radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--app-accent) 14%, transparent), transparent 60%),
                color-mix(in srgb, var(--app-bg) 55%, transparent)
              `,
              backdropFilter: 'blur(2px)',
            }}
          >
            <div className="w-14 h-14 rounded-full bg-violet-500/15 border border-violet-500/40 flex items-center justify-center shadow-[0_0_30px_-6px_rgba(139,92,246,0.6)]">
              <Lock className="w-6 h-6 text-violet-300" />
            </div>
            <p className="text-base font-semibold text-zinc-100 max-w-xs">
              Completá tus prioridades para desbloquear {label}
            </p>
            <p className="text-xs text-violet-300/80 font-mono tabular-nums">
              {doneCount}/{total} prioridades hechas
            </p>
            {showCta && (
              <Link
                href={ctaHref}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/15 border border-violet-500/40 hover:bg-violet-500/25 active:bg-violet-500/30 text-sm font-semibold text-violet-200 transition-colors"
              >
                {ctaLabel} <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
