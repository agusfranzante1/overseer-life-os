'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Currency {
  code: string    // 'USD', 'EUR', 'ARS'
  symbol: string  // '$', '€', '$'
  name: string
  color: string
}

export interface Wallet {
  id: string
  name: string
  color: string
  icon: string
  currencyCodes: string[]
  createdAt: string
}

export interface Transaction {
  id: string
  type: 'income' | 'expense' | 'transfer'
  walletId: string
  currencyCode: string
  amount: number
  label: string
  category: string
  date: string
  timestamp: number
  // Transfer only
  toWalletId?: string
  toCurrencyCode?: string
  toAmount?: number
}

export interface DeletedWallet {
  id: string
  wallet: Wallet
  transactions: Transaction[]
  deletedAt: number   // Date.now()
}

export interface DistributionItem {
  id: string
  label: string
  percentage: number
  color: string
}

/** Pago/suscripción recurrente. Se aplica AUTOMÁTICAMENTE el día configurado
 *  de cada mes mediante `processRecurringExpenses(today)`, llamado en mount
 *  desde MoneyPage + AppShell + un safety net diario.
 *
 *  El `lastAppliedYearMonth` evita doble-cargo: si ya se aplicó el mes actual,
 *  no se vuelve a crear la transacción aunque el usuario abra la app 50 veces. */
export interface RecurringExpense {
  id: string
  walletId: string
  currencyCode: string
  amount: number
  label: string                // "Netflix", "Spotify", "Alquiler"
  category: string             // "Suscripción", "Casa", etc.
  dayOfMonth: number           // 1-28 (cap a 28 para evitar problemas con feb)
  active: boolean              // pausa el cargo sin borrarlo
  startDate: string            // YYYY-MM-DD — no se aplica antes de esta fecha
  endDate?: string             // YYYY-MM-DD — opcional, no se aplica después
  /** Última vez que se aplicó (YYYY-MM). Si === al mes actual → no doble-cargar. */
  lastAppliedYearMonth?: string
  /** Si true: cuando se aplica, además del expense en la wallet/currency
   *  destino, se anota como "subscription" para que la UI lo destaque. */
  isSubscription?: boolean
  notes?: string
  createdAt: string
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_CURRENCIES: Currency[] = [
  { code: 'USD', symbol: 'US$', name: 'Dólar', color: '#10b981' },
  { code: 'EUR', symbol: '€',   name: 'Euro',  color: '#6366f1' },
  { code: 'ARS', symbol: '$',   name: 'Peso',  color: '#f59e0b' },
]

const DEMO_WALLETS: Wallet[] = [
  { id: 'w1', name: 'Efectivo',      color: '#10b981', icon: '💵', currencyCodes: ['USD', 'ARS'], createdAt: '2026-01-01' },
  { id: 'w2', name: 'Binance',       color: '#f59e0b', icon: '🟡', currencyCodes: ['USD'],        createdAt: '2026-01-01' },
  { id: 'w3', name: 'PayPal',        color: '#003087', icon: '🔵', currencyCodes: ['USD', 'EUR'], createdAt: '2026-01-01' },
  { id: 'w4', name: 'Mercado Pago',  color: '#009ee3', icon: '💙', currencyCodes: ['ARS'],        createdAt: '2026-01-01' },
  { id: 'w5', name: 'Inversiones',   color: '#8b5cf6', icon: '📈', currencyCodes: ['USD'],        createdAt: '2026-01-01' },
]

const today = new Date().toISOString().split('T')[0]
const DEMO_TRANSACTIONS: Transaction[] = [
  { id: 't1',  type: 'income',  walletId: 'w1', currencyCode: 'USD', amount: 500,  label: 'Ingreso freelance',   category: 'Trabajo',    date: '2026-05-01', timestamp: 1 },
  { id: 't2',  type: 'expense', walletId: 'w1', currencyCode: 'USD', amount: 80,   label: 'Supermercado',        category: 'Comida',     date: '2026-05-03', timestamp: 2 },
  { id: 't3',  type: 'income',  walletId: 'w1', currencyCode: 'ARS', amount: 150000, label: 'Cobro ARS',         category: 'Trabajo',    date: '2026-05-01', timestamp: 3 },
  { id: 't4',  type: 'expense', walletId: 'w1', currencyCode: 'ARS', amount: 40000,  label: 'Alquiler',          category: 'Casa',       date: '2026-05-05', timestamp: 4 },
  { id: 't5',  type: 'income',  walletId: 'w2', currencyCode: 'USD', amount: 320,  label: 'Ganancia trading',    category: 'Inversión',  date: '2026-05-02', timestamp: 5 },
  { id: 't6',  type: 'expense', walletId: 'w2', currencyCode: 'USD', amount: 50,   label: 'Comisión',            category: 'Inversión',  date: '2026-05-04', timestamp: 6 },
  { id: 't7',  type: 'income',  walletId: 'w3', currencyCode: 'USD', amount: 200,  label: 'Cobro cliente',       category: 'Trabajo',    date: '2026-05-01', timestamp: 7 },
  { id: 't8',  type: 'income',  walletId: 'w3', currencyCode: 'EUR', amount: 150,  label: 'Proyecto EU',         category: 'Trabajo',    date: '2026-05-03', timestamp: 8 },
  { id: 't9',  type: 'income',  walletId: 'w4', currencyCode: 'ARS', amount: 80000, label: 'Depósito',           category: 'Transferencia', date: '2026-05-01', timestamp: 9 },
  { id: 't10', type: 'expense', walletId: 'w4', currencyCode: 'ARS', amount: 25000, label: 'Servicios',          category: 'Casa',       date: '2026-05-06', timestamp: 10 },
  { id: 't11', type: 'income',  walletId: 'w5', currencyCode: 'USD', amount: 1000, label: 'Depósito inversión',  category: 'Inversión',  date: '2026-04-01', timestamp: 11 },
  { id: 't12', type: 'expense', walletId: 'w5', currencyCode: 'USD', amount: 30,   label: 'Fee plataforma',      category: 'Inversión',  date: '2026-05-01', timestamp: 12 },
]

const DEFAULT_DISTRIBUTION: DistributionItem[] = [
  { id: 'd1', label: 'Inversión',          percentage: 25, color: '#6366f1' },
  { id: 'd2', label: 'Ahorro Neto',        percentage: 25, color: '#10b981' },
  { id: 'd3', label: 'Gastos',             percentage: 40, color: '#ef4444' },
  { id: 'd4', label: 'Ahorro con Objetivo',percentage: 10, color: '#f59e0b' },
]

// ─── Store ────────────────────────────────────────────────────────────────────

interface WalletState {
  currencies: Currency[]
  wallets: Wallet[]
  transactions: Transaction[]
  distribution: DistributionItem[]
  deletedWallets: DeletedWallet[]
  recurringExpenses: RecurringExpense[]

  addCurrency: (c: Currency) => void
  removeCurrency: (code: string) => void

  addWallet: (w: Omit<Wallet, 'id' | 'createdAt'>) => string
  removeWallet: (id: string) => void          // soft-delete (mueve a papelera)
  restoreWallet: (id: string) => void         // deshacer
  purgeDeletedWallet: (id: string) => void    // borrado definitivo
  purgeAllDeleted: () => void
  updateWallet: (id: string, patch: Partial<Wallet>) => void
  addCurrencyToWallet: (walletId: string, code: string) => void
  removeCurrencyFromWallet: (walletId: string, code: string) => void

  addTransaction: (t: Omit<Transaction, 'id' | 'timestamp'>) => void
  removeTransaction: (id: string) => void

  updateDistribution: (id: string, percentage: number) => void

  // Recurring expenses / subscriptions
  addRecurringExpense: (r: Omit<RecurringExpense, 'id' | 'createdAt'>) => string
  updateRecurringExpense: (id: string, patch: Partial<RecurringExpense>) => void
  removeRecurringExpense: (id: string) => void
  /** Idempotent — checks every active recurring against today's date and
   *  creates the corresponding expense transactions if they haven't been
   *  applied yet this month. Safe to call any number of times per day.
   *  Returns how many were applied (for optional UI feedback). */
  processRecurringExpenses: (todayISO?: string) => number
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      currencies: DEFAULT_CURRENCIES,
      wallets: [],
      transactions: [],
      distribution: DEFAULT_DISTRIBUTION,
      deletedWallets: [],
      recurringExpenses: [],

      addCurrency: (c) => set(s => ({ currencies: [...s.currencies, c] })),
      removeCurrency: (code) => set(s => ({
        currencies: s.currencies.filter(c => c.code !== code),
        wallets: s.wallets.map(w => ({ ...w, currencyCodes: w.currencyCodes.filter(c => c !== code) })),
        transactions: s.transactions.filter(t => t.currencyCode !== code && t.toCurrencyCode !== code),
      })),

      addWallet: (w) => {
        const id = genId()
        set(s => ({ wallets: [...s.wallets, { ...w, id, createdAt: new Date().toISOString().split('T')[0] }] }))
        return id
      },
      removeWallet: (id) => set(s => {
        const wallet = s.wallets.find(w => w.id === id)
        if (!wallet) return s
        const related = s.transactions.filter(t => t.walletId === id || t.toWalletId === id)
        const remaining = s.transactions.filter(t => t.walletId !== id && t.toWalletId !== id)
        const trashEntry: DeletedWallet = {
          id: wallet.id,
          wallet,
          transactions: related,
          deletedAt: Date.now(),
        }
        return {
          wallets: s.wallets.filter(w => w.id !== id),
          transactions: remaining,
          // Newest first; cap at 50 to keep storage bounded
          deletedWallets: [trashEntry, ...s.deletedWallets].slice(0, 50),
        }
      }),
      restoreWallet: (id) => set(s => {
        const entry = s.deletedWallets.find(d => d.id === id)
        if (!entry) return s
        // If a wallet was recreated with same id (unlikely) skip; else restore.
        const walletExists = s.wallets.some(w => w.id === id)
        return {
          wallets: walletExists ? s.wallets : [...s.wallets, entry.wallet],
          transactions: [...entry.transactions, ...s.transactions],
          deletedWallets: s.deletedWallets.filter(d => d.id !== id),
        }
      }),
      purgeDeletedWallet: (id) => set(s => ({
        deletedWallets: s.deletedWallets.filter(d => d.id !== id),
      })),
      purgeAllDeleted: () => set({ deletedWallets: [] }),
      updateWallet: (id, patch) => set(s => ({
        wallets: s.wallets.map(w => w.id === id ? { ...w, ...patch } : w),
      })),
      addCurrencyToWallet: (walletId, code) => set(s => ({
        wallets: s.wallets.map(w =>
          w.id === walletId && !w.currencyCodes.includes(code)
            ? { ...w, currencyCodes: [...w.currencyCodes, code] }
            : w
        ),
      })),
      removeCurrencyFromWallet: (walletId, code) => set(s => ({
        wallets: s.wallets.map(w =>
          w.id === walletId ? { ...w, currencyCodes: w.currencyCodes.filter(c => c !== code) } : w
        ),
      })),

      addTransaction: (t) => set(s => ({
        transactions: [{ ...t, id: genId(), timestamp: Date.now() }, ...s.transactions],
      })),
      removeTransaction: (id) => set(s => ({
        transactions: s.transactions.filter(t => t.id !== id),
      })),

      updateDistribution: (id, percentage) => set(s => ({
        distribution: s.distribution.map(d => d.id === id ? { ...d, percentage } : d),
      })),

      // ─── Recurring expenses ─────────────────────────────────────────
      addRecurringExpense: (r) => {
        const id = genId()
        const today = new Date().toISOString().split('T')[0]
        set(s => ({
          recurringExpenses: [
            ...s.recurringExpenses,
            {
              ...r,
              id,
              // Clamp day-of-month to 1-28 so Feb is always safe.
              dayOfMonth: Math.max(1, Math.min(28, Math.round(r.dayOfMonth || 1))),
              createdAt: today,
            },
          ],
        }))
        return id
      },
      updateRecurringExpense: (id, patch) => set(s => ({
        recurringExpenses: s.recurringExpenses.map(r => r.id === id ? {
          ...r,
          ...patch,
          dayOfMonth: patch.dayOfMonth !== undefined
            ? Math.max(1, Math.min(28, Math.round(patch.dayOfMonth)))
            : r.dayOfMonth,
        } : r),
      })),
      removeRecurringExpense: (id) => set(s => ({
        recurringExpenses: s.recurringExpenses.filter(r => r.id !== id),
      })),

      processRecurringExpenses: (todayISO) => {
        const today = todayISO ?? new Date().toISOString().split('T')[0]
        const [yearStr, monthStr, dayStr] = today.split('-')
        const todayYM = `${yearStr}-${monthStr}`
        const todayDay = parseInt(dayStr, 10)

        let appliedCount = 0
        set(s => {
          const newTransactions: Transaction[] = []
          const newRecurring = s.recurringExpenses.map(r => {
            if (!r.active) return r
            if (r.lastAppliedYearMonth === todayYM) return r       // ya cargado
            if (today < r.startDate) return r                       // todavía no empezó
            if (r.endDate && today > r.endDate) return r            // ya terminó
            if (todayDay < r.dayOfMonth) return r                   // antes del día de cargo

            // Wallet/currency must still be valid (user might have deleted them)
            const walletExists = s.wallets.some(w => w.id === r.walletId)
            const currencyValid = walletExists
              && s.currencies.some(c => c.code === r.currencyCode)
              && s.wallets.find(w => w.id === r.walletId)?.currencyCodes.includes(r.currencyCode)
            if (!walletExists || !currencyValid) {
              // Auto-pause so it doesn't keep silently failing.
              return { ...r, active: false }
            }

            // Apply: create an expense transaction dated to the configured
            // day-of-month of the CURRENT month. Date = YYYY-MM-DD with that
            // day, so cash-flow tables bucket it correctly.
            const chargeDate = `${yearStr}-${monthStr}-${String(r.dayOfMonth).padStart(2, '0')}`
            const txId = genId() + '_rec'
            newTransactions.push({
              id: txId,
              type: 'expense',
              walletId: r.walletId,
              currencyCode: r.currencyCode,
              amount: r.amount,
              label: r.label,
              category: r.category || (r.isSubscription ? 'Suscripción' : 'Recurrente'),
              date: chargeDate,
              timestamp: Date.now() + appliedCount,
            })
            appliedCount++
            return { ...r, lastAppliedYearMonth: todayYM }
          })

          if (appliedCount === 0) return s
          return {
            transactions: [...newTransactions, ...s.transactions],
            recurringExpenses: newRecurring,
          }
        })

        return appliedCount
      },
    }),
    {
      name: 'overseer-wallet',
      version: 2,
      // Older persisted state didn't have `recurringExpenses` — initialize
      // it to an empty array so downstream code doesn't crash.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<WalletState>
        if (!Array.isArray(p.recurringExpenses)) p.recurringExpenses = []
        return p as WalletState
      },
    }
  )
)

// ─── Selectors ────────────────────────────────────────────────────────────────

export function getWalletBalance(
  walletId: string,
  currencyCode: string,
  transactions: Transaction[]
): number {
  const outgoing = transactions
    .filter(t => t.walletId === walletId && t.currencyCode === currencyCode)
    .reduce((sum, t) => t.type === 'income' ? sum + t.amount : sum - t.amount, 0)
  const incoming = transactions
    .filter(t => t.toWalletId === walletId && t.toCurrencyCode === currencyCode)
    .reduce((sum, t) => sum + (t.toAmount ?? 0), 0)
  return outgoing + incoming
}

export function getMonthlyTotals(
  currencyCode: string,
  year: number,
  transactions: Transaction[]
): { month: number; income: number; expense: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const relevant = transactions.filter(t => t.currencyCode === currencyCode && t.date.startsWith(monthStr))
    const income  = relevant.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = relevant.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { month, income, expense }
  })
}
