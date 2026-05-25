import { Suspense } from 'react'
import { ProjectionPage } from '@/components/projection/ProjectionPage'

/** Wrapping in Suspense is required because ProjectionPage uses
 *  useSearchParams() to honor `?level=X&period=Y` query params from
 *  the SPI breadcrumb. Without this, Next.js bails out of static
 *  prerendering with "useSearchParams() should be wrapped in a
 *  suspense boundary". The fallback below is what shows during the
 *  brief hydration window. */
export default function Proyeccion() {
  return (
    <Suspense fallback={
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="h-8 w-48 bg-zinc-900 rounded animate-pulse mb-3" />
        <div className="h-4 w-72 bg-zinc-900 rounded animate-pulse" />
      </div>
    }>
      <ProjectionPage />
    </Suspense>
  )
}
