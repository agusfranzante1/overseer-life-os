'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BookStatus = 'want' | 'reading' | 'read'

export interface Book {
  id: string
  title: string
  author: string
  status: BookStatus
  startDate?: string
  endDate?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

interface BooksState {
  books: Book[]
  addBook: (title: string, author: string) => string
  updateBook: (id: string, patch: Partial<Omit<Book, 'id' | 'createdAt' | 'updatedAt'>>) => void
  removeBook: (id: string) => void
  setStatus: (id: string, status: BookStatus) => void
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function nowISO(): string {
  return new Date().toISOString()
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export const useBooksStore = create<BooksState>()(
  persist(
    (set) => ({
      books: [],

      addBook: (title, author) => {
        const id = genId()
        const now = nowISO()
        set((s) => ({
          books: [...s.books, {
            id,
            title: title.trim() || 'Libro sin título',
            author: author.trim(),
            status: 'want',
            createdAt: now,
            updatedAt: now,
          }],
        }))
        return id
      },

      updateBook: (id, patch) => set((s) => ({
        books: s.books.map((book) => book.id !== id ? book : {
          ...book,
          ...patch,
          title: patch.title !== undefined ? (patch.title.trim() || 'Libro sin título') : book.title,
          author: patch.author !== undefined ? patch.author.trim() : book.author,
          startDate: patch.startDate !== undefined ? cleanOptional(patch.startDate) : book.startDate,
          endDate: patch.endDate !== undefined ? cleanOptional(patch.endDate) : book.endDate,
          notes: patch.notes !== undefined ? cleanOptional(patch.notes) : book.notes,
          updatedAt: nowISO(),
        }),
      })),

      removeBook: (id) => set((s) => ({
        books: s.books.filter((book) => book.id !== id),
      })),

      setStatus: (id, status) => set((s) => ({
        books: s.books.map((book) => book.id !== id ? book : { ...book, status, updatedAt: nowISO() }),
      })),
    }),
    {
      name: 'overseer-books',
      partialize: (s) => ({ books: s.books }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!Array.isArray(state.books)) state.books = []
      },
    },
  ),
)
