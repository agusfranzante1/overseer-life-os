'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Bot, Eye, EyeOff, Check, X, Loader2, ExternalLink, AlertCircle, Calendar, Copy, CheckCheck, Link2, Link2Off } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'

const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5',       label: 'Claude Haiku 4.5',  hint: 'Más barato y rápido — recomendado para chat/intents' },
  { id: 'claude-sonnet-4-5',      label: 'Claude Sonnet 4.5', hint: 'Más inteligente, más caro' },
  { id: 'claude-opus-4-5',        label: 'Claude Opus 4.5',   hint: 'El más potente, más caro aún' },
]

// ─── Google Calendar section ──────────────────────────────────────────────────

function GoogleCalendarSection() {
  const [redirectUri, setRedirectUri] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasCredentials, setHasCredentials] = useState(false)
  const [connected, setConnected] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setRedirectUri(`${window.location.origin}/api/auth/google/callback`)
    fetch('/api/auth/google/credentials')
      .then((r) => r.json())
      .then((d) => {
        setHasCredentials(d.hasCredentials ?? false)
        setConnected(d.connected ?? false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const copyUri = async () => {
    await navigator.clipboard.writeText(redirectUri).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const saveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return
    setSaving(true)
    setSaveResult(null)
    try {
      const res = await fetch('/api/auth/google/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      })
      const d = await res.json()
      if (d.ok) {
        setHasCredentials(true)
        setSaveResult({ ok: true, msg: 'Credenciales guardadas. Ahora podés conectar tu cuenta.' })
        setClientSecret('')
      } else {
        setSaveResult({ ok: false, msg: d.error ?? 'Error al guardar' })
      }
    } catch (e) {
      setSaveResult({ ok: false, msg: e instanceof Error ? e.message : 'Error' })
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    try {
      await fetch('/api/auth/google/disconnect', { method: 'POST' })
      setConnected(false)
    } catch { /* ignore */ }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Calendar className="w-5 h-5 text-blue-400" />
        <h2 className="text-sm font-bold text-white">Google Calendar</h2>
        {!loading && (
          <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
            connected
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
          }`}>
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        )}
      </div>

      {/* Instructions */}
      <div className="space-y-3">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Para conectar Google Calendar necesitás crear tu propio proyecto OAuth en Google Cloud.
          Cada usuario usa sus propias credenciales — tus datos de calendario nunca pasan por ningún servidor compartido.
        </p>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2.5 text-xs">
          <p className="font-bold text-zinc-300 uppercase tracking-wider text-[10px]">Paso a paso</p>

          <div className="space-y-2 text-zinc-400">
            <p><span className="text-indigo-400 font-bold">1.</span>{' '}
              Ir a{' '}
              <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
                console.cloud.google.com <ExternalLink className="w-3 h-3" />
              </a>
              {' '}y crear un proyecto nuevo (o usar uno existente).
            </p>

            <p><span className="text-indigo-400 font-bold">2.</span>{' '}
              Ir a <strong className="text-zinc-300">APIs & Services → Library</strong>, buscar{' '}
              <strong className="text-zinc-300">Google Calendar API</strong> y habilitarla.
            </p>

            <p><span className="text-indigo-400 font-bold">3.</span>{' '}
              Ir a <strong className="text-zinc-300">APIs & Services → OAuth consent screen</strong>.
              Elegir <strong className="text-zinc-300">External</strong>, completar nombre de app y email.
              En Scopes agregar <code className="text-emerald-400 bg-zinc-800 px-1 rounded">.../auth/calendar</code>.
              En Test users agregarte a vos mismo.
            </p>

            <p><span className="text-indigo-400 font-bold">4.</span>{' '}
              Ir a <strong className="text-zinc-300">APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID</strong>.
              Tipo: <strong className="text-zinc-300">Web application</strong>.
            </p>

            <p><span className="text-indigo-400 font-bold">5.</span>{' '}
              En <strong className="text-zinc-300">Authorized redirect URIs</strong> agregar esta URL:
            </p>

            <div className="flex items-center gap-2 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2">
              <code className="flex-1 text-emerald-400 text-[11px] break-all">{redirectUri || 'cargando…'}</code>
              <button onClick={copyUri} className="shrink-0 text-zinc-400 hover:text-white transition-colors" title="Copiar">
                {copied ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <p><span className="text-indigo-400 font-bold">6.</span>{' '}
              Crear el cliente. Google te da el <strong className="text-zinc-300">Client ID</strong> y el{' '}
              <strong className="text-zinc-300">Client Secret</strong>. Pegálos abajo.
            </p>
          </div>
        </div>
      </div>

      {/* Credential inputs */}
      <div className="space-y-3 pt-1">
        <p className="text-[10px] font-mono uppercase tracking-wider text-blue-300">Tus credenciales OAuth</p>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="852205798341-xxxxxxxxxx.apps.googleusercontent.com"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Client Secret</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type={showSecret ? 'text' : 'password'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="GOCSPX-…"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <button onClick={() => setShowSecret((v) => !v)} className="p-2 text-zinc-500 hover:text-zinc-200">
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">Se guarda encriptado en Supabase. Nunca se devuelve al cliente.</p>
        </div>

        <button
          onClick={saveCredentials}
          disabled={!clientId.trim() || !clientSecret.trim() || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 disabled:opacity-40 text-blue-300 text-xs font-bold"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Guardar credenciales
        </button>

        {saveResult && (
          <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
            saveResult.ok
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}>
            {saveResult.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{saveResult.msg}</span>
          </div>
        )}
      </div>

      {/* Connect / Disconnect */}
      {hasCredentials && (
        <div className="pt-3 border-t border-zinc-800 flex items-center gap-3">
          {connected ? (
            <>
              <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Cuenta de Google conectada
              </span>
              <button
                onClick={disconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                <Link2Off className="w-3.5 h-3.5" /> Desconectar
              </button>
            </>
          ) : (
            <a
              href="/api/auth/google"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
            >
              <Link2 className="w-3.5 h-3.5" /> Conectar Google Calendar
            </a>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { aiProvider, anthropicApiKey, anthropicModel, setAiProvider, setAnthropicApiKey, setAnthropicModel } = useAppStore()
  const [showKey, setShowKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState(anthropicApiKey)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => { setKeyDraft(anthropicApiKey) }, [anthropicApiKey])

  const saveKey = () => {
    setAnthropicApiKey(keyDraft.trim())
    setTestResult(null)
  }

  const testConnection = async () => {
    if (!keyDraft.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/ai/interpret', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-provider': 'anthropic',
          'x-anthropic-key': keyDraft.trim(),
          'x-anthropic-model': anthropicModel,
        },
        body: JSON.stringify({ message: 'hola', context: {} }),
      })
      const j = await res.json()
      if (j.ok && j.intent) {
        setTestResult({ ok: true, msg: `OK — Claude respondió. Intent: ${j.intent.type}` })
        // Auto-save the key if test passed
        setAnthropicApiKey(keyDraft.trim())
      } else {
        setTestResult({ ok: false, msg: j.error === 'anthropic_failed' ? (j.detail || 'Falló') : (j.error || 'Error') })
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'unknown' })
    } finally {
      setTesting(false)
    }
  }

  if (!mounted) return <div className="p-6 text-zinc-500">Cargando…</div>

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-zinc-400" /> Configuración
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">Ajustes de la app · IA · integraciones</p>
      </div>

      {/* AI Provider section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white">Inteligencia Artificial</h2>
        </div>

        <p className="text-xs text-zinc-500">
          Elegí qué proveedor de IA usar para el chatbot, el desglose de tareas y futuras features.
          Los datos se procesan en tu navegador y se envían al proveedor que elijas.
        </p>

        {/* Provider toggle */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(['off', 'ollama', 'anthropic'] as const).map((p) => {
            const meta = {
              off:       { label: 'Desactivado', hint: 'Solo regex local (sin IA)', color: '#71717a' },
              ollama:    { label: 'Ollama local',   hint: 'Gratis · privado · necesita 2-5GB',  color: '#10b981' },
              anthropic: { label: 'Claude API',     hint: 'Pago por uso · mucho más preciso',   color: '#a855f7' },
            }[p]
            return (
              <button key={p} onClick={() => setAiProvider(p)}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  aiProvider === p
                    ? 'border-current'
                    : 'border-zinc-800 hover:border-zinc-600 text-zinc-400'
                }`}
                style={aiProvider === p ? { borderColor: meta.color, background: meta.color + '10', color: meta.color } : {}}>
                <p className="text-sm font-bold">{meta.label}</p>
                <p className="text-[10px] mt-0.5 opacity-80">{meta.hint}</p>
              </button>
            )
          })}
        </div>

        {/* Anthropic config */}
        {aiProvider === 'anthropic' && (
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <p className="text-[10px] font-mono uppercase tracking-wider text-purple-300">Claude (Anthropic)</p>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                <span>API Key</span>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 normal-case font-normal">
                  Obtener una <ExternalLink className="w-3 h-3" />
                </a>
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                />
                <button onClick={() => setShowKey((v) => !v)}
                  className="p-2 text-zinc-500 hover:text-zinc-200" title={showKey ? 'Ocultar' : 'Mostrar'}>
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Tu key se guarda solo en el localStorage de este navegador. Nunca se sube a ningún servidor mío.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Modelo</label>
              <select value={anthropicModel} onChange={(e) => setAnthropicModel(e.target.value)}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={saveKey}
                disabled={!keyDraft.trim() || keyDraft === anthropicApiKey}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 disabled:opacity-40 text-purple-300 text-xs font-bold">
                <Check className="w-3.5 h-3.5" /> Guardar key
              </button>
              <button onClick={testConnection}
                disabled={!keyDraft.trim() || testing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs font-semibold">
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                Probar conexión
              </button>
            </div>

            {testResult && (
              <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                testResult.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'
              }`}>
                {testResult.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{testResult.msg}</span>
              </div>
            )}

            <p className="text-[10px] text-zinc-500 leading-relaxed">
              <strong className="text-zinc-300">Costo aproximado:</strong> Claude Haiku 4.5 cobra ~$0.80 por millón de tokens de input
              y ~$4 por millón de output. Para uso personal del chatbot + desglose de tareas, esperá <strong>$0.20-$1/mes</strong>.
            </p>
          </div>
        )}

        {aiProvider === 'ollama' && (
          <div className="space-y-2 pt-3 border-t border-zinc-800">
            <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-300">Ollama (local)</p>
            <p className="text-xs text-zinc-400">
              Asegurate de tener Ollama instalado y un modelo descargado.
              Por default usa <code className="text-emerald-400">llama3.2:3b</code> en <code className="text-emerald-400">http://localhost:11434</code>.
              Editá <code className="text-zinc-500">OLLAMA_MODEL</code> en <code className="text-zinc-500">.env.local</code> para cambiar.
            </p>
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">
              ollama.com/download <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {aiProvider === 'off' && (
          <div className="pt-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">
              Sin IA activa, el chatbot solo entiende comandos regex predefinidos
              y el desglose de tareas (✨ con IA) está deshabilitado.
            </p>
          </div>
        )}
      </section>

      <GoogleCalendarSection />
    </motion.div>
  )
}
