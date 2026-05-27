'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function todayISO() { return new Date().toISOString() }
function todayDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountStatus = 'evaluation' | 'funded' | 'failed' | 'paid_out'
export type AccountMode = 'conservative' | 'aggressive'
export type Mood = 'confident' | 'calm' | 'excited' | 'anxious' | 'fearful' | 'frustrated' | 'tilted' | 'neutral'

export const MOOD_LABELS: Record<Mood, { label: string; emoji: string; color: string }> = {
  confident:  { label: 'Confiado',     emoji: '💪', color: '#10b981' },
  calm:       { label: 'Tranquilo',    emoji: '😌', color: '#06b6d4' },
  excited:    { label: 'Entusiasmado', emoji: '⚡', color: '#f59e0b' },
  anxious:    { label: 'Ansioso',      emoji: '😬', color: '#f97316' },
  fearful:    { label: 'Con miedo',    emoji: '😨', color: '#a855f7' },
  frustrated: { label: 'Frustrado',    emoji: '😤', color: '#ef4444' },
  tilted:     { label: 'Tilteado',     emoji: '🌋', color: '#dc2626' },
  neutral:    { label: 'Neutro',       emoji: '😐', color: '#71717a' },
}

export interface PropFirmRules {
  dailyDrawdownPct?: number
  dailyDrawdownIsStatic?: boolean      // static = from start balance / trailing = from peak
  totalDrawdownPct?: number
  totalDrawdownIsTrailing?: boolean
  profitTargetPct?: number
  minTradingDays?: number
  maxTradingDays?: number
  consistencyRulePct?: number           // max % of total profit from single day
  payoutFreqDays?: number
  minPayoutDays?: number                // days you must trade before requesting payout
  payoutSplitPct?: number               // trader's split, e.g. 80
  payoutRulesNote?: string
  /** Some prop firms (e.g. Apex) charge a one-time "activation fee" when
   *  you pass the evaluation and the funded account is issued. Others
   *  (e.g. Topstep) don't charge anything extra. When set, the user gets
   *  prompted for the exact paid amount when moving an account from
   *  `evaluation` → `funded`. Set to 0 if the firm doesn't charge one. */
  activationFeeDefault?: number
}

export interface PropFirm {
  id: string
  name: string
  color: string
  rules: PropFirmRules
  notes?: string
  createdAt: string
}

export interface Account {
  id: string
  firmId: string
  alias: string                  // user label
  accountSize: number            // initial balance (e.g. 50000)
  evaluationCost: number         // what user paid for the evaluation
  /** What the user paid as the one-time activation fee when transitioning
   *  from evaluation → funded. 0 (or undefined) for firms that don't
   *  charge one. Adds to the total cost of operating this account. */
  activationFee?: number
  status: AccountStatus
  startDate: string              // YYYY-MM-DD
  closedDate?: string
  notes?: string
  createdAt: string
  // ── Management config (Tanda 2) ───────────────────────────────────
  mode?: AccountMode             // 'conservative' = slow & safe / 'aggressive' = max speed
  maxRiskPerTradePct?: number    // % of balance willing to risk per trade
  maxDailyLossPct?: number       // self-imposed daily loss cap (often < firm rule)
  maxDailyTrades?: number        // max trades per day
  targetPayoutAmount?: number    // user's desired payout amount per cycle
}

export interface Payout {
  id: string
  accountId: string
  amount: number
  date: string                   // YYYY-MM-DD
  note?: string
  createdAt: string
}

export interface Strategy {
  id: string
  name: string
  color: string
  description?: string
  instrument: string             // 'NQ', 'MNQ', 'GC', 'MGC', 'ES', 'MES', 'CL'
  timeframe: string              // '1m', '5m', '15m', '1h'
  session: string                // 'NY', 'LDN', 'Asia'
  riskPerTradePct?: number
  targetRRR?: number
  rules: string                  // multiline free-text
  active: boolean
  createdAt: string
}

export interface Trade {
  id: string
  accountId: string
  strategyId: string
  dateTime: string               // ISO datetime (entry)
  exitDateTime?: string          // ISO datetime (exit) — for duration calc
  instrument: string
  direction: 'long' | 'short'
  plannedPnL: number             // theoretical strategy result ($)
  actualPnL: number              // real account result ($)
  rMultipleStrategy?: number     // R multiple per strategy plan
  rMultipleActual?: number       // R multiple actually realized
  moodBefore?: Mood              // emotional state before entry
  moodAfter?: Mood               // emotional state after close
  notes?: string
  screenshotUrl?: string
  createdAt: string
}

// ─── Emotional journal entry (separate from trade errors) ─────────────────────
export interface EmotionalEntry {
  id: string
  date: string                   // YYYY-MM-DD
  mood: Mood
  energyBefore: number           // 1-10
  energyAfter?: number           // 1-10
  description: string
  tags?: string[]                // 'pre-session', 'post-session', 'mid-session', 'tilt', 'flow'
  tradeIds?: string[]            // optional link to trades
  createdAt: string
}

export type ErrorType =
  | 'late_entry'
  | 'early_entry'
  | 'wrong_size'
  | 'no_stop'
  | 'moved_stop'
  | 'closed_early'
  | 'closed_late'
  | 'fear'
  | 'fomo'
  | 'revenge_trade'
  | 'broke_rules'
  | 'other'

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  late_entry:    'Entrada tardía',
  early_entry:   'Entrada anticipada',
  wrong_size:    'Tamaño incorrecto',
  no_stop:       'Sin stop loss',
  moved_stop:    'Moví el stop',
  closed_early:  'Cerré antes',
  closed_late:   'Cerré tarde',
  fear:          'Miedo',
  fomo:          'FOMO',
  revenge_trade: 'Revenge trade',
  broke_rules:   'Rompí las reglas',
  other:         'Otro',
}

export interface ErrorLog {
  id: string
  tradeId: string
  strategyId: string
  accountId: string
  type: ErrorType
  description: string
  screenshotUrl?: string
  createdAt: string
}

// ─── Default firms / strategies (demo) ────────────────────────────────────────

const DEFAULT_FIRMS: PropFirm[] = [
  {
    id: 'firm_topstep', name: 'Topstep', color: '#0ea5e9',
    rules: {
      dailyDrawdownPct: 3, dailyDrawdownIsStatic: false,
      totalDrawdownPct: 4, totalDrawdownIsTrailing: true,
      profitTargetPct: 6, minTradingDays: 5,
      consistencyRulePct: 50, payoutFreqDays: 14, minPayoutDays: 7,
      payoutSplitPct: 100,
      activationFeeDefault: 0,  // Topstep no cobra activation fee
    },
    createdAt: todayISO(),
  },
  {
    id: 'firm_tpt', name: 'Take Profit Trader', color: '#a855f7',
    rules: {
      dailyDrawdownPct: 0, dailyDrawdownIsStatic: false,
      totalDrawdownPct: 4, totalDrawdownIsTrailing: false,
      profitTargetPct: 6, minTradingDays: 5,
      consistencyRulePct: 50, payoutFreqDays: 14,
      payoutSplitPct: 90,
      activationFeeDefault: 0,  // TPT no cobra activation fee
    },
    createdAt: todayISO(),
  },
  {
    id: 'firm_apex', name: 'Apex Trader Funding', color: '#f59e0b',
    rules: {
      dailyDrawdownPct: 0, totalDrawdownPct: 5, totalDrawdownIsTrailing: true,
      profitTargetPct: 6, minTradingDays: 7,
      consistencyRulePct: 30, payoutFreqDays: 14,
      payoutSplitPct: 90,
      activationFeeDefault: 130,  // Apex cobra ~USD 130 al fondearte
    },
    createdAt: todayISO(),
  },
]

const DEFAULT_STRATEGIES: Strategy[] = [
  {
    id: 'strat_demo1', name: 'NQ NY Open Reversal', color: '#10b981',
    instrument: 'MNQ', timeframe: '5m', session: 'NY',
    riskPerTradePct: 0.5, targetRRR: 2,
    rules: 'Entrada en reversión a la apertura de NY (9:30 ET).\n- Esperar 5min de mercado abierto.\n- Confirmar con vela de absorción.\n- Stop en máximo/mínimo previo.',
    active: true,
    createdAt: todayISO(),
  },
  {
    id: 'strat_demo2', name: 'GC London Breakout', color: '#f59e0b',
    instrument: 'MGC', timeframe: '15m', session: 'LDN',
    riskPerTradePct: 0.4, targetRRR: 2.5,
    rules: 'Rompimiento de rango asiático en oro al abrir Londres (3:00 ET).\n- Entrada solo si vela cierra > rango.\n- Stop al medio del rango.',
    active: true,
    createdAt: todayISO(),
  },
]

// ─── Store ────────────────────────────────────────────────────────────────────

interface State {
  firms: PropFirm[]
  accounts: Account[]
  strategies: Strategy[]
  trades: Trade[]
  payouts: Payout[]
  errors: ErrorLog[]
  emotional: EmotionalEntry[]

  // Firms
  addFirm: (firm: Omit<PropFirm, 'id' | 'createdAt'>) => string
  updateFirm: (id: string, patch: Partial<PropFirm>) => void
  removeFirm: (id: string) => void

  // Accounts
  addAccount: (a: Omit<Account, 'id' | 'createdAt'>) => string
  updateAccount: (id: string, patch: Partial<Account>) => void
  removeAccount: (id: string) => void

  // Strategies
  addStrategy: (s: Omit<Strategy, 'id' | 'createdAt'>) => string
  updateStrategy: (id: string, patch: Partial<Strategy>) => void
  removeStrategy: (id: string) => void

  // Trades
  addTrade: (t: Omit<Trade, 'id' | 'createdAt'>) => string
  updateTrade: (id: string, patch: Partial<Trade>) => void
  removeTrade: (id: string) => void

  // Payouts
  addPayout: (p: Omit<Payout, 'id' | 'createdAt'>) => string
  removePayout: (id: string) => void

  // Errors
  addError: (e: Omit<ErrorLog, 'id' | 'createdAt'>) => string
  removeError: (id: string) => void

  // Emotional journal
  addEmotional: (e: Omit<EmotionalEntry, 'id' | 'createdAt'>) => string
  updateEmotional: (id: string, patch: Partial<EmotionalEntry>) => void
  removeEmotional: (id: string) => void
}

export const useTradingStore = create<State>()(
  persist(
    (set) => ({
      firms: [],
      accounts: [],
      strategies: [],
      trades: [],
      payouts: [],
      errors: [],
      emotional: [],

      addFirm: (firm) => {
        const id = genId()
        set((s) => ({ firms: [...s.firms, { ...firm, id, createdAt: todayISO() }] }))
        return id
      },
      updateFirm: (id, patch) => set((s) => ({
        firms: s.firms.map((f) => f.id === id ? { ...f, ...patch } : f),
      })),
      removeFirm: (id) => set((s) => ({ firms: s.firms.filter((f) => f.id !== id) })),

      addAccount: (a) => {
        const id = genId()
        set((s) => ({ accounts: [...s.accounts, { ...a, id, createdAt: todayISO() }] }))
        return id
      },
      updateAccount: (id, patch) => set((s) => ({
        accounts: s.accounts.map((a) => a.id === id ? { ...a, ...patch } : a),
      })),
      removeAccount: (id) => set((s) => ({
        accounts: s.accounts.filter((a) => a.id !== id),
        trades: s.trades.filter((t) => t.accountId !== id),
        payouts: s.payouts.filter((p) => p.accountId !== id),
      })),

      addStrategy: (st) => {
        const id = genId()
        set((s) => ({ strategies: [...s.strategies, { ...st, id, createdAt: todayISO() }] }))
        return id
      },
      updateStrategy: (id, patch) => set((s) => ({
        strategies: s.strategies.map((st) => st.id === id ? { ...st, ...patch } : st),
      })),
      removeStrategy: (id) => set((s) => ({ strategies: s.strategies.filter((st) => st.id !== id) })),

      addTrade: (t) => {
        const id = genId()
        set((s) => ({ trades: [{ ...t, id, createdAt: todayISO() }, ...s.trades] }))
        return id
      },
      updateTrade: (id, patch) => set((s) => ({
        trades: s.trades.map((t) => t.id === id ? { ...t, ...patch } : t),
      })),
      removeTrade: (id) => set((s) => ({
        trades: s.trades.filter((t) => t.id !== id),
        errors: s.errors.filter((e) => e.tradeId !== id),
      })),

      addPayout: (p) => {
        const id = genId()
        set((s) => ({ payouts: [{ ...p, id, createdAt: todayISO() }, ...s.payouts] }))
        return id
      },
      removePayout: (id) => set((s) => ({ payouts: s.payouts.filter((p) => p.id !== id) })),

      addError: (e) => {
        const id = genId()
        set((s) => ({ errors: [{ ...e, id, createdAt: todayISO() }, ...s.errors] }))
        return id
      },
      removeError: (id) => set((s) => ({ errors: s.errors.filter((e) => e.id !== id) })),

      addEmotional: (e) => {
        const id = genId()
        set((s) => ({ emotional: [{ ...e, id, createdAt: todayISO() }, ...s.emotional] }))
        return id
      },
      updateEmotional: (id, patch) => set((s) => ({
        emotional: s.emotional.map((e) => e.id === id ? { ...e, ...patch } : e),
      })),
      removeEmotional: (id) => set((s) => ({ emotional: s.emotional.filter((e) => e.id !== id) })),
    }),
    { name: 'overseer-trading' }
  )
)

// ─── Selectors ────────────────────────────────────────────────────────────────

export function getAccountBalance(account: Account, trades: Trade[], payouts: Payout[]): number {
  const tradePnL = trades.filter((t) => t.accountId === account.id).reduce((s, t) => s + t.actualPnL, 0)
  const withdrawn = payouts.filter((p) => p.accountId === account.id).reduce((s, p) => s + p.amount, 0)
  return account.accountSize + tradePnL - withdrawn
}

export function getAccountPeakBalance(account: Account, trades: Trade[]): number {
  // Walk forward through trades in chronological order, track running peak (no payouts in peak calc — trailing DD often based on equity high)
  const accountTrades = trades
    .filter((t) => t.accountId === account.id)
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  let balance = account.accountSize
  let peak = balance
  for (const t of accountTrades) {
    balance += t.actualPnL
    if (balance > peak) peak = balance
  }
  return peak
}

export function getAccountStats(account: Account, firms: PropFirm[], trades: Trade[], payouts: Payout[]) {
  const firm = firms.find((f) => f.id === account.firmId)
  const accountTrades = trades.filter((t) => t.accountId === account.id)
  const accountPayouts = payouts.filter((p) => p.accountId === account.id)
  const balance = getAccountBalance(account, trades, payouts)
  const peak = getAccountPeakBalance(account, trades)

  const totalPnL = balance - account.accountSize + accountPayouts.reduce((s, p) => s + p.amount, 0)
  const totalWithdrawn = accountPayouts.reduce((s, p) => s + p.amount, 0)
  const wins = accountTrades.filter((t) => t.actualPnL > 0).length
  const losses = accountTrades.filter((t) => t.actualPnL < 0).length
  const winRate = accountTrades.length > 0 ? (wins / accountTrades.length) * 100 : 0

  // Distinct trading days
  const tradingDays = new Set(accountTrades.map((t) => t.dateTime.slice(0, 10))).size

  // Profit target progress
  const profitTargetUSD = firm?.rules.profitTargetPct
    ? account.accountSize * (firm.rules.profitTargetPct / 100)
    : null
  const profitTargetProgress = profitTargetUSD !== null && profitTargetUSD > 0
    ? Math.max(0, Math.min(100, (totalPnL / profitTargetUSD) * 100))
    : null

  // Drawdown levels
  const totalDDLimit = firm?.rules.totalDrawdownPct
    ? account.accountSize * (firm.rules.totalDrawdownPct / 100)
    : null
  const ddBaseline = firm?.rules.totalDrawdownIsTrailing ? peak : account.accountSize
  const ddCurrentUSD = ddBaseline - balance
  const ddRemainingUSD = totalDDLimit !== null ? totalDDLimit - ddCurrentUSD : null

  return {
    firm,
    balance,
    peak,
    totalPnL,
    totalWithdrawn,
    tradeCount: accountTrades.length,
    tradingDays,
    wins, losses, winRate,
    profitTargetUSD,
    profitTargetProgress,
    totalDDLimit,
    ddBaseline,
    ddCurrentUSD,
    ddRemainingUSD,
    ddRemainingPct: totalDDLimit && totalDDLimit > 0 ? Math.max(0, (ddRemainingUSD! / totalDDLimit) * 100) : null,
    netROI: account.evaluationCost > 0 ? ((totalWithdrawn - account.evaluationCost) / account.evaluationCost) * 100 : null,
  }
}

export function getStrategyStats(strategyId: string, trades: Trade[], errors: ErrorLog[]) {
  const stTrades = trades.filter((t) => t.strategyId === strategyId)
  const stErrors = errors.filter((e) => e.strategyId === strategyId)
  const idealPnL = stTrades.reduce((s, t) => s + t.plannedPnL, 0)
  const realPnL = stTrades.reduce((s, t) => s + t.actualPnL, 0)
  const slippage = idealPnL - realPnL  // money lost due to execution errors
  const errorRate = stTrades.length > 0 ? (stErrors.length / stTrades.length) * 100 : 0
  const wins = stTrades.filter((t) => t.actualPnL > 0).length
  const winRate = stTrades.length > 0 ? (wins / stTrades.length) * 100 : 0
  return { tradeCount: stTrades.length, errorCount: stErrors.length, idealPnL, realPnL, slippage, errorRate, wins, winRate }
}

export { todayDate, todayISO }

// ─── Time-period filtering ────────────────────────────────────────────────────

export type Period = 'today' | '7d' | '30d' | '90d' | 'year' | 'all'

export function filterByPeriod<T extends { dateTime?: string; date?: string; createdAt?: string }>(
  items: T[], period: Period
): T[] {
  if (period === 'all') return items
  const now = Date.now()
  const cutoff = (() => {
    if (period === 'today') {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime()
    }
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
    return now - days * 86400000
  })()
  return items.filter((it) => {
    const ts = it.dateTime ?? it.date ?? it.createdAt
    if (!ts) return true
    return new Date(ts).getTime() >= cutoff
  })
}

// ─── Advanced metrics (Tanda 1) ───────────────────────────────────────────────

export function getProfitFactor(trades: Trade[]): number | null {
  if (trades.length === 0) return null
  const grossWin  = trades.filter((t) => t.actualPnL > 0).reduce((s, t) => s + t.actualPnL, 0)
  const grossLoss = Math.abs(trades.filter((t) => t.actualPnL < 0).reduce((s, t) => s + t.actualPnL, 0))
  if (grossLoss === 0) return grossWin > 0 ? 99 : null
  return Math.round((grossWin / grossLoss) * 100) / 100
}

export function getDayWinPct(trades: Trade[]): { pct: number; winDays: number; totalDays: number } {
  const byDay = new Map<string, number>()
  for (const t of trades) {
    const d = t.dateTime.slice(0, 10)
    byDay.set(d, (byDay.get(d) ?? 0) + t.actualPnL)
  }
  const totalDays = byDay.size
  const winDays = [...byDay.values()].filter((v) => v > 0).length
  const pct = totalDays > 0 ? (winDays / totalDays) * 100 : 0
  return { pct, winDays, totalDays }
}

export function getAvgRRReal(trades: Trade[]): number | null {
  const withR = trades.filter((t) => typeof t.rMultipleActual === 'number' && t.rMultipleActual !== 0)
  if (withR.length === 0) return null
  const sum = withR.reduce((s, t) => s + (t.rMultipleActual ?? 0), 0)
  return Math.round((sum / withR.length) * 100) / 100
}

export interface DirectionStats {
  count: number
  wins: number
  losses: number
  winRate: number
  totalPnL: number
  avgPnL: number
}

export function getDirectionStats(trades: Trade[]): { long: DirectionStats; short: DirectionStats } {
  const compute = (subset: Trade[]): DirectionStats => {
    const wins = subset.filter((t) => t.actualPnL > 0).length
    const losses = subset.filter((t) => t.actualPnL < 0).length
    const totalPnL = subset.reduce((s, t) => s + t.actualPnL, 0)
    return {
      count: subset.length, wins, losses,
      winRate: subset.length > 0 ? (wins / subset.length) * 100 : 0,
      totalPnL,
      avgPnL: subset.length > 0 ? totalPnL / subset.length : 0,
    }
  }
  return {
    long:  compute(trades.filter((t) => t.direction === 'long')),
    short: compute(trades.filter((t) => t.direction === 'short')),
  }
}

export function getBestWorstTrade(trades: Trade[]): { best: Trade | null; worst: Trade | null } {
  if (trades.length === 0) return { best: null, worst: null }
  let best = trades[0], worst = trades[0]
  for (const t of trades) {
    if (t.actualPnL > best.actualPnL) best = t
    if (t.actualPnL < worst.actualPnL) worst = t
  }
  return { best, worst }
}

export function getDayStats(trades: Trade[]): { mostActiveDay: { date: string; count: number } | null; mostProfitableDay: { date: string; pnl: number } | null } {
  if (trades.length === 0) return { mostActiveDay: null, mostProfitableDay: null }
  const byDay = new Map<string, { count: number; pnl: number }>()
  for (const t of trades) {
    const d = t.dateTime.slice(0, 10)
    const prev = byDay.get(d) ?? { count: 0, pnl: 0 }
    byDay.set(d, { count: prev.count + 1, pnl: prev.pnl + t.actualPnL })
  }
  let mostActive: { date: string; count: number } | null = null
  let mostProfit: { date: string; pnl: number } | null = null
  for (const [date, v] of byDay) {
    if (!mostActive || v.count > mostActive.count) mostActive = { date, count: v.count }
    if (!mostProfit || v.pnl > mostProfit.pnl) mostProfit = { date, pnl: v.pnl }
  }
  return { mostActiveDay: mostActive, mostProfitableDay: mostProfit }
}

export function getAvgDurationMin(trades: Trade[]): number | null {
  const withExit = trades.filter((t) => t.exitDateTime)
  if (withExit.length === 0) return null
  const sum = withExit.reduce((acc, t) => {
    const start = new Date(t.dateTime).getTime()
    const end = new Date(t.exitDateTime!).getTime()
    return acc + Math.max(0, (end - start) / 60000)
  }, 0)
  return Math.round(sum / withExit.length)
}

/** Equity curve: running balance over time, starting at 0 (pure P&L cumulative). */
export function getEquityCurve(trades: Trade[]): { date: string; equity: number; idx: number }[] {
  const sorted = [...trades].sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  let running = 0
  return sorted.map((t, idx) => {
    running += t.actualPnL
    return {
      date: t.dateTime.slice(0, 10),
      equity: Math.round(running * 100) / 100,
      idx: idx + 1,
    }
  })
}

// ─── Milestones / Logros (Tanda 2) ────────────────────────────────────────────

export interface Milestone {
  id: string
  label: string
  description: string
  emoji: string
  /** Function that returns true if unlocked given current state */
  check: (ctx: { totalWithdrawn: number; payoutCount: number; activeAccounts: number; tradeCount: number; profitableMonths: number }) => boolean
  /** Threshold value for progress bar (numerator computed from ctx) */
  threshold: number
  /** Returns the current progress numerator */
  progress: (ctx: { totalWithdrawn: number; payoutCount: number; activeAccounts: number; tradeCount: number }) => number
  unit: '$' | 'count' | 'months'
}

export const MILESTONES: Milestone[] = [
  // Payout amount milestones
  { id: 'm_500',   label: 'First Buck',       description: 'Primer retiro de $500',        emoji: '💵', threshold: 500,    unit: '$', check: (c) => c.totalWithdrawn >= 500,    progress: (c) => c.totalWithdrawn },
  { id: 'm_1k',   label: '1K Club',           description: '$1,000 retirados',             emoji: '🎯', threshold: 1000,   unit: '$', check: (c) => c.totalWithdrawn >= 1000,   progress: (c) => c.totalWithdrawn },
  { id: 'm_5k',   label: '5K Club',           description: '$5,000 retirados',             emoji: '🚀', threshold: 5000,   unit: '$', check: (c) => c.totalWithdrawn >= 5000,   progress: (c) => c.totalWithdrawn },
  { id: 'm_10k',  label: '10K Club',          description: '$10,000 retirados',            emoji: '🔥', threshold: 10000,  unit: '$', check: (c) => c.totalWithdrawn >= 10000,  progress: (c) => c.totalWithdrawn },
  { id: 'm_25k',  label: '25K Club',          description: '$25,000 retirados',            emoji: '💎', threshold: 25000,  unit: '$', check: (c) => c.totalWithdrawn >= 25000,  progress: (c) => c.totalWithdrawn },
  { id: 'm_50k',  label: '50K Club',          description: '$50,000 retirados',            emoji: '👑', threshold: 50000,  unit: '$', check: (c) => c.totalWithdrawn >= 50000,  progress: (c) => c.totalWithdrawn },
  { id: 'm_100k', label: '100K Club',         description: '$100,000 retirados',           emoji: '🏆', threshold: 100000, unit: '$', check: (c) => c.totalWithdrawn >= 100000, progress: (c) => c.totalWithdrawn },
  { id: 'm_250k', label: '250K Club',         description: '$250,000 retirados',           emoji: '🪙', threshold: 250000, unit: '$', check: (c) => c.totalWithdrawn >= 250000, progress: (c) => c.totalWithdrawn },
  { id: 'm_500k', label: 'Half-Million Club', description: '$500,000 retirados',           emoji: '💰', threshold: 500000, unit: '$', check: (c) => c.totalWithdrawn >= 500000, progress: (c) => c.totalWithdrawn },
  { id: 'm_1m',   label: 'Millionaire',       description: '$1,000,000 retirados',         emoji: '🌟', threshold: 1000000,unit: '$', check: (c) => c.totalWithdrawn >= 1000000,progress: (c) => c.totalWithdrawn },
  // Payout count milestones
  { id: 'm_p_5',  label: '5 Payouts',         description: '5 retiros conseguidos',        emoji: '⭐', threshold: 5,   unit: 'count', check: (c) => c.payoutCount >= 5,  progress: (c) => c.payoutCount },
  { id: 'm_p_10', label: '10 Payouts',        description: '10 retiros conseguidos',       emoji: '✨', threshold: 10,  unit: 'count', check: (c) => c.payoutCount >= 10, progress: (c) => c.payoutCount },
  { id: 'm_p_25', label: '25 Payouts',        description: '25 retiros conseguidos',       emoji: '🎖️', threshold: 25,  unit: 'count', check: (c) => c.payoutCount >= 25, progress: (c) => c.payoutCount },
  { id: 'm_p_50', label: '50 Payouts',        description: '50 retiros conseguidos',       emoji: '🏅', threshold: 50,  unit: 'count', check: (c) => c.payoutCount >= 50, progress: (c) => c.payoutCount },
  // Active accounts
  { id: 'm_a_3',  label: '3 cuentas activas', description: '3 cuentas activas simultáneas',emoji: '🎰', threshold: 3,   unit: 'count', check: (c) => c.activeAccounts >= 3, progress: (c) => c.activeAccounts },
  { id: 'm_a_5',  label: '5 cuentas activas', description: '5 cuentas activas simultáneas',emoji: '🃏', threshold: 5,   unit: 'count', check: (c) => c.activeAccounts >= 5, progress: (c) => c.activeAccounts },
  { id: 'm_a_10', label: '10 cuentas activas',description: '10 cuentas activas simultáneas',emoji:'♠️', threshold: 10,  unit: 'count', check: (c) => c.activeAccounts >= 10, progress: (c) => c.activeAccounts },
]

export function checkMilestones(ctx: { totalWithdrawn: number; payoutCount: number; activeAccounts: number; tradeCount: number; profitableMonths: number }): { unlocked: Milestone[]; locked: Milestone[] } {
  const unlocked: Milestone[] = []
  const locked: Milestone[] = []
  for (const m of MILESTONES) {
    if (m.check(ctx)) unlocked.push(m)
    else locked.push(m)
  }
  return { unlocked, locked }
}

// ─── Withdrawal projection (Tanda 2) ──────────────────────────────────────────

export function projectDaysToPayout(account: Account, firm: PropFirm | undefined, trades: Trade[]): {
  daysToTarget: number | null
  avgDailyPnL: number
  daysTraded: number
  pctComplete: number
} {
  const accountTrades = trades.filter((t) => t.accountId === account.id)
  const daysSet = new Set(accountTrades.map((t) => t.dateTime.slice(0, 10)))
  const daysTraded = daysSet.size
  const totalPnL = accountTrades.reduce((s, t) => s + t.actualPnL, 0)

  if (daysTraded === 0) {
    return { daysToTarget: null, avgDailyPnL: 0, daysTraded: 0, pctComplete: 0 }
  }
  const avgDailyPnL = totalPnL / daysTraded
  const target = firm?.rules.profitTargetPct
    ? account.accountSize * (firm.rules.profitTargetPct / 100)
    : null

  if (target === null || target <= 0) {
    return { daysToTarget: null, avgDailyPnL, daysTraded, pctComplete: 0 }
  }

  const remaining = target - totalPnL
  if (remaining <= 0) {
    return { daysToTarget: 0, avgDailyPnL, daysTraded, pctComplete: 100 }
  }
  if (avgDailyPnL <= 0) {
    return { daysToTarget: null, avgDailyPnL, daysTraded, pctComplete: (totalPnL / target) * 100 }
  }
  return {
    daysToTarget: Math.ceil(remaining / avgDailyPnL),
    avgDailyPnL,
    daysTraded,
    pctComplete: (totalPnL / target) * 100,
  }
}

