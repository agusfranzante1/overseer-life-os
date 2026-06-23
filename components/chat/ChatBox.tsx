'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat } from '@/hooks/useChat'
import { useTranslation } from '@/hooks/useTranslation'
import { useAppStore } from '@/lib/store/appStore'
import { useChatStore } from '@/lib/store/chatStore'
import { Send, Trash2, MessageSquare, ChevronDown, Mic, MicOff, X, Check, GraduationCap } from 'lucide-react'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import ReactMarkdown from 'react-markdown'

/** Inline correction widget. Lets the user say "this was wrong, here's what
 *  I meant" — saved correction goes to chatStore and is injected as a
 *  few-shot example into all future intent classifier calls. */
function CorrectionForm({
  userInput,
  wrongInterpretation,
  onClose,
}: {
  userInput: string
  wrongInterpretation: string
  onClose: () => void
}) {
  const addCorrection = useChatStore((s) => s.addCorrection)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    addCorrection({ userInput, wrongInterpretation, correctInterpretation: trimmed })
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-2 -mx-1 overflow-hidden"
    >
      <div className="bg-zinc-900 border border-amber-500/30 rounded-lg p-2 space-y-2">
        <p className="text-[10px] text-amber-300/80 font-mono uppercase tracking-wider flex items-center gap-1.5">
          <GraduationCap className="w-3 h-3" /> Enseñame
        </p>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() }
            if (e.key === 'Escape') { e.preventDefault(); onClose() }
          }}
          placeholder="¿Qué deberías haber entendido? Ej: el título era 'limpiar porton', no 'tarea'"
          rows={2}
          className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500/50 placeholder:text-zinc-600 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] text-zinc-600">Cmd/Ctrl+Enter para guardar · Esc cancelar</p>
          <div className="flex gap-1">
            <button
              onClick={onClose}
              className="px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="px-2 py-1 text-[10px] text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> Guardar
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="ml-4 mb-1 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 mb-1 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

/** Lists everything the user has taught the chat. Each row is one
 *  correction with a delete button. Useful for cleaning up bad lessons. */
function CorrectionsPanel({ onClose }: { onClose: () => void }) {
  const corrections = useChatStore((s) => s.corrections)
  const removeCorrection = useChatStore((s) => s.removeCorrection)
  const clearCorrections = useChatStore((s) => s.clearCorrections)
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden border-b border-amber-500/20 bg-amber-500/5"
    >
      <div className="px-4 py-2 flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80 flex items-center gap-1.5">
          <GraduationCap className="w-3 h-3" /> Lecciones aprendidas ({corrections.length})
        </p>
        <div className="flex items-center gap-2">
          {corrections.length > 0 && (
            <button
              onClick={() => { if (confirm('Borrar todas las lecciones?')) clearCorrections() }}
              className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
            >
              borrar todo
            </button>
          )}
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto px-4 pb-3 space-y-2">
        {corrections.length === 0 && (
          <p className="text-[11px] text-zinc-500 italic">Todavía no le enseñaste nada.</p>
        )}
        {corrections.map((c) => (
          <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded p-2 text-[11px] space-y-1">
            <p className="text-zinc-400">
              <span className="text-zinc-600">vos:</span> "{c.userInput}"
            </p>
            <p className="text-amber-300/80">
              <span className="text-zinc-600">debería:</span> {c.correctInterpretation}
            </p>
            <button
              onClick={() => removeCorrection(c.id)}
              className="text-[9px] text-zinc-600 hover:text-red-400 transition-colors"
            >
              borrar lección
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export function ChatBox() {
  const { messages, isThinking, sendMessage, clearHistory } = useChat()
  const { t } = useTranslation()
  const { chatOpen, setChatOpen, language } = useAppStore()
  const corrections = useChatStore((s) => s.corrections)
  const [input, setInput] = useState('')
  const [interim, setInterim] = useState('')   // live partial transcript while speaking
  const [correctingMessageId, setCorrectingMessageId] = useState<string | null>(null)
  const [showCorrectionsPanel, setShowCorrectionsPanel] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Voice input — transcribes microphone to text in the user's language
  const voice = useVoiceInput({
    lang: language === 'es' ? 'es-AR' : 'en-US',
    onFinalText: (chunk) => {
      // Append final chunk to the input (with a space if there's already content)
      setInput((prev) => (prev ? prev + ' ' : '') + chunk.trim())
      setInterim('')
    },
    onInterimText: (chunk) => setInterim(chunk),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (voice.listening) voice.stop()
    const text = input.trim()
    if (!text) return
    setInput('')
    setInterim('')
    sendMessage(text)
  }

  const handleMic = () => {
    if (!voice.supported) {
      alert('Tu navegador no soporta el micrófono nativo. Usá Chrome, Edge o Safari.')
      return
    }
    if (!chatOpen) setChatOpen(true)
    voice.toggle()
  }

  const visibleMessages = messages.slice(-50)

  // En mobile (<sm) el sidebar es un drawer, así que el chat ocupa TODO el
  // ancho (left-0). En desktop se corre a la derecha del sidebar fijo.
  return (
    <div className="fixed bottom-0 right-0 left-0 sm:left-[var(--sidebar-width,220px)] z-30 flex flex-col">
      {/* Chat panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 320, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden bg-zinc-900 border-t border-zinc-700"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                {t('chat.assistant')}
              </span>
              <div className="flex items-center gap-3">
                {corrections.length > 0 && (
                  <button
                    onClick={() => setShowCorrectionsPanel((v) => !v)}
                    className="text-amber-400/80 hover:text-amber-300 transition-colors text-[10px] font-mono uppercase tracking-wider flex items-center gap-1"
                    title="Ver lo que le enseñaste"
                  >
                    <GraduationCap className="w-3 h-3" /> {corrections.length}
                  </button>
                )}
                <button
                  onClick={clearHistory}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  title={t('chat.clear')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Corrections panel — shows everything the user has taught the
                bot. Lets them review or delete individual lessons. */}
            <AnimatePresence>
              {showCorrectionsPanel && (
                <CorrectionsPanel onClose={() => setShowCorrectionsPanel(false)} />
              )}
            </AnimatePresence>

            <div className="h-[calc(320px-80px)] overflow-y-auto px-4 py-3 space-y-3">
              {visibleMessages.length === 0 && (
                <p className="text-zinc-500 text-xs text-center mt-8">
                  {t('chat.placeholder')}
                </p>
              )}
              {visibleMessages.map((msg, i) => {
                // For an assistant message, the "user input that caused this"
                // is the last user message earlier in the visibleMessages array.
                const prevUserMsg = msg.role === 'assistant'
                  ? [...visibleMessages.slice(0, i)].reverse().find((m) => m.role === 'user')
                  : null
                const canCorrect = msg.role === 'assistant' && !!prevUserMsg
                const isShowingForm = correctingMessageId === msg.id
                return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0 }}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-zinc-800 text-zinc-200'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <MarkdownContent content={msg.content} />
                    ) : (
                      <span>{msg.content}</span>
                    )}
                  </div>
                  {/* Feedback footer — only on assistant messages following a
                      user turn. Lets the user record a correction that future
                      classifier calls will see as a personal example. */}
                  {canCorrect && !isShowingForm && (
                    <button
                      onClick={() => setCorrectingMessageId(msg.id)}
                      className="mt-1 text-[10px] text-zinc-600 hover:text-amber-300 transition-colors flex items-center gap-1 px-1"
                      title="Enseñá al chat qué era lo correcto"
                    >
                      <GraduationCap className="w-2.5 h-2.5" /> no era eso
                    </button>
                  )}
                  {canCorrect && isShowingForm && prevUserMsg && (
                    <div className="w-full max-w-[85%]">
                      <CorrectionForm
                        userInput={prevUserMsg.content}
                        wrongInterpretation={msg.content}
                        onClose={() => setCorrectingMessageId(null)}
                      />
                    </div>
                  )}
                </motion.div>
              )})}
              {isThinking && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-zinc-800 rounded-xl px-3 py-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                          className="w-1.5 h-1.5 bg-indigo-400 rounded-full"
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar — always visible */}
      <div className="bg-zinc-950 border-t border-zinc-800 px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChatOpen(!chatOpen)}
            className="shrink-0 text-zinc-400 hover:text-indigo-400 transition-colors"
          >
            {chatOpen ? <ChevronDown className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
          </button>

          {!chatOpen && messages.length > 0 && (
            <div className="flex-1 text-xs text-zinc-500 truncate">
              {messages[messages.length - 1]?.content?.slice(0, 60)}...
            </div>
          )}

          {chatOpen && (
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={voice.listening ? '🎙️ Escuchando...' : t('chat.placeholder')}
                className={`w-full bg-zinc-800 border rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none transition-colors ${
                  voice.listening
                    ? 'border-red-500/60 focus:border-red-500'
                    : 'border-zinc-700 focus:border-indigo-500'
                }`}
                autoComplete="off"
              />
              {interim && (
                <div className="absolute left-3 right-3 -top-5 text-[10px] text-red-400/80 italic truncate font-mono">
                  &ldquo;{interim}&rdquo;
                </div>
              )}
            </div>
          )}

          {!chatOpen && (
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (!chatOpen) setChatOpen(true)
              }}
              onFocus={() => setChatOpen(true)}
              placeholder={t('chat.placeholder')}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
              autoComplete="off"
            />
          )}

          {/* Mic button */}
          <motion.button
            type="button"
            onClick={handleMic}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={voice.listening ? 'Parar grabación' : 'Grabar voz'}
            className={`shrink-0 rounded-lg p-1.5 transition-all ${
              voice.listening
                ? 'bg-red-500 text-white animate-pulse'
                : voice.supported
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                  : 'bg-zinc-900 text-zinc-700 cursor-not-allowed'
            }`}
          >
            {voice.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </motion.button>

          <motion.button
            type="submit"
            disabled={!input.trim() || isThinking}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg p-1.5 transition-colors"
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </form>
        {voice.error && (
          <div className="mt-2 px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/30 flex items-start gap-2">
            <p className="text-[10px] text-red-300 leading-relaxed whitespace-pre-line flex-1">{voice.error}</p>
            <button onClick={voice.clearError} className="text-red-400/60 hover:text-red-300 text-xs shrink-0">✕</button>
          </div>
        )}
      </div>
    </div>
  )
}
