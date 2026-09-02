import { NextResponse } from 'next/server'

/** Qué build está DEPLOYADO ahora mismo.
 *
 *  Se compara contra el que muestra la app en Configuración → si difieren, esa
 *  pestaña está corriendo código viejo y hay que recargarla. Suena menor y no
 *  lo es: una pestaña con un build viejo no tiene los arreglos del sync y
 *  puede deshacer borrados o pisar preferencias (ver BASE nº3).
 *
 *  Público a propósito: no expone nada sensible y tiene que poder consultarse
 *  sin token para diagnosticar. */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev',
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
    now: new Date().toISOString(),
  })
}
