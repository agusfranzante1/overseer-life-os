'use client'

/** Next.js automatic error boundary for the /spi route. Shown instead of
 *  the generic "This page couldn't load" when something throws while
 *  rendering. Gives the user a clear path forward (reload, reset SPI
 *  storage) instead of a dead page. */
export default function SPIError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const resetSPIStorage = () => {
    try {
      localStorage.removeItem('overseer-spi')
    } catch { /* ignore */ }
    // Hard reload to re-hydrate fresh from defaults.
    window.location.reload()
  }
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="bg-zinc-950 border border-red-500/30 rounded-2xl p-6">
        <h1 className="text-lg font-semibold text-zinc-100 mb-2">
          Algo se rompió cargando SPI
        </h1>
        <p className="text-sm text-zinc-400 mb-4">
          {error.message || 'Error desconocido al renderizar la pestaña.'}
        </p>
        <details className="text-[10px] text-zinc-600 mb-4 font-mono">
          <summary className="cursor-pointer hover:text-zinc-400">stack trace</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all bg-zinc-900 rounded p-2 overflow-x-auto">
            {error.stack || '(no stack)'}
          </pre>
          {error.digest && <p className="mt-1">digest: {error.digest}</p>}
        </details>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm transition-colors"
          >
            Reintentar
          </button>
          <button
            onClick={resetSPIStorage}
            className="px-3 py-2 bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-300 rounded-lg text-sm transition-colors"
            title="Borra el state local de SPI (sesiones se mantienen en Supabase) y recarga"
          >
            Resetear cache SPI
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-4">
          Si esto pasa repetidamente, pasame el stack trace de arriba.
        </p>
      </div>
    </div>
  )
}
