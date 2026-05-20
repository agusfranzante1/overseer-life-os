'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Bot, Eye, EyeOff, Check, X, Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'

const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5',       label: 'Claude Haiku 4.5',  hint: 'Más barato y rápido — recomendado para chat/intents' },
  { id: 'claude-sonnet-4-5',      label: 'Claude Sonnet 4.5', hint: 'Más inteligente, más caro' },
  { id: 'claude-opus-4-5',        label: 'Claude Opus 4.5',   hint: 'El más potente, más caro aún' },
]

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

      {/* Future settings sections can go here */}
      <section className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-2xl p-5 text-center">
        <p className="text-xs text-zinc-600">Más configuraciones acá próximamente (notificaciones, atajos de teclado, etc.)</p>
      </section>
    </motion.div>
  )
}
