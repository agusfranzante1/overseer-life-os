'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Bot, Eye, EyeOff, Check, X, Loader2, ExternalLink, AlertCircle, Calendar, Copy, CheckCheck, Link2, Link2Off, Upload, Database, FileJson, Palette, Sun, Moon, RotateCcw, CloudDownload, AlertTriangle } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'
import { useGoogleCalendarStore } from '@/lib/store/googleCalendarStore'
import { useFoodStore } from '@/lib/store/foodStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useGymStore } from '@/lib/store/gymStore'
import { useWalletStore } from '@/lib/store/walletStore'
import { useTradingStore } from '@/lib/store/tradingStore'
import { useHealthStore } from '@/lib/store/healthStore'
import { useChatStore } from '@/lib/store/chatStore'
import { useSPIStore } from '@/lib/store/spiStore'
import { useProjectionStore } from '@/lib/store/projectionStore'
import {
  forceSyncFood, forceSyncTasks, forceSyncHabits, forceSyncGymBasics,
  forceSyncWallet, forceSyncTrading, forceSyncHealth, forceSyncChat,
  forceSyncSPI, forceSyncProjection, resyncTasksFromCloud,
} from '@/lib/supabase/sync'

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
  const [clientIdHint, setClientIdHint] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStatus = () =>
    fetch('/api/auth/google/credentials')
      .then((r) => r.json())
      .then((d) => {
        setHasCredentials(d.hasCredentials ?? false)
        setConnected(d.connected ?? false)
        setClientIdHint(d.clientIdHint ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

  useEffect(() => {
    setRedirectUri(`${window.location.origin}/api/auth/google/callback`)
    loadStatus()
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
        setSaveResult({ ok: true, msg: 'Credenciales guardadas. Ahora podés conectar tu cuenta.' })
        setClientSecret('')
        setClientId('')
        await loadStatus()
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
      await loadStatus()
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
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-blue-300">
            {hasCredentials ? 'Actualizar credenciales OAuth' : 'Tus credenciales OAuth'}
          </p>
          {hasCredentials && (
            <span className="text-[10px] text-emerald-400 font-mono">
              ✓ guardadas ({clientIdHint})
            </span>
          )}
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={hasCredentials ? `${clientIdHint ?? ''}… (dejá vacío para no cambiar)` : '852205798341-xxxxxxxxxx.apps.googleusercontent.com'}
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
              placeholder={hasCredentials ? '••••••••••• (dejá vacío para no cambiar)' : 'GOCSPX-…'}
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
          disabled={(!clientId.trim() || !clientSecret.trim()) || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 disabled:opacity-40 text-blue-300 text-xs font-bold"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {hasCredentials ? 'Actualizar credenciales' : 'Guardar credenciales'}
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

// ─── Health Webhook section ───────────────────────────────────────────────────

function HealthWebhookSection() {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/health`)
    fetch('/api/health/webhook-token')
      .then((r) => r.json())
      .then((d) => setToken(d.token ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const generate = async () => {
    setGenerating(true)
    try {
      const r = await fetch('/api/health/webhook-token', { method: 'POST' })
      const d = await r.json()
      if (d.token) {
        setToken(d.token)
        setShowToken(true)
      }
    } finally {
      setGenerating(false)
    }
  }

  const copyToken = async () => {
    if (!token) return
    await navigator.clipboard.writeText(token).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl).catch(() => {})
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="w-5 h-5 text-rose-400" />
        <h2 className="text-sm font-bold text-white">Health Webhook (iOS Shortcut)</h2>
      </div>

      <p className="text-xs text-zinc-400 leading-relaxed">
        Para que tu Shortcut de iPhone postee pasos, sueño, frecuencia cardíaca y HRV directamente
        a la app, generá un token único. El token identifica tus snapshots — nadie más puede escribir
        a tu cuenta sin él.
      </p>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">URL del endpoint</label>
        <div className="flex items-center gap-2 mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2">
          <code className="flex-1 text-emerald-400 text-[11px] break-all">{webhookUrl || 'cargando…'}</code>
          <button onClick={copyUrl} className="shrink-0 text-zinc-400 hover:text-white" title="Copiar URL">
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Tu webhook token</label>
        {loading ? (
          <p className="text-xs text-zinc-500 mt-1">Cargando…</p>
        ) : token ? (
          <>
            <div className="flex items-center gap-2 mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2">
              <code className="flex-1 text-rose-300 text-[11px] break-all font-mono">
                {showToken ? token : '•'.repeat(48)}
              </code>
              <button onClick={() => setShowToken((v) => !v)} className="shrink-0 text-zinc-400 hover:text-white" title={showToken ? 'Ocultar' : 'Mostrar'}>
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={copyToken} className="shrink-0 text-zinc-400 hover:text-white" title="Copiar">
                {copied ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={generate}
              disabled={generating}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs font-semibold"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
              Regenerar (invalida el anterior)
            </button>
          </>
        ) : (
          <button
            onClick={generate}
            disabled={generating}
            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 disabled:opacity-40 text-rose-300 text-xs font-bold"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Generar token
          </button>
        )}
      </div>

      {token && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2 text-xs text-zinc-400">
          <p className="font-bold text-zinc-300 uppercase tracking-wider text-[10px]">Cómo conectar tu Shortcut</p>
          <p><span className="text-rose-400 font-bold">1.</span> En tu Shortcut, acción <strong className="text-zinc-300">&quot;Obtener contenido de URL&quot;</strong>:</p>
          <ul className="ml-5 space-y-1 list-disc">
            <li>URL: <code className="text-emerald-400">{webhookUrl}</code></li>
            <li>Método: <code className="text-emerald-400">POST</code></li>
            <li>Headers: <code className="text-emerald-400">Content-Type: application/json</code></li>
          </ul>
          <p><span className="text-rose-400 font-bold">2.</span> Body JSON:</p>
          <pre className="bg-zinc-900 p-2 rounded text-[10px] text-zinc-300 overflow-x-auto">{`{
  "token": "TU-TOKEN-AQUI",
  "date": "[Fecha yyyy-MM-dd]",
  "steps": [Suma pasos],
  "sleep_minutes": [Min dormido],
  "resting_hr": [BPM en reposo],
  "hrv": [SDNN en ms]
}`}</pre>
          <p><span className="text-rose-400 font-bold">3.</span> Automatización → Hora del día (ej. 23:30) → ejecutar sin confirmar.</p>
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

      <AppearanceSection />
      <PushNotificationsSection />
      <NotificationPrefsSection />
      <GoogleCalendarSection />
      <GCalTasksSyncSection />
      <HealthWebhookSection />
      <DeviceResyncSection />
      <BackupImportSection />
    </motion.div>
  )
}

// ─── Apariencia: tema + colores custom ────────────────────────────────────────

// Defaults que muestran los pickers cuando el usuario no customizó nada.
// Deben matchear globals.css (--app-bg dark/light y --app-accent).
const DEFAULT_DARK_BG = '#0a0e15'
const DEFAULT_LIGHT_BG = '#f3f4f6'
const DEFAULT_ACCENT = '#6366f1'

const ACCENT_PRESETS = [
  { label: 'Índigo', value: '#6366f1' },
  { label: 'Violeta', value: '#8b5cf6' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Cian', value: '#06b6d4' },
  { label: 'Ámbar', value: '#f59e0b' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Rojo', value: '#ef4444' },
  { label: 'Azul', value: '#3b82f6' },
]

function AppearanceSection() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const themeColors = useAppStore((s) => s.themeColors)
  const setThemeColor = useAppStore((s) => s.setThemeColor)
  const resetThemeColors = useAppStore((s) => s.resetThemeColors)

  const hasCustom = !!(themeColors.darkBg || themeColors.lightBg || themeColors.accent)

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white">Apariencia</h2>
        </div>
        {hasCustom && (
          <button
            onClick={resetThemeColors}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Restaurar colores
          </button>
        )}
      </div>

      {/* Tema activo */}
      <div>
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Tema</p>
        <div className="inline-flex bg-zinc-950 border border-zinc-800 rounded-xl p-1">
          {(['dark', 'light'] as const).map((mode) => {
            const active = theme === mode
            const Icon = mode === 'dark' ? Moon : Sun
            return (
              <button
                key={mode}
                onClick={() => setTheme(mode)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {mode === 'dark' ? 'Oscuro' : 'Claro'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Fondos por tema */}
      <div>
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Fondo de la app</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ColorRow
            label="Fondo — tema oscuro"
            value={themeColors.darkBg ?? DEFAULT_DARK_BG}
            isCustom={!!themeColors.darkBg}
            onChange={(v) => setThemeColor('darkBg', v)}
            onReset={() => setThemeColor('darkBg', null)}
          />
          <ColorRow
            label="Fondo — tema claro"
            value={themeColors.lightBg ?? DEFAULT_LIGHT_BG}
            isCustom={!!themeColors.lightBg}
            onChange={(v) => setThemeColor('lightBg', v)}
            onReset={() => setThemeColor('lightBg', null)}
          />
        </div>
      </div>

      {/* Acento */}
      <div>
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
          Color de acento <span className="normal-case tracking-normal text-zinc-600">· botones, nav y resaltados</span>
        </p>
        <ColorRow
          label="Acento principal"
          value={themeColors.accent ?? DEFAULT_ACCENT}
          isCustom={!!themeColors.accent}
          onChange={(v) => setThemeColor('accent', v)}
          onReset={() => setThemeColor('accent', null)}
        />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {ACCENT_PRESETS.map((p) => {
            const selected = (themeColors.accent ?? DEFAULT_ACCENT).toLowerCase() === p.value.toLowerCase()
            return (
              <button
                key={p.value}
                onClick={() => setThemeColor('accent', p.value === DEFAULT_ACCENT ? null : p.value)}
                title={p.label}
                className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 ${
                  selected ? 'border-white' : 'border-transparent'
                }`}
                style={{ background: p.value }}
              />
            )
          })}
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed mt-3">
          El acento recolorea los botones primarios y el ítem activo del menú (las
          familias índigo/violeta). El verde de &quot;ok / sincronizado&quot; y los
          colores propios de cada módulo no se tocan.
        </p>
      </div>
    </section>
  )
}

/** Fila de color reutilizable: swatch + input nativo de color + hex
 *  editable + botón de reset (solo si el valor está customizado). */
function ColorRow({
  label, value, isCustom, onChange, onReset,
}: {
  label: string
  value: string
  isCustom: boolean
  onChange: (v: string) => void
  onReset: () => void
}) {
  return (
    <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5">
      <label className="relative shrink-0 w-9 h-9 rounded-lg overflow-hidden border border-white/10 cursor-pointer">
        <span className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200 truncate">{label}</p>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="mt-0.5 w-full bg-transparent text-[11px] font-mono text-zinc-500 focus:text-zinc-200 focus:outline-none uppercase"
        />
      </div>
      {isCustom && (
        <button
          onClick={onReset}
          title="Volver al default"
          className="shrink-0 text-zinc-600 hover:text-zinc-200 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

/** El <input type=color> solo acepta #rrggbb. Si el usuario tipeó algo
 *  raro o un formato corto, devolvemos un fallback válido para no romper
 *  el picker (el texto libre sigue editable aparte). */
function normalizeHex(v: string): string {
  const t = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(t)) return t
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    return '#' + t.slice(1).split('').map((c) => c + c).join('')
  }
  return '#000000'
}

/** Sync de tareas-con-horario a Google Calendar — un toggle que decide
 *  si las tasks con `dueTime` se espejan como eventos GCal, y un picker
 *  para elegir en qué calendario se crean. */
function GCalTasksSyncSection() {
  const cfg = useAppStore((s) => s.gcalTasksSync)
  const setCfg = useAppStore((s) => s.setGcalTasksSync)
  const gcal = useGoogleCalendarStore()
  const writableCalendars = (gcal.calendars ?? []).filter(
    (c) => c.accessRole === 'owner' || c.accessRole === 'writer'
  )
  const enabled = !!cfg.enabled
  const ready = gcal.connected && writableCalendars.length > 0

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🗓️</span>
        <h2 className="text-sm font-bold text-white">Sync de tareas-evento a Google Calendar</h2>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">
        Las tareas con <strong>fecha + hora</strong> se materializan como eventos en tu Google Calendar
        elegido. Las tareas <strong>sin hora</strong> siguen viviendo solo en Tasks (no van al calendario).
        Duración default: 1 hora (editable por task).
      </p>

      {!gcal.connected && (
        <p className="text-[11px] text-amber-300 italic">
          Primero conectá Google Calendar arriba.
        </p>
      )}
      {gcal.connected && writableCalendars.length === 0 && (
        <p className="text-[11px] text-amber-300 italic">
          No tenés ningún calendario con permisos de escritura en tu cuenta de Google.
        </p>
      )}

      <div className="space-y-3">
        <label className="flex items-start gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/40 cursor-pointer">
          <span className="text-lg shrink-0 mt-0.5">🔄</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-200">Activar el sync</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Cada tarea con hora se crea/actualiza/borra en el calendario destino. Sin hora, nada al calendario.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!ready}
            onClick={() => setCfg({ enabled: !enabled })}
            className={`shrink-0 w-10 h-6 rounded-full transition-colors relative disabled:opacity-40 ${
              enabled ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-[left,right] duration-150 ${
                enabled ? 'left-0.5 right-auto' : 'left-auto right-0.5'
              }`}
            />
          </button>
        </label>

        {enabled && ready && (
          <div className="px-3 pb-3 pt-1 ml-9">
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Calendario destino
            </label>
            <select
              value={cfg.calendarId ?? ''}
              onChange={(e) => setCfg({ calendarId: e.target.value })}
              className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-300 focus:outline-none focus:border-fuchsia-500/40"
            >
              <option value="">— elegir calendario —</option>
              {writableCalendars.map((c) => (
                <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (primary)' : ''}</option>
              ))}
            </select>
            {!cfg.calendarId && (
              <p className="text-[10px] text-amber-300/80 mt-1 italic">
                Elegí un calendario para que el sync arranque.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-zinc-600 italic">
        ⓘ El sync es una sola dirección por ahora (Task → GCal). Si editás un evento desde Google directamente, el cambio no vuelve a la task. Eso queda para la próxima fase.
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS — opt-in for native-app-style alerts (iOS 16.4+ /
// Android / desktop). Requires the app to be installed to the home screen
// on iOS for delivery to actually fire.
// ─────────────────────────────────────────────────────────────────────
function PushNotificationsSection() {
  const [mounted, setMounted] = useState(false)
  const [cap, setCap] = useState<{ supported: boolean; permission: NotificationPermission; subscribed: boolean; reason?: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Detect iOS standalone mode (PWA on home screen). iOS uses
    // `navigator.standalone`; other platforms use `display-mode: standalone`.
    const standalone =
      (typeof window !== 'undefined' && (window.navigator as unknown as { standalone?: boolean }).standalone === true) ||
      (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches)
    setIsStandalone(!!standalone)
    setIsIOS(typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent))
    // Lazy-load the client helper so SSR doesn't choke on browser APIs.
    import('@/lib/push/client').then(({ getPushCapability }) => {
      getPushCapability().then(setCap)
    })
  }, [])

  const refresh = async () => {
    const { getPushCapability } = await import('@/lib/push/client')
    setCap(await getPushCapability())
  }

  const handleSubscribe = async () => {
    setBusy('subscribe')
    setFeedback(null)
    try {
      const { subscribeToPush } = await import('@/lib/push/client')
      const result = await subscribeToPush()
      if (result.ok) {
        setFeedback({ kind: 'ok', msg: '✓ Suscripción activa en este dispositivo' })
      } else {
        setFeedback({ kind: 'err', msg: result.error })
      }
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const handleUnsubscribe = async () => {
    setBusy('unsubscribe')
    setFeedback(null)
    try {
      const { unsubscribeFromPush } = await import('@/lib/push/client')
      const result = await unsubscribeFromPush()
      setFeedback(result.ok
        ? { kind: 'ok', msg: 'Suscripción eliminada' }
        : { kind: 'err', msg: result.error ?? 'Falló al desuscribir' })
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const handleTest = async () => {
    setBusy('test')
    setFeedback(null)
    try {
      const r = await fetch('/api/push/test', { method: 'POST' })
      const j = await r.json()
      if (j.ok) {
        setFeedback({ kind: 'ok', msg: `✓ Enviada a ${j.sent} dispositivo${j.sent === 1 ? '' : 's'}. Revisá tus notificaciones.` })
      } else {
        setFeedback({ kind: 'err', msg: j.error ?? 'Falló el envío' })
      }
    } catch (e) {
      setFeedback({ kind: 'err', msg: e instanceof Error ? e.message : 'unknown' })
    } finally {
      setBusy(null)
    }
  }

  if (!mounted) return null

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔔</span>
        <h2 className="text-sm font-bold text-white">Notificaciones push</h2>
      </div>

      <p className="text-xs text-zinc-500 leading-relaxed">
        Recibí notificaciones nativas en este dispositivo (recordatorios del SPI del sábado,
        eventos próximos, etc.). Cada dispositivo (iPhone, laptop, etc.) se suscribe por separado.
      </p>

      {/* iOS-specific install instructions — only shown on iOS browsers that
          aren't in standalone mode yet. iOS REQUIRES the PWA to be installed
          to the home screen for push to work; web pages in Safari don't get
          push, ever. */}
      {isIOS && !isStandalone && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200">
          <p className="font-semibold mb-1.5">📱 Para iPhone — instalá la app primero</p>
          <ol className="list-decimal list-inside space-y-0.5 text-amber-100/80">
            <li>Tocá <strong>Compartir</strong> (cuadrado con flecha arriba)</li>
            <li>Tocá <strong>&quot;Agregar a inicio&quot;</strong></li>
            <li>Abrí Overseer desde el ícono nuevo en tu home screen</li>
            <li>Volvé acá y activá las notificaciones</li>
          </ol>
          <p className="mt-2 text-[10px] text-amber-300/70">
            iOS 16.4+ requerido · Las notifs solo funcionan en modo &quot;app&quot;, no en Safari.
          </p>
        </div>
      )}

      {/* Status box */}
      {cap && (
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Soporte del browser</span>
            <span className={cap.supported ? 'text-emerald-400' : 'text-red-400'}>
              {cap.supported ? '✓ disponible' : '✗ no disponible'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Permiso</span>
            <span className={
              cap.permission === 'granted' ? 'text-emerald-400'
              : cap.permission === 'denied' ? 'text-red-400'
              : 'text-amber-400'
            }>
              {cap.permission === 'granted' ? 'otorgado'
              : cap.permission === 'denied' ? 'denegado (cambialo en config del browser)'
              : 'pendiente'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Suscripción en este dispositivo</span>
            <span className={cap.subscribed ? 'text-emerald-400' : 'text-zinc-500'}>
              {cap.subscribed ? '✓ activa' : 'inactiva'}
            </span>
          </div>
          {isIOS && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Modo standalone (PWA)</span>
              <span className={isStandalone ? 'text-emerald-400' : 'text-amber-400'}>
                {isStandalone ? '✓ sí' : 'no — instalá la app primero'}
              </span>
            </div>
          )}
          {cap.reason && (
            <p className="text-[10px] text-zinc-500 italic mt-2">{cap.reason}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {!cap?.subscribed ? (
          <button
            onClick={handleSubscribe}
            disabled={!cap?.supported || busy !== null}
            className="px-4 py-2 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
          >
            {busy === 'subscribe' ? <Loader2 className="w-4 h-4 animate-spin" /> : '🔔'}
            Activar notificaciones
          </button>
        ) : (
          <>
            <button
              onClick={handleTest}
              disabled={busy !== null}
              className="px-4 py-2 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 disabled:opacity-40 text-indigo-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
            >
              {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : '🧪'}
              Probar
            </button>
            <button
              onClick={handleUnsubscribe}
              disabled={busy !== null}
              className="px-4 py-2 bg-zinc-800 border border-zinc-700 hover:border-red-500/40 hover:text-red-400 disabled:opacity-40 text-zinc-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
            >
              {busy === 'unsubscribe' ? <Loader2 className="w-4 h-4 animate-spin" /> : '🔕'}
              Desactivar
            </button>
          </>
        )}
      </div>

      {feedback && (
        <div className={`text-xs rounded-lg px-3 py-2 ${
          feedback.kind === 'ok'
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {feedback.msg}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES — per-channel on/off
// ─────────────────────────────────────────────────────────────────────
/** Toggles que controlan QUÉ tipo de notificaciones se disparan. Esto
 *  va aparte del PushNotificationsSection (que gestiona la suscripción
 *  push global del dispositivo) — acá vivim los flags por canal. Los
 *  servicios que disparan notificaciones (push scheduler, banners
 *  in-app, etc.) tienen que chequear `notificationPrefs[key]` antes de
 *  emitir. Default: todos encendidos excepto recordatorio diario de
 *  hábitos (opt-in porque puede ser ruido). */
function NotificationPrefsSection() {
  const notificationPrefs = useAppStore((s) => s.notificationPrefs)
  const setNotificationPref = useAppStore((s) => s.setNotificationPref)

  type Channel = {
    key: keyof typeof notificationPrefs
    title: string
    description: string
    emoji: string
    /** Tipo de notificación que dispara el endpoint de test-dispatch
     *  para este canal — usado por el botón "Probar ahora". */
    testType?: 'habit_reminder' | 'habit_specific' | 'task_due' | 'task_overdue' | 'spi_new'
  }
  const channels: Channel[] = [
    {
      key: 'spiNewSession',
      title: 'Nuevo SPI habilitado',
      description: 'Aviso el sábado AM cuando una sesión SPI nueva está disponible para arrancar.',
      emoji: '📐',
      testType: 'spi_new',
    },
    {
      key: 'taskDueSoon',
      title: 'Vencimiento de tareas',
      description: 'Aviso cuando una tarea con dueDate vence hoy o mañana.',
      emoji: '📋',
      testType: 'task_due',
    },
    {
      key: 'taskOverdue',
      title: 'Tareas vencidas',
      description: 'Aviso recurrente si tenés tareas con dueDate ya pasada y todavía abiertas.',
      emoji: '⚠️',
      testType: 'task_overdue',
    },
    {
      key: 'habitReminder',
      title: 'Recordatorio diario de hábitos',
      description: 'Aviso al final del día con los hábitos del día que todavía no marcaste.',
      emoji: '🟢',
      testType: 'habit_reminder',
    },
    {
      key: 'habitSpecificReminders',
      title: 'Recordatorios por hábito (hora específica)',
      description: 'Si configurás una hora a un hábito (ej. Meditar a las 8:00), recibís un push a esa hora solo si no lo marcaste.',
      emoji: '⏰',
      testType: 'habit_specific',
    },
  ]

  // Estado para los botones "Probar ahora" — qué canal está enviando
  // ahora mismo (para mostrar el spinner) y el último resultado.
  const [testingChannel, setTestingChannel] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ kind: 'ok' | 'err'; msg: string; ch: string } | null>(null)

  const triggerTest = async (channelKey: string, testType: string) => {
    setTestingChannel(channelKey)
    setTestResult(null)
    try {
      const r = await fetch('/api/notifications/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: testType }),
      })
      const j = await r.json()
      if (j.ok) {
        // Construimos el feedback uniendo push y email — cada canal puede
        // tener cero, uno o ambos resultados según el setup del user.
        const parts: string[] = []
        if ((j.sent ?? 0) > 0) parts.push(`✓ Push a ${j.sent} dispositivo${j.sent === 1 ? '' : 's'}`)
        if (j.emailOk) parts.push(`✓ Email a ${j.email}`)
        else if (j.emailError) parts.push(`⚠ Email falló: ${j.emailError}`)
        const msg = parts.length > 0
          ? parts.join(' · ')
          : '✓ Disparado (no había canales activos para mandar)'
        setTestResult({ kind: 'ok', msg, ch: channelKey })
      } else {
        setTestResult({ kind: 'err', msg: j.error ?? 'Falló', ch: channelKey })
      }
    } catch (e) {
      setTestResult({ kind: 'err', msg: e instanceof Error ? e.message : 'unknown', ch: channelKey })
    } finally {
      setTestingChannel(null)
    }
  }

  // Opciones discretas de lead time, compartidas entre los canales que
  // soportan "cuánto antes". Lista cerrada para evitar valores raros.
  const LEAD_TIME_OPTIONS: { value: number; label: string }[] = [
    { value: 0,         label: 'En el momento' },
    { value: 5,         label: '5 min antes' },
    { value: 15,        label: '15 min antes' },
    { value: 30,        label: '30 min antes' },
    { value: 60,        label: '1 hora antes' },
    { value: 120,       label: '2 horas antes' },
    { value: 240,       label: '4 horas antes' },
    { value: 24 * 60,   label: '1 día antes' },
    { value: 48 * 60,   label: '2 días antes' },
  ]
  const taskDueLead = notificationPrefs.taskDueLeadMinutes ?? 60
  const spiLead = notificationPrefs.spiNewSessionLeadMinutes ?? 0

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎚️</span>
        <h2 className="text-sm font-bold text-white">Qué notificaciones querés recibir</h2>
      </div>
      <p className="text-xs text-zinc-500">
        Estos toggles controlan QUÉ tipo de notificación se dispara. La
        suscripción push se configura arriba — si la apagás, ninguna llega
        aunque acá esté en ON.
      </p>
      <div className="space-y-2">
        {channels.map((ch) => {
          // Default ON (undefined → true) — coincide con el initial state.
          const enabled = notificationPrefs[ch.key] !== false
          // Cada canal puede tener su propio "lead time" — cuánto antes
          // de disparar. Sólo aplicamos el control a los canales que
          // tienen ese concepto (vencimiento, SPI nuevo).
          const leadTimeKey: 'taskDueLeadMinutes' | 'spiNewSessionLeadMinutes' | null =
            ch.key === 'taskDueSoon' ? 'taskDueLeadMinutes'
            : ch.key === 'spiNewSession' ? 'spiNewSessionLeadMinutes'
            : null
          const currentLead = leadTimeKey === 'taskDueLeadMinutes' ? taskDueLead
            : leadTimeKey === 'spiNewSessionLeadMinutes' ? spiLead
            : null
          // Para el canal `habitReminder`, mostramos un input <time>
          // que setea hour/minute. El server (cron dispatcher) dispara
          // todos los días alrededor de esa hora en TZ local del usuario.
          const isHabitChannel = ch.key === 'habitReminder'
          return (
            <div
              key={ch.key}
              className="rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition-colors"
            >
              <label className="flex items-start gap-3 p-3 cursor-pointer">
                <span className="text-lg shrink-0 mt-0.5">{ch.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-200">{ch.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{ch.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => setNotificationPref(ch.key, !enabled)}
                  className={`shrink-0 w-10 h-6 rounded-full transition-colors relative ${
                    enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  {/* Knob: anclado a left-0.5 cuando ON, a right-0.5
                      cuando OFF. Usar `left`/`right` directos (en vez de
                      `translate-x`) garantiza que el knob siempre quede
                      DENTRO de la forma redondeada, simétrico en ambos
                      estados. El anterior translate-x-[18px] dejaba el
                      knob desbordando visualmente la curva del rounded-full
                      en el lado derecho. */}
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-[left,right] duration-150 ${
                      enabled ? 'left-0.5 right-auto' : 'left-auto right-0.5'
                    }`}
                  />
                </button>
              </label>
              {/* Lead-time selector — solo para canales que soportan
                  "cuánto antes" Y que están habilitados. */}
              {leadTimeKey && enabled && currentLead !== null && (
                <div className="px-3 pb-3 -mt-1 flex items-center gap-2 border-t border-zinc-900 pt-2 ml-9">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 whitespace-nowrap">
                    Cuánto antes
                  </label>
                  <select
                    value={String(currentLead)}
                    onChange={(e) => setNotificationPref(leadTimeKey, parseInt(e.target.value, 10))}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-fuchsia-500/40"
                  >
                    {LEAD_TIME_OPTIONS.map((o) => (
                      <option key={o.value} value={String(o.value)}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Botón "Probar ahora" — manda un push ya mismo, ignorando
                  ventana y dedupe. Útil para verificar que la cadena
                  end-to-end funciona (server → push → SW → notif). */}
              {enabled && ch.testType && (
                <div className="px-3 pb-3 -mt-1 flex items-center gap-2 border-t border-zinc-900 pt-2 ml-9">
                  <button
                    type="button"
                    disabled={testingChannel === ch.key}
                    onClick={() => triggerTest(ch.key, ch.testType!)}
                    className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300 hover:text-fuchsia-200 hover:bg-fuchsia-500/10 transition-colors px-2 py-1 rounded disabled:opacity-40"
                  >
                    {testingChannel === ch.key ? 'enviando…' : '🔔 probar ahora'}
                  </button>
                  {testResult?.ch === ch.key && (
                    <span className={`text-[10px] ${testResult.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {testResult.msg}
                    </span>
                  )}
                </div>
              )}
              {/* Hora del recordatorio diario de hábitos — solo para
                  el canal `habitReminder` y solo si está habilitado. */}
              {isHabitChannel && enabled && (
                <div className="px-3 pb-3 -mt-1 flex items-center gap-2 border-t border-zinc-900 pt-2 ml-9">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 whitespace-nowrap">
                    A qué hora
                  </label>
                  <input
                    type="time"
                    value={`${String(notificationPrefs.habitReminderHour ?? 21).padStart(2, '0')}:${String(notificationPrefs.habitReminderMinute ?? 0).padStart(2, '0')}`}
                    onChange={(e) => {
                      const [hh, mm] = e.target.value.split(':').map(Number)
                      if (Number.isFinite(hh)) setNotificationPref('habitReminderHour', hh)
                      if (Number.isFinite(mm)) setNotificationPref('habitReminderMinute', mm)
                    }}
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-fuchsia-500/40"
                  />
                  <span className="text-[10px] text-zinc-600 italic">
                    en tu hora local
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-zinc-600 italic">
        ⓘ Las tareas pueden tener su propio override del "cuánto antes" desde el detalle de la tarea — sobrescribe el ajuste global de acá.
      </p>

      {/* Email channel — alternativa o complemento al push */}
      <EmailNotificationsSection />

      {/* Diagnóstico — para entender por qué una noti no llegó */}
      <HabitNotificationDiagnose />
    </section>
  )
}

function HabitNotificationDiagnose() {
  const [loading, setLoading] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any | null>(null)
  const run = async () => {
    setLoading(true); setResult(null)
    try {
      const r = await fetch('/api/notifications/diagnose')
      const j = await r.json()
      setResult(j)
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'unknown' })
    } finally { setLoading(false) }
  }
  return (
    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>🔬</span> Diagnosticar notificaciones de hábitos
          </h4>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
            Si no te llegó una noti de hábito, hacé click acá. Te muestra ahora mismo el estado del server y por qué cada hábito dispararía o no.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 disabled:opacity-40 text-amber-300 text-xs font-semibold transition-colors"
        >
          {loading ? 'Diagnosticando…' : 'Diagnosticar ahora'}
        </button>
      </div>
      {result && (
        <div className="mt-2 space-y-3 text-xs">
          {result.ok ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <Pill label="Hora server (TZ)" value={`${result.localTime} (${result.timezone})`} />
                <Pill label="Suscripciones push" value={String(result.pushSubscriptions)} />
                <Pill label="Email habilitado" value={String(result.prefs.emailNotifications)} />
                <Pill label="Email destino" value={result.notificationEmail} />
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300">
                  Hábitos ({result.summary.totalHabits})
                </div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(result.habits as any[]).map((h: any) => (
                  <div key={h.id} className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-white">{h.name}</div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          h.wouldFire
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-500/15 text-red-300 border border-red-500/30'
                        }`}
                      >
                        {h.wouldFire ? '✓ DISPARARÍA AHORA' : '✗ NO dispara ahora'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(h.gates as any[]).map((g: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-[11px]">
                          <span className={g.pass ? 'text-emerald-400' : 'text-red-400'}>
                            {g.pass ? '✓' : '✗'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-zinc-300">{g.gate}</div>
                            <div className="text-zinc-500 text-[10px]">{g.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {result.recentNotificationLog?.length > 0 && (
                <div className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
                    Notis enviadas en las últimas 24h
                  </div>
                  <div className="space-y-1">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(result.recentNotificationLog as any[]).slice(0, 10).map((l: any, i: number) => (
                      <div key={i} className="text-[10px] flex items-center gap-2 text-zinc-400">
                        <span className="font-mono">{new Date(l.created_at).toLocaleTimeString()}</span>
                        <span className="font-semibold text-zinc-300">{l.channel}</span>
                        <span className="text-zinc-600">·</span>
                        <span className="font-mono truncate">{l.dedupe_key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-red-300 text-[11px]">Error: {result.error}</div>
          )}
        </div>
      )}
    </div>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/[0.06] p-2">
      <div className="text-[9px] font-mono uppercase tracking-wider text-zinc-600">{label}</div>
      <div className="text-[11px] font-semibold text-zinc-200 truncate" title={value}>{value}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATIONS — recibir las mismas notis al Gmail
// ─────────────────────────────────────────────────────────────────────
function EmailNotificationsSection() {
  const notificationPrefs = useAppStore((s) => s.notificationPrefs)
  const setNotificationPref = useAppStore((s) => s.setNotificationPref)
  const enabled = notificationPrefs.emailNotifications ?? false
  const customEmail = notificationPrefs.notificationEmail ?? ''
  const [draftEmail, setDraftEmail] = useState(customEmail)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  useEffect(() => { setDraftEmail(customEmail) }, [customEmail])

  const sendTest = async () => {
    setSending(true); setResult(null)
    try {
      const r = await fetch('/api/notifications/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'task_due', emailOnly: true }),
      })
      const j = await r.json()
      if (j.ok) setResult({ ok: true, msg: `✓ Email enviado${j.email ? ` a ${j.email}` : ''}` })
      else setResult({ ok: false, msg: j.error ?? 'Falló' })
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'unknown' })
    } finally { setSending(false) }
  }

  return (
    <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>✉️</span> Recibir también por email
          </h4>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
            Te llegan las mismas notificaciones al Gmail (o al email que indiques). Útil mientras no tengas push configurado en el celular.
          </p>
        </div>
        <button
          onClick={() => setNotificationPref('emailNotifications', !enabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
            enabled ? 'bg-violet-500' : 'bg-zinc-700'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {enabled && (
        <>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">
                Email destino (opcional)
              </label>
              <input
                type="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                onBlur={() => setNotificationPref('notificationEmail', draftEmail.trim())}
                placeholder="vacío = email con el que te logueás"
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
              />
            </div>
            <button
              onClick={sendTest}
              disabled={sending}
              className="px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/40 hover:bg-violet-500/25 disabled:opacity-40 text-violet-300 text-xs font-semibold transition-colors"
            >
              {sending ? 'Enviando…' : 'Probar'}
            </button>
          </div>
          {result && (
            <div className={`text-[11px] px-2.5 py-1.5 rounded ${
              result.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                        : 'bg-red-500/10 text-red-300 border border-red-500/30'
            }`}>
              {result.msg}
            </div>
          )}
          <p className="text-[10px] text-zinc-600 italic leading-relaxed">
            ⓘ Requiere que el servidor tenga <code className="text-zinc-500">RESEND_API_KEY</code> configurado. Si el botón "Probar" falla con "RESEND_API_KEY not configured", pedile al admin que cree una cuenta gratis en{' '}
            <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">resend.com</a>{' '}
            y agregue la API key a las env vars de Vercel.
          </p>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// ─── DEVICE RESYNC — descartar tareas locales y adoptar el cloud ──────────────
//
// Para limpiar de una vez una divergencia vieja: si este dispositivo tiene
// tareas que ya borraste/cambiaste en otro device (de ANTES del sistema de
// tombstones), este botón descarta lo local y baja exactamente lo que hay en la
// nube. Útil sobre todo en el celular tras el fix de sync multi-device.
function DeviceResyncSection() {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ projects: number; tasks: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const run = async () => {
    setPhase('running')
    try {
      const r = await resyncTasksFromCloud()
      setResult(r)
      setPhase('done')
      // Recargar para que toda la UI re-renderice desde el estado adoptado.
      setTimeout(() => window.location.reload(), 1800)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al re-sincronizar')
      setPhase('error')
    }
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CloudDownload className="w-4 h-4 text-indigo-400" />
        <h2 className="text-sm font-bold text-white">Re-sincronizar tareas desde la nube</h2>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Descarta las tareas guardadas <strong className="text-zinc-200">en este dispositivo</strong> y
        adopta exactamente lo que hay en la nube. Usalo una vez en el celular si te
        aparecen tareas viejas que ya habías borrado o cambiado en la PC. No sube nada
        antes de bajar, así que es imposible que pise o reviva lo del cloud.
      </p>
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-300/90 leading-relaxed">
          Si tenés tareas creadas <strong>solo en este dispositivo</strong> y todavía sin
          sincronizar, se van a perder. Asegurate de que lo último importante ya esté en la nube.
        </p>
      </div>

      {phase === 'done' ? (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <Check className="w-4 h-4" />
          Listo — {result?.tasks ?? 0} tareas / {result?.projects ?? 0} proyectos del cloud. Recargando…
        </div>
      ) : phase === 'error' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4" /> {errorMsg}
          </div>
          <button onClick={() => setPhase('idle')}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors">
            Reintentar
          </button>
        </div>
      ) : phase === 'confirm' ? (
        <div className="flex items-center gap-2">
          <button onClick={run}
            className="px-3 py-2 bg-red-500/15 border border-red-500/40 hover:bg-red-500/25 text-red-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5">
            <CloudDownload className="w-3.5 h-3.5" /> Sí, descartar local y bajar el cloud
          </button>
          <button onClick={() => setPhase('idle')}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors">
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPhase('confirm')}
          disabled={phase === 'running'}
          className="px-3 py-2 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 disabled:opacity-40 text-indigo-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
        >
          {phase === 'running'
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bajando del cloud…</>
            : <><CloudDownload className="w-3.5 h-3.5" /> Adoptar tareas de la nube</>}
        </button>
      )}
    </section>
  )
}

// BACKUP IMPORT — restore selected keys from an overseer-backup-*.json
// ─────────────────────────────────────────────────────────────────────

/** Human-readable labels per known localStorage key. Anything not in
 *  this map still gets restored if checked, just shown by raw key. */
const KEY_LABELS: Record<string, { label: string; hint?: string }> = {
  'overseer-food':    { label: 'Alimentación', hint: 'Etapas (déficit/manten./volumen) + comidas + lista de compras + costos fijos' },
  'overseer-tasks':   { label: 'Tareas y proyectos' },
  'overseer-habits':  { label: 'Hábitos' },
  'overseer-gym':     { label: 'Gym (rutinas + sesiones + peso corporal)' },
  'overseer-wallet':  { label: 'Billetera' },
  'overseer-trading': { label: 'Trading' },
  'overseer-health':  { label: 'Salud (steps, sueño)' },
  'overseer-gcal':    { label: 'Google Calendar (config)' },
  'overseer-chat':    { label: 'Chat history' },
  'overseer-spi':     { label: 'SPI · sesiones + bitácora + plantilla' },
  'overseer-projection': { label: 'Proyección · planes anual/trimestral/mensual' },
}

interface BackupShape {
  exportedAt?: string
  version?: number
  data?: Record<string, unknown>
}

function BackupImportSection() {
  const [parsed, setParsed] = useState<BackupShape | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setDone(false)
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result)) as BackupShape
        if (!json.data || typeof json.data !== 'object') {
          throw new Error('No tiene la forma de un backup de Overseer (falta `data`).')
        }
        setParsed(json)
        // Por default no selecciono nada — el usuario elige qué pisar.
        setSelectedKeys(new Set())
      } catch (err) {
        setParsed(null)
        setError(err instanceof Error ? err.message : 'JSON inválido')
      }
    }
    reader.readAsText(file)
  }

  const toggleKey = (k: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const doImport = async () => {
    if (!parsed?.data || selectedKeys.size === 0) return
    setImporting(true)
    try {
      // Step 1 — write each selected key to localStorage so on next mount
      // Zustand persist hydrates with the imported data.
      for (const key of selectedKeys) {
        const value = parsed.data[key]
        if (value === undefined) continue
        const serialized = typeof value === 'string' ? value : JSON.stringify(value)
        localStorage.setItem(key, serialized)
      }

      // Step 2 — for Zustand-backed keys, ALSO update the live store and
      // push to Supabase BEFORE reloading. Without this, the post-reload
      // sync would pull the empty cloud state and overwrite our import.
      // Each entry: hydrate the store in-memory from `value.state` (Zustand
      // persist wraps as { state, version }), then force-sync to Supabase.
      await Promise.allSettled(
        Array.from(selectedKeys).map(async (key) => {
          const value = parsed.data?.[key] as { state?: unknown } | undefined
          const state = value && typeof value === 'object' && 'state' in value ? value.state : value
          if (!state || typeof state !== 'object') return

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const apply = (storeSet: (s: any) => void, syncFn?: () => Promise<void>) => {
            storeSet(state)
            return syncFn?.()
          }

          switch (key) {
            case 'overseer-food':       return apply(useFoodStore.setState, forceSyncFood)
            case 'overseer-tasks':      return apply(useTasksStore.setState, forceSyncTasks)
            case 'overseer-habits':     return apply(useHabitsStore.setState, forceSyncHabits)
            case 'overseer-gym':        return apply(useGymStore.setState, forceSyncGymBasics)
            case 'overseer-wallet':     return apply(useWalletStore.setState, forceSyncWallet)
            case 'overseer-trading':    return apply(useTradingStore.setState, forceSyncTrading)
            case 'overseer-health':     return apply(useHealthStore.setState, forceSyncHealth)
            case 'overseer-chat':       return apply(useChatStore.setState, forceSyncChat)
            case 'overseer-spi':        return apply(useSPIStore.setState, forceSyncSPI)
            case 'overseer-projection': return apply(useProjectionStore.setState, forceSyncProjection)
            // Non-synced keys (UI prefs, gcal config) — localStorage write is enough.
            default: return
          }
        })
      )

      setDone(true)
      // Reload so every store re-hydrates cleanly from the new localStorage.
      // The Supabase pull that runs post-mount will now see the data we
      // just pushed, so it won't overwrite anything.
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al escribir localStorage')
      setImporting(false)
    }
  }

  const availableKeys = parsed?.data ? Object.keys(parsed.data).sort() : []

  return (
    <section className="bg-zinc-900/50 rounded-2xl p-4 sm:p-6 border border-zinc-800">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1 flex items-center gap-2">
        <Database className="w-3.5 h-3.5" /> Importar backup
      </h2>
      <p className="text-xs text-zinc-500 mb-4">
        Cargá un archivo <code className="text-zinc-400">overseer-backup-YYYY-MM-DD.json</code> y elegí qué partes restaurar.
        Las claves que selecciones <span className="text-amber-400">pisan</span> los datos actuales en este browser.
      </p>

      <label className="flex items-center gap-3 px-3 py-2.5 bg-zinc-950 border border-dashed border-zinc-700 hover:border-indigo-500/40 rounded-lg cursor-pointer transition-colors mb-3">
        <Upload className="w-4 h-4 text-zinc-500" />
        <span className="text-sm text-zinc-400">
          {fileName ? <span className="text-zinc-200">{fileName}</span> : 'Seleccionar archivo .json'}
        </span>
        <input type="file" accept=".json,application/json" onChange={onFile} className="hidden" />
      </label>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      {parsed && availableKeys.length > 0 && (
        <>
          {parsed.exportedAt && (
            <p className="text-[10px] text-zinc-600 mb-2 font-mono">
              Backup del {new Date(parsed.exportedAt).toLocaleString('es-AR')}
            </p>
          )}

          <div className="space-y-1.5 mb-4 max-h-72 overflow-y-auto pr-1">
            {availableKeys.map((key) => {
              const meta = KEY_LABELS[key]
              const checked = selectedKeys.has(key)
              const value = parsed.data?.[key]
              const sizeHint = typeof value === 'string'
                ? `${value.length} chars`
                : `${(JSON.stringify(value)?.length ?? 0).toLocaleString()} chars`
              return (
                <label key={key}
                  className={`flex items-start gap-2 px-2.5 py-2 rounded border transition-colors cursor-pointer ${
                    checked ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleKey(key)}
                    className="mt-0.5 accent-indigo-500 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">
                      {meta?.label ?? <code className="text-zinc-400">{key}</code>}
                    </p>
                    {meta?.hint && <p className="text-[10px] text-zinc-500 mt-0.5">{meta.hint}</p>}
                    <p className="text-[10px] text-zinc-700 mt-0.5 font-mono">
                      <FileJson className="w-2.5 h-2.5 inline mr-1" />
                      {key} · {sizeHint}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-zinc-500">
              {selectedKeys.size > 0
                ? <span className="text-indigo-300">{selectedKeys.size} clave{selectedKeys.size === 1 ? '' : 's'} seleccionada{selectedKeys.size === 1 ? '' : 's'}</span>
                : <span>Seleccioná al menos una clave para restaurar.</span>}
            </p>
            <button
              onClick={doImport}
              disabled={selectedKeys.size === 0 || importing}
              className="px-3 py-2 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              {done ? (
                <><Check className="w-3.5 h-3.5" /> Restaurado · recargando...</>
              ) : importing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Restaurando...</>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Restaurar selección</>
              )}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
