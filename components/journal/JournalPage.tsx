'use client'
import { useState, useMemo, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  NotebookPen, Plus, Trash2, Copy, Check, Calendar as CalendarIcon, X, Pencil,
} from 'lucide-react'
import {
  useJournalStore, sortEntries, formatEntryDate, buildJournalExport,
  type JournalEntry,
} from '@/lib/store/journalStore'

/** `false` en SSR / primer paint, `true` tras hidratar — sin setState en
 *  effect (la forma que React recomienda para el guard de hidratación). El
 *  store persiste desde localStorage sincrónicamente en el cliente, así que
 *  sin este guard el primer render del cliente diverge del HTML del server. */
const noopSubscribe = () => () => {}
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

export function JournalPage() {
  const entries = useJournalStore((s) => s.entries)
  const addEntry = useJournalStore((s) => s.addEntry)
  const removeEntry = useJournalStore((s) => s.removeEntry)

  const [openId, setOpenId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const mounted = useHydrated()

  const sorted = useMemo(() => sortEntries(entries), [entries])

  const handleNew = () => {
    const id = addEntry()
    setOpenId(id)
  }

  const handleCopyAll = async () => {
    if (entries.length === 0) return
    const text = buildJournalExport(entries)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback para contextos sin clipboard API (http, permisos): textarea + execCommand.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* noop */ }
      ta.remove()
    }
  }

  if (!mounted) {
    return <div className="p-6"><div className="h-10 w-52 bg-white/[0.03] rounded-xl animate-pulse" /></div>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-none flex items-center gap-3.5">
            <span
              className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 24%, transparent), color-mix(in srgb, var(--app-accent) 8%, transparent))',
                border: '1px solid color-mix(in srgb, var(--app-accent) 38%, transparent)',
                boxShadow: '0 0 28px -8px color-mix(in srgb, var(--app-accent) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
            >
              <NotebookPen className="w-6 h-6 md:w-7 md:h-7" style={{ color: 'var(--app-accent)' }} />
            </span>
            <span className="text-hero pb-1">My Journal</span>
          </h1>
          <p className="text-[13px] text-zinc-500">Aprendizajes y reflexiones, con fecha. Se guardan y sincronizan entre tus dispositivos.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <motion.button
            whileHover={{ scale: entries.length ? 1.03 : 1, y: entries.length ? -1 : 0 }}
            whileTap={{ scale: entries.length ? 0.97 : 1 }}
            onClick={handleCopyAll}
            disabled={entries.length === 0}
            title="Copiar todas las entradas (con fecha) para pegar en ChatGPT"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
              copied
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-white/[0.04] border-white/[0.10] text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-40'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '¡Copiado!' : 'Copiar todo'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
            onClick={handleNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, var(--app-accent), color-mix(in srgb, var(--app-accent) 60%, #8b5cf6))',
              boxShadow: '0 0 24px -8px color-mix(in srgb, var(--app-accent) 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <Plus className="w-4 h-4" /> Nueva entrada
          </motion.button>
        </div>
      </div>

      {/* Lista de entradas */}
      {sorted.length === 0 ? (
        <div className="text-center py-20 px-8 rounded-2xl border border-dashed border-zinc-700 bg-white/[0.02]">
          <NotebookPen className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-300 mb-1">Tu diario está vacío</p>
          <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto">
            Creá tu primera entrada para anotar un aprendizaje. La fecha se pone sola (y la podés cambiar), le ponés un título y escribís lo que quieras.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              open={openId === entry.id}
              onToggle={() => setOpenId((id) => (id === entry.id ? null : entry.id))}
              onDelete={() => {
                if (confirm('¿Borrar esta entrada del diario? No se puede deshacer.')) {
                  removeEntry(entry.id)
                  if (openId === entry.id) setOpenId(null)
                }
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Card de entrada (colapsada = preview · abierta = editor) ─────────────────

function EntryCard({ entry, open, onToggle, onDelete }: {
  entry: JournalEntry
  open: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const updateEntry = useJournalStore((s) => s.updateEntry)
  const [editingDate, setEditingDate] = useState(false)

  const dateLabel = formatEntryDate(entry.date)
  const preview = entry.body.trim().split('\n')[0]?.slice(0, 140) ?? ''

  return (
    <motion.div
      layout
      className="rounded-2xl overflow-hidden transition-colors"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* Cabecera clickeable */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer group" onClick={onToggle}>
        {/* Chip de fecha */}
        <div
          className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl"
          style={{
            background: 'color-mix(in srgb, var(--app-accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--app-accent) 26%, transparent)',
          }}
        >
          <span className="font-heading text-xl font-bold leading-none" style={{ color: 'var(--app-accent)' }}>
            {entry.date.slice(8, 10)}
          </span>
          <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 mt-0.5">
            {monthShort(entry.date)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white truncate">
            {entry.title.trim() || <span className="text-zinc-500 italic font-normal">Sin título</span>}
          </p>
          <p className="text-xs text-zinc-500 capitalize truncate">{dateLabel}</p>
          {!open && preview && (
            <p className="text-[13px] text-zinc-400 truncate mt-0.5">{preview}</p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Borrar entrada"
          className="shrink-0 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Editor expandido */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-3 border-t border-white/[0.06]">
              {/* Fecha editable */}
              <div className="flex items-center gap-2 pt-3">
                <CalendarIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                {editingDate ? (
                  <input
                    type="date"
                    autoFocus
                    value={entry.date}
                    onChange={(e) => updateEntry(entry.id, { date: e.target.value || entry.date })}
                    onBlur={() => setEditingDate(false)}
                    className="bg-zinc-900 border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-[var(--app-accent)]"
                  />
                ) : (
                  <button
                    onClick={() => setEditingDate(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors group/date"
                    title="Cambiar la fecha de esta entrada"
                  >
                    <span className="capitalize">{dateLabel}</span>
                    <Pencil className="w-3 h-3 text-zinc-600 group-hover/date:text-[var(--app-accent)]" />
                  </button>
                )}
              </div>

              {/* Título */}
              <input
                value={entry.title}
                onChange={(e) => updateEntry(entry.id, { title: e.target.value })}
                placeholder="Título del aprendizaje…"
                className="w-full bg-transparent text-lg font-semibold text-white placeholder-zinc-600 focus:outline-none"
              />

              {/* Cuerpo */}
              <textarea
                value={entry.body}
                onChange={(e) => updateEntry(entry.id, { body: e.target.value })}
                placeholder="Escribí lo que aprendiste, sentiste o querés recordar…"
                rows={8}
                className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 text-[15px] text-zinc-200 leading-relaxed placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)] resize-y"
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-600">
                  {entry.body.length} caracteres · se guarda solo
                </span>
                <button
                  onClick={onToggle}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/[0.05] transition-colors"
                >
                  <X className="w-3 h-3" /> Cerrar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const MONTHS_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
function monthShort(ymd: string): string {
  const mm = parseInt(ymd.slice(5, 7), 10)
  return MONTHS_SHORT[mm - 1] ?? ''
}
