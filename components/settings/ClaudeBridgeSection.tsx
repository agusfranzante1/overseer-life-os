'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plug, Copy, CheckCheck, Loader2, Trash2, Plus, AlertCircle, Brain, X } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'

/** Configuración → Conexión con Claude.
 *
 *  Acá el usuario genera el token con el que Claude entra a su cuenta desde
 *  afuera (Claude Code / claude.ai), lee tareas y agenda, y le escribe el plan
 *  del día. NO usa la API key de Anthropic: el razonamiento corre en la
 *  suscripción del usuario, así que no gasta créditos por uso.
 *
 *  También muestra el "perfil del planificador" — lo que Claude fue
 *  aprendiendo. Es editable a mano a propósito: si el usuario no puede leer y
 *  borrar lo aprendido, esto es una caja negra que se ensucia sola. */

interface TokenRow {
  ref: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

export function ClaudeBridgeSection() {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  const plannerProfile = useAppStore((s) => s.plannerProfile)
  const setPlannerProfile = useAppStore((s) => s.setPlannerProfile)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/mcp/tokens')
      const d = await r.json()
      if (d.ok) { setTokens(d.tokens ?? []); setError(null) }
      else setError(d.detail ?? d.error ?? 'No se pudo leer los tokens.')
    } catch {
      setError('No se pudo contactar al servidor.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setOrigin(window.location.origin)
    void load()
  }, [load])

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const r = await fetch('/api/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || 'Claude' }),
      })
      const d = await r.json()
      if (d.ok) { setFresh(d.token); setLabel(''); await load() }
      else setError(d.detail ?? d.error ?? 'No se pudo generar el token.')
    } catch {
      setError('No se pudo contactar al servidor.')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (ref: string) => {
    await fetch(`/api/mcp/tokens?ref=${encodeURIComponent(ref)}`, { method: 'DELETE' }).catch(() => {})
    await load()
  }

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const mcpUrl = origin ? `${origin}/api/mcp` : ''
  const addCmd = fresh && origin
    ? `claude mcp add --transport http overseer ${mcpUrl} --header "Authorization: Bearer ${fresh}"`
    : ''

  const rules = plannerProfile.rules ?? []

  const removeRule = (i: number) => {
    setPlannerProfile({ ...plannerProfile, rules: rules.filter((_, j) => j !== i) })
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="w-5 h-5 text-sky-400" />
        <h2 className="text-sm font-bold text-white">Conexión con Claude</h2>
      </div>

      <p className="text-xs text-zinc-400 leading-relaxed">
        Genera un token para que Claude entre a tu cuenta desde afuera: lee tus tareas, tus huecos
        libres de calendario, y te escribe el <strong className="text-zinc-300">Plan de hoy</strong> que
        después ves en el Panel desde cualquier dispositivo. Corre en tu suscripción de Claude —
        no gasta créditos de la API.
      </p>

      {error && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200 leading-relaxed">{error}</p>
        </div>
      )}

      {/* Token recién creado — se muestra UNA sola vez */}
      {fresh && (
        <div className="bg-sky-500/[0.07] border border-sky-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-sky-200 leading-relaxed">
              <strong>Copialo ahora.</strong> Es la única vez que se muestra — después queda guardado
              solo su hash.
            </p>
            <button onClick={() => setFresh(null)} className="shrink-0 text-zinc-500 hover:text-white" title="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2">
            <code className="flex-1 text-sky-300 text-[11px] break-all font-mono">{fresh}</code>
            <button onClick={() => copy(fresh, 'token')} className="shrink-0 text-zinc-400 hover:text-white" title="Copiar token">
              {copied === 'token' ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Conectar desde Claude Code
            </label>
            <div className="flex items-start gap-2 mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2">
              <code className="flex-1 text-emerald-400 text-[10px] break-all font-mono leading-relaxed">{addCmd}</code>
              <button onClick={() => copy(addCmd, 'cmd')} className="shrink-0 text-zinc-400 hover:text-white" title="Copiar comando">
                {copied === 'cmd' ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* URL del bridge */}
      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">URL del bridge</label>
        <div className="flex items-center gap-2 mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2">
          <code className="flex-1 text-emerald-400 text-[11px] break-all">{mcpUrl || 'cargando…'}</code>
          <button onClick={() => copy(mcpUrl, 'url')} className="shrink-0 text-zinc-400 hover:text-white" title="Copiar URL">
            {copied === 'url' ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Alta */}
      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Token nuevo</label>
        <div className="flex items-center gap-2 mt-1">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
            placeholder="Nombre (ej. Claude Code PC)"
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/50"
          />
          <button
            onClick={create}
            disabled={creating}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/15 border border-sky-500/30 hover:bg-sky-500/25 disabled:opacity-40 text-sky-300 text-xs font-bold"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Generar
          </button>
        </div>
      </div>

      {/* Tokens activos */}
      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Tokens activos</label>
        {loading ? (
          <p className="text-xs text-zinc-500 mt-1">Cargando…</p>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-zinc-600 mt-1 italic">Ninguno todavía.</p>
        ) : (
          <div className="space-y-1.5 mt-1">
            {tokens.map((t) => (
              <div key={t.ref} className="flex items-center gap-2.5 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-200 font-medium truncate">{t.label}</p>
                  <p className="text-[10px] text-zinc-600 font-mono">
                    {t.ref}… · {t.lastUsedAt ? `usado ${new Date(t.lastUsedAt).toLocaleString()}` : 'nunca usado'}
                  </p>
                </div>
                <button
                  onClick={() => revoke(t.ref)}
                  className="shrink-0 text-zinc-600 hover:text-rose-400 transition-colors"
                  title="Revocar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Perfil del planificador — lo aprendido */}
      <div className="pt-2 border-t border-zinc-800">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-4 h-4 text-violet-400" />
          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Lo que Claude aprendió
          </label>
        </div>

        {plannerProfile.workingHours && (
          <p className="text-[11px] text-zinc-500 mb-2">
            Horario de trabajo:{' '}
            <span className="text-zinc-300 font-mono">
              {plannerProfile.workingHours.start}–{plannerProfile.workingHours.end}
            </span>
          </p>
        )}

        {rules.length === 0 ? (
          <p className="text-xs text-zinc-600 italic">
            Todavía nada. A medida que le digas cómo te gusta organizarte, las reglas aparecen acá y
            las podés borrar.
          </p>
        ) : (
          <div className="space-y-1">
            {rules.map((r, i) => (
              <div key={i} className="group flex items-start gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5">
                <span className="flex-1 text-[11px] text-zinc-300 leading-relaxed">{r}</span>
                <button
                  onClick={() => removeRule(i)}
                  className="shrink-0 mt-0.5 text-zinc-700 hover:text-rose-400 transition-colors"
                  title="Borrar regla"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
