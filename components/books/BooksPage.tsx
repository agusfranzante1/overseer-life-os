'use client'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Plus, Trash2 } from 'lucide-react'
import { type Book, type BookStatus, useBooksStore } from '@/lib/store/booksStore'

const STATUSES: { key: BookStatus; label: string; empty: string }[] = [
  { key: 'want', label: 'Quiero leer', empty: 'No hay libros pendientes por ahora.' },
  { key: 'reading', label: 'Leyendo', empty: 'No hay lecturas activas.' },
  { key: 'read', label: 'Leído', empty: 'Todavía no marcaste libros como leídos.' },
]

export function BooksPage() {
  const { books, addBook, updateBook, removeBook, setStatus } = useBooksStore()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')

  const grouped = useMemo(() => {
    const byStatus = new Map<BookStatus, Book[]>()
    for (const status of STATUSES) byStatus.set(status.key, [])
    for (const book of books) byStatus.get(book.status)?.push(book)
    for (const list of byStatus.values()) {
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    return byStatus
  }, [books])

  const createBook = () => {
    if (!title.trim() && !author.trim()) return
    addBook(title, author)
    setTitle('')
    setAuthor('')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-400" />
            Libros
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            Seguimiento simple de lo que querés leer, estás leyendo y ya terminaste.
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto] gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createBook() }}
            placeholder="Título"
            className="bg-zinc-900 border border-zinc-800 focus:border-emerald-500/50 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors"
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createBook() }}
            placeholder="Autor"
            className="bg-zinc-900 border border-zinc-800 focus:border-emerald-500/50 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors"
          />
          <button
            onClick={createBook}
            className="px-3 py-2 bg-emerald-500/15 border border-emerald-500/35 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {STATUSES.map((status) => {
          const list = grouped.get(status.key) ?? []
          return (
            <section key={status.key} className="space-y-3">
              <div className="px-1 flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100">{status.label}</h2>
                <span className="ml-auto text-[10px] text-zinc-500 tabular-nums">{list.length}</span>
              </div>
              <div className="space-y-3 min-h-40">
                {list.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onPatch={(patch) => updateBook(book.id, patch)}
                    onStatus={(next) => setStatus(book.id, next)}
                    onDelete={() => {
                      if (confirm(`Borrar "${book.title}"?`)) removeBook(book.id)
                    }}
                  />
                ))}
                {list.length === 0 && (
                  <p className="rounded-lg border border-dashed border-zinc-800 text-xs text-zinc-600 text-center py-8 px-3 leading-relaxed">
                    {status.empty}
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </motion.div>
  )
}

function BookCard({ book, onPatch, onStatus, onDelete }: {
  book: Book
  onPatch: (patch: Partial<Omit<Book, 'id' | 'createdAt' | 'updatedAt'>>) => void
  onStatus: (status: BookStatus) => void
  onDelete: () => void
}) {
  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-900/55 p-3 space-y-3">
      <div className="space-y-1.5">
        <input
          value={book.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="Título"
          className="w-full bg-transparent text-sm font-semibold text-zinc-100 placeholder-zinc-600 outline-none focus:bg-white/[0.04] rounded px-1 py-0.5 transition-colors"
        />
        <input
          value={book.author}
          onChange={(e) => onPatch({ author: e.target.value })}
          placeholder="Autor"
          className="w-full bg-transparent text-xs text-zinc-400 placeholder-zinc-700 outline-none focus:bg-white/[0.04] rounded px-1 py-0.5 transition-colors"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-600">Estado</span>
          <select
            value={book.status}
            onChange={(e) => onStatus(e.target.value as BookStatus)}
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/50 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none"
          >
            {STATUSES.map((status) => (
              <option key={status.key} value={status.key}>{status.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-600">Inicio</span>
          <input
            type="date"
            value={book.startDate ?? ''}
            onChange={(e) => onPatch({ startDate: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/50 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-600">Fin</span>
          <input
            type="date"
            value={book.endDate ?? ''}
            onChange={(e) => onPatch({ endDate: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/50 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none"
          />
        </label>
      </div>

      <textarea
        value={book.notes ?? ''}
        onChange={(e) => onPatch({ notes: e.target.value })}
        placeholder="Notas"
        rows={3}
        className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/50 rounded-lg px-2.5 py-2 text-xs text-zinc-200 placeholder-zinc-700 outline-none resize-y transition-colors"
      />

      <div className="flex justify-end">
        <button
          onClick={onDelete}
          className="text-xs text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg px-2 py-1.5 transition-colors flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" /> Borrar
        </button>
      </div>
    </article>
  )
}
