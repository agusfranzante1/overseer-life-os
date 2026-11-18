'use client'
import { useState, useMemo, useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import { MessagesSquare, Send, Trash2, Search, Check, Undo2, Mic } from 'lucide-react'
import {
  useMessagesStore, destinos, filtrarMensajes, ordenarMensajes,
  type EstadoMensaje, type MensajeClaude,
} from '@/lib/store/messagesStore'

/** `false` en SSR / primer paint, `true` tras hidratar — el store persiste
 *  desde localStorage sincrónicamente en el cliente, así que sin este guard el
 *  primer render del cliente diverge del HTML del server. */
const noopSubscribe = () => () => {}
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

const INPUT = 'w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)]'

export function MensajesPage() {
  const mensajes = useMessagesStore((s) => s.mensajes)
  const addMensaje = useMessagesStore((s) => s.addMensaje)
  const mounted = useHydrated()

  const [estado, setEstado] = useState<EstadoMensaje | 'todos'>('pendiente')
  const [para, setPara] = useState('todos')
  const [query, setQuery] = useState('')
  const [nuevoPara, setNuevoPara] = useState('')
  const [nuevoTexto, setNuevoTexto] = useState('')

  const chats = useMemo(() => destinos(mensajes), [mensajes])
  const visibles = useMemo(
    () => ordenarMensajes(filtrarMensajes(mensajes, { estado, para, query })),
    [mensajes, estado, para, query],
  )
  const pendientes = mensajes.filter((m) => m.estado === 'pendiente').length

  const enviar = () => {
    if (!nuevoPara.trim() || !nuevoTexto.trim()) return
    addMensaje({ para: nuevoPara, texto: nuevoTexto.trim(), origen: 'app' })
    setNuevoTexto('')
  }

  if (!mounted) {
    return <div className="p-6"><div className="h-10 w-52 bg-white/[0.03] rounded-xl animate-pulse" /></div>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
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
            <MessagesSquare className="w-6 h-6 md:w-7 md:h-7" style={{ color: 'var(--app-accent)' }} />
          </span>
          <span className="text-hero pb-1">Mensajes para Claude</span>
        </h1>
        <p className="text-[13px] text-zinc-500">
          Lo que le dictás a un chat para que se lo pase a otro. El cartero los reparte y los marca entregados.
        </p>
      </div>

      {/* Escribir uno a mano */}
      <div className="rounded-2xl p-4 space-y-2.5" style={{ background: 'var(--card-bg)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <input
          value={nuevoPara}
          onChange={(e) => setNuevoPara(e.target.value)}
          placeholder="Para qué chat (ej: Karla Final)"
          list="mensajes-destinos"
          className={INPUT}
        />
        <datalist id="mensajes-destinos">
          {chats.map((c) => <option key={c} value={c} />)}
        </datalist>
        <textarea
          value={nuevoTexto}
          onChange={(e) => setNuevoTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar() }}
          placeholder="Qué le querés decir…"
          rows={3}
          className={`${INPUT} resize-y leading-relaxed`}
        />
        <div className="flex justify-end">
          <button
            onClick={enviar}
            disabled={!nuevoPara.trim() || !nuevoTexto.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 85%, transparent), color-mix(in srgb, var(--app-accent) 55%, transparent))' }}
          >
            <Send className="w-4 h-4" /> Dejar mensaje
          </button>
        </div>
      </div>

      {/* Filtros */}
      {mensajes.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {([['pendiente', `Pendientes${pendientes ? ` · ${pendientes}` : ''}`], ['entregado', 'Entregados'], ['todos', 'Todos']] as const).map(([k, label]) => (
              <Chip key={k} label={label} active={estado === k} onClick={() => setEstado(k)} />
            ))}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none"
              />
            </div>
          </div>
          {chats.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Chip label="Todos los chats" active={para === 'todos'} onClick={() => setPara('todos')} />
              {chats.map((c) => (
                <Chip key={c} label={c} active={para.toLowerCase() === c.toLowerCase()} onClick={() => setPara(para.toLowerCase() === c.toLowerCase() ? 'todos' : c)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {mensajes.length === 0 ? (
        <div className="text-center py-16 px-8 rounded-2xl border border-dashed border-zinc-700 bg-white/[0.02]">
          <MessagesSquare className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-300 mb-1">Todavía no hay mensajes</p>
          <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto">
            Cuando le digas a Claude &quot;mandale a tal chat que…&quot;, el mensaje aparece acá hasta que el cartero lo entregue.
          </p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-12 px-8 rounded-2xl border border-dashed border-zinc-800 bg-white/[0.02]">
          <p className="text-sm text-zinc-400">
            {estado === 'pendiente' && !query && para === 'todos' ? 'No hay nada pendiente: todo entregado.' : 'Ningún mensaje coincide con el filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((m) => <MensajeCard key={m.id} m={m} />)}
        </div>
      )}
    </motion.div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
      style={{
        background: active ? 'color-mix(in srgb, var(--app-accent) 18%, transparent)' : 'rgba(255,255,255,0.03)',
        borderColor: active ? 'color-mix(in srgb, var(--app-accent) 45%, transparent)' : 'rgba(255,255,255,0.08)',
        color: active ? 'var(--app-accent)' : '#a1a1aa',
      }}
    >
      {label}
    </button>
  )
}

function fechaCorta(ymd: string): string {
  const [y, mo, d] = ymd.split('-')
  return y && mo && d ? `${d}/${mo}/${y}` : ymd
}
function horaCorta(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function MensajeCard({ m }: { m: MensajeClaude }) {
  const setEstado = useMessagesStore((s) => s.setEstado)
  const removeMensaje = useMessagesStore((s) => s.removeMensaje)
  const entregado = m.estado === 'entregado'

  return (
    <div
      className="rounded-2xl px-5 py-4 group"
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${entregado ? 'rgba(255,255,255,0.06)' : 'color-mix(in srgb, var(--app-accent) 30%, transparent)'}`,
        opacity: entregado ? 0.7 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
              style={{
                background: 'color-mix(in srgb, var(--app-accent) 12%, transparent)',
                color: 'var(--app-accent)',
                border: '1px solid color-mix(in srgb, var(--app-accent) 35%, transparent)',
              }}>
              Para {m.para.trim() || '—'}
            </span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${
              entregado ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10'
            }`}>
              {entregado ? 'Entregado' : 'Pendiente'}
            </span>
          </div>
          <p className="text-[14px] text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">{m.texto}</p>
          <p className="text-[11px] text-zinc-500 mt-2 flex items-center gap-1.5 flex-wrap">
            {m.origen === 'voz' && <Mic className="w-3 h-3" />}
            <span>{fechaCorta(m.fecha)}</span>
            {m.origen && m.origen !== 'voz' && <span>· {m.origen}</span>}
            {entregado && m.entregadoEn && <span>· entregado {horaCorta(m.entregadoEn)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEstado(m.id, entregado ? 'pendiente' : 'entregado')}
            title={entregado ? 'Volver a pendiente' : 'Marcar entregado'}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            {entregado ? <Undo2 className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          </button>
          <button
            onClick={() => { if (confirm('¿Borrar este mensaje? No se puede deshacer.')) removeMensaje(m.id) }}
            title="Borrar mensaje"
            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
