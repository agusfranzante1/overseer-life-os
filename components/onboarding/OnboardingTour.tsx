'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Compass, ChevronRight, ChevronLeft, X, Check } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'
import { TOUR_STEPS } from './tourSteps'

/**
 * Recorrido de bienvenida. Se muestra UNA vez, la primera que entrás con una
 * cuenta nueva.
 *
 * Va navegando de verdad a cada sección mientras avanza, así ves la pantalla
 * real detrás del cartel en vez de una captura. El cartel es flotante y no
 * bloquea el fondo a propósito: la idea es que mires la app, no el cartel.
 */
export function OnboardingTour() {
  const onboardingDone = useAppStore((s) => s.onboardingDone)
  const setOnboardingDone = useAppStore((s) => s.setOnboardingDone)
  const router = useRouter()

  const [step, setStep] = useState(0)
  // `onboardingDone` ya viene bien en el primer render del cliente (zustand
  // rehidrata de localStorage al importar el módulo), así que se deriva
  // directo en vez de encenderlo con un effect.
  const open = !onboardingDone
  const current = TOUR_STEPS[step]

  /**
   * Avanzar/retroceder un paso. La navegación pasa ACÁ, en el click, y NO en
   * un effect.
   *
   * Con el effect (`if (open && href) router.push(href)`) el recorrido se
   * llevaba puesta la navegación del usuario: bastaba con que `open` pasara a
   * true — por ejemplo cuando un pull de Supabase traía `onboardingDone: false`
   * de otro dispositivo — para que te sacara de la sección donde estabas y te
   * devolviera al Panel (el paso 0). Lo mismo al entrar directo a /tasks con el
   * recorrido abierto: el effect corría al montar y te rebotaba al Panel.
   *
   * Ahora el recorrido solo navega cuando vos tocás Siguiente o Atrás.
   */
  const go = (delta: 1 | -1) => {
    const next = step + delta
    const target = TOUR_STEPS[next]
    if (!target) return
    setStep(next)
    if (target.href) router.push(target.href)
  }

  const finish = () => setOnboardingDone(true)

  if (!open || !current) return null

  const isLast = step === TOUR_STEPS.length - 1

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        // Flotante abajo a la derecha, por encima de todo pero sin tapar la
        // pantalla: se puede seguir viendo la sección de la que se habla.
        className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:w-[380px]"
      >
        <div className="bg-zinc-900 border border-indigo-500/40 rounded-2xl shadow-2xl overflow-hidden">
          {/* Progreso */}
          <div className="h-1 bg-zinc-800">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
            />
          </div>

          <div className="p-4">
            <div className="flex items-start gap-2.5 mb-2">
              <Compass className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <h2 className="text-sm font-bold text-zinc-100 flex-1">{current.title}</h2>
              <button
                onClick={finish}
                title="Saltear el recorrido"
                className="text-zinc-600 hover:text-zinc-300 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">{current.body}</p>

            {current.tip && (
              <p className="text-[11px] text-indigo-300/90 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-2.5 py-2 mt-2.5 leading-relaxed">
                {current.tip}
              </p>
            )}

            <div className="flex items-center gap-2 mt-4">
              <span className="text-[10px] text-zinc-600 tabular-nums flex-1">
                {step + 1} / {TOUR_STEPS.length}
              </span>
              {step > 0 && (
                <button
                  onClick={() => go(-1)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Atrás
                </button>
              )}
              {isLast ? (
                <button
                  onClick={finish}
                  className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Empezar
                </button>
              ) : (
                <button
                  onClick={() => go(1)}
                  className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  Siguiente <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
