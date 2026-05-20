'use client'
import { useEffect, useRef } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowser, hasSupabaseConfig } from './client'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useWalletStore } from '@/lib/store/walletStore'
import { useTradingStore } from '@/lib/store/tradingStore'

// ─── Shared state ─────────────────────────────────────────────────────────────

interface SyncState {
  userId: string | null
  ready: boolean
  tasksInit: boolean
  walletInit: boolean
  tradingInit: boolean
}

const state: SyncState = {
  userId: null,
  ready: false,
  tasksInit: false,
  walletInit: false,
  tradingInit: false,
}

// ─── Push timers (debounced per domain) ───────────────────────────────────────

let tasksPushTimer: ReturnType<typeof setTimeout> | null = null
let walletPushTimer: ReturnType<typeof setTimeout> | null = null
let tradingPushTimer: ReturnType<typeof setTimeout> | null = null

function schedule(
  timer: ReturnType<typeof setTimeout> | null,
  fn: () => Promise<void>,
  setTimer: (t: ReturnType<typeof setTimeout>) => void,
) {
  if (timer) clearTimeout(timer)
  setTimer(setTimeout(() => fn().catch((e) => console.error('Sync push failed', e)), 1500))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

/**
 * After upserting rows, delete any remote rows whose id is NOT in localIds.
 * Uses a SELECT + DELETE to avoid PostgREST filter format issues.
 */
async function deleteSurplus(
  sb: SupabaseClient,
  table: string,
  userId: string,
  localIds: string[],
) {
  const { data } = await sb.from(table).select('id').eq('user_id', userId)
  if (!data) return
  const localSet = new Set(localIds)
  const toDelete = (data as Row[]).filter((r) => !localSet.has(r.id as string)).map((r) => r.id as string)
  if (toDelete.length > 0) {
    await sb.from(table).delete().eq('user_id', userId).in('id', toDelete)
  }
}

// ─── TASKS ────────────────────────────────────────────────────────────────────

async function pushTasks() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const { projects, tasks } = useTasksStore.getState()

  const projectRows = Object.values(projects).map((p) => ({
    id: p.id,
    user_id: state.userId!,
    name: p.name,
    color: p.color,
    icon: p.icon ?? null,
    description: p.description ?? null,
    statuses: p.statuses,
    archived: !!p.archived,
    created_at: p.createdAt,
  }))

  const taskRows = Object.values(tasks).map((t) => ({
    id: t.id,
    user_id: state.userId!,
    project_id: t.projectId,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    importance: t.importance,
    due_date: t.dueDate ?? null,
    energy_estimate: t.energyEstimate ?? null,
    notes: t.notes ?? null,
    scheduled_for: t.scheduledFor ?? null,
    completed_at: t.completedAt ?? null,
    postponed_count: t.postponedCount ?? 0,
    category: t.category ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }))

  const subtaskRows = Object.values(tasks).flatMap((t) =>
    t.subtasks.map((s) => ({
      id: s.id,
      user_id: state.userId!,
      task_id: t.id,
      parent_id: s.parentId ?? null,
      title: s.title,
      completed: s.completed,
      status: s.status,
      order: s.order,
      notes: s.notes ?? null,
      priority: s.priority ?? null,
    }))
  )

  if (projectRows.length > 0) await sb.from('projects').upsert(projectRows)
  if (taskRows.length > 0)    await sb.from('tasks').upsert(taskRows)
  if (subtaskRows.length > 0) await sb.from('subtasks').upsert(subtaskRows)

  // Delete surplus
  await deleteSurplus(sb, 'subtasks', state.userId!, subtaskRows.map((r) => r.id))
  await deleteSurplus(sb, 'tasks', state.userId!, taskRows.map((r) => r.id))
  await deleteSurplus(sb, 'projects', state.userId!, projectRows.map((r) => r.id))
}

async function pullTasks(): Promise<{ projects: number; tasks: number } | null> {
  if (!state.userId) return null
  const sb = getSupabaseBrowser()

  const [projectsRes, tasksRes, subtasksRes] = await Promise.all([
    sb.from('projects').select('*').eq('user_id', state.userId),
    sb.from('tasks').select('*').eq('user_id', state.userId),
    sb.from('subtasks').select('*').eq('user_id', state.userId),
  ])

  if (projectsRes.error || tasksRes.error || subtasksRes.error) {
    console.error('Tasks pull failed', projectsRes.error ?? tasksRes.error ?? subtasksRes.error)
    return null
  }

  if ((projectsRes.data?.length ?? 0) === 0 && (tasksRes.data?.length ?? 0) === 0) {
    return { projects: 0, tasks: 0 }
  }

  const subtasksByTaskId = new Map<string, Row[]>()
  for (const s of subtasksRes.data ?? []) {
    const sid = (s as Row).task_id as string
    if (!subtasksByTaskId.has(sid)) subtasksByTaskId.set(sid, [])
    subtasksByTaskId.get(sid)!.push(s as Row)
  }

  useTasksStore.setState({
    projects: Object.fromEntries((projectsRes.data ?? []).map((p: Row) => [p.id as string, {
      id: p.id as string,
      name: p.name as string,
      color: p.color as string,
      icon: (p.icon as string) ?? undefined,
      description: (p.description as string) ?? undefined,
      statuses: (p.statuses as unknown[]) ?? [],
      taskIds: (tasksRes.data ?? []).filter((t: Row) => t.project_id === p.id).map((t: Row) => t.id as string),
      createdAt: p.created_at as string,
      archived: !!p.archived,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any])),
    tasks: Object.fromEntries((tasksRes.data ?? []).map((t: Row) => [t.id as string, {
      id: t.id as string,
      projectId: t.project_id as string,
      title: t.title as string,
      description: (t.description as string) ?? undefined,
      status: t.status as string,
      priority: t.priority as 'low' | 'medium' | 'high' | 'urgent',
      importance: t.importance as 'low' | 'medium' | 'high' | 'critical',
      dueDate: (t.due_date as string) ?? undefined,
      energyEstimate: (t.energy_estimate as number) ?? undefined,
      notes: (t.notes as string) ?? undefined,
      subtasks: (subtasksByTaskId.get(t.id as string) ?? []).map((s) => ({
        id: s.id as string,
        title: s.title as string,
        completed: s.completed as boolean,
        status: s.status as string,
        order: s.order as number,
        notes: (s.notes as string) ?? undefined,
        priority: (s.priority as 'low' | 'medium' | 'high' | 'urgent' | null) ?? undefined,
        parentId: (s.parent_id as string) ?? undefined,
      })),
      createdAt: t.created_at as string,
      scheduledFor: (t.scheduled_for as 'today' | 'tomorrow') ?? undefined,
      completedAt: (t.completed_at as string) ?? undefined,
      updatedAt: t.updated_at as string,
      postponedCount: (t.postponed_count as number) ?? 0,
      category: (t.category as string) ?? undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any])),
  })

  return { projects: projectsRes.data?.length ?? 0, tasks: tasksRes.data?.length ?? 0 }
}

// ─── WALLET ───────────────────────────────────────────────────────────────────

async function pushWallet() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { currencies, wallets, transactions, distribution, deletedWallets } = useWalletStore.getState()

  // Currencies (PK: user_id + code after migration_phase2.sql)
  const currencyRows = currencies.map((c) => ({
    user_id: uid, code: c.code, symbol: c.symbol, name: c.name, color: c.color,
  }))

  // Wallets
  const walletRows = wallets.map((w) => ({
    id: w.id, user_id: uid, name: w.name, color: w.color, icon: w.icon,
    currency_codes: w.currencyCodes, created_at: w.createdAt,
  }))

  // Transactions
  const txRows = transactions.map((t) => ({
    id: t.id, user_id: uid, type: t.type, wallet_id: t.walletId,
    currency_code: t.currencyCode, amount: t.amount, label: t.label,
    category: t.category, date: t.date, timestamp: t.timestamp,
    to_wallet_id: t.toWalletId ?? null,
    to_currency_code: t.toCurrencyCode ?? null,
    to_amount: t.toAmount ?? null,
  }))

  // Deleted wallets
  const deletedRows = deletedWallets.map((d) => ({
    id: d.id, user_id: uid, wallet: d.wallet,
    transactions: d.transactions, deleted_at: d.deletedAt,
  }))

  // Upserts
  if (currencyRows.length > 0) {
    await sb.from('wallet_currencies').upsert(currencyRows, { onConflict: 'user_id,code' })
  }
  if (walletRows.length > 0) await sb.from('wallets').upsert(walletRows)
  if (txRows.length > 0)     await sb.from('wallet_transactions').upsert(txRows)

  // Distribution as singleton JSONB (wallet_config table from migration_phase2.sql)
  await sb.from('wallet_config').upsert(
    { user_id: uid, distribution, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )

  if (deletedRows.length > 0) await sb.from('wallets_deleted').upsert(deletedRows)

  // Delete surplus
  await deleteSurplus(sb, 'wallet_transactions', uid, txRows.map((r) => r.id))
  await deleteSurplus(sb, 'wallets', uid, walletRows.map((r) => r.id))
  await deleteSurplus(sb, 'wallets_deleted', uid, deletedRows.map((r) => r.id))

  // Currencies: delete by code (custom helper since PK is composite)
  const { data: remoteCurrencies } = await sb.from('wallet_currencies').select('code').eq('user_id', uid)
  if (remoteCurrencies) {
    const localCodes = new Set(currencies.map((c) => c.code))
    const toDelete = (remoteCurrencies as Row[]).filter((r) => !localCodes.has(r.code as string)).map((r) => r.code as string)
    if (toDelete.length > 0) {
      await sb.from('wallet_currencies').delete().eq('user_id', uid).in('code', toDelete)
    }
  }
}

async function pullWallet(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [curRes, wallRes, txRes, cfgRes, delRes] = await Promise.all([
    sb.from('wallet_currencies').select('*').eq('user_id', uid),
    sb.from('wallets').select('*').eq('user_id', uid),
    sb.from('wallet_transactions').select('*').eq('user_id', uid),
    sb.from('wallet_config').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('wallets_deleted').select('*').eq('user_id', uid),
  ])

  if (curRes.error || wallRes.error || txRes.error || cfgRes.error || delRes.error) {
    console.error('Wallet pull failed', curRes.error ?? wallRes.error ?? txRes.error ?? cfgRes.error ?? delRes.error)
    return false
  }

  const hasData = (wallRes.data?.length ?? 0) > 0 || (txRes.data?.length ?? 0) > 0
  if (!hasData && !cfgRes.data) return false

  useWalletStore.setState({
    currencies: (curRes.data ?? []).map((c: Row) => ({
      code: c.code as string,
      symbol: c.symbol as string,
      name: c.name as string,
      color: c.color as string,
    })),
    wallets: (wallRes.data ?? []).map((w: Row) => ({
      id: w.id as string,
      name: w.name as string,
      color: w.color as string,
      icon: w.icon as string,
      currencyCodes: (w.currency_codes as string[]) ?? [],
      createdAt: w.created_at as string,
    })),
    transactions: (txRes.data ?? []).map((t: Row) => ({
      id: t.id as string,
      type: t.type as 'income' | 'expense' | 'transfer',
      walletId: t.wallet_id as string,
      currencyCode: t.currency_code as string,
      amount: t.amount as number,
      label: t.label as string,
      category: t.category as string,
      date: t.date as string,
      timestamp: t.timestamp as number,
      toWalletId: (t.to_wallet_id as string) ?? undefined,
      toCurrencyCode: (t.to_currency_code as string) ?? undefined,
      toAmount: (t.to_amount as number) ?? undefined,
    })),
    distribution: cfgRes.data
      ? (cfgRes.data as Row).distribution as import('@/lib/store/walletStore').DistributionItem[]
      : useWalletStore.getState().distribution,
    deletedWallets: (delRes.data ?? []).map((d: Row) => ({
      id: d.id as string,
      wallet: d.wallet as import('@/lib/store/walletStore').Wallet,
      transactions: d.transactions as import('@/lib/store/walletStore').Transaction[],
      deletedAt: d.deleted_at as number,
    })),
  })

  return true
}

// ─── TRADING ──────────────────────────────────────────────────────────────────

async function pushTrading() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { firms, accounts, strategies, trades, payouts, errors, emotional } = useTradingStore.getState()

  const firmRows = firms.map((f) => ({
    id: f.id, user_id: uid, name: f.name, color: f.color,
    rules: f.rules, notes: f.notes ?? null, created_at: f.createdAt,
  }))

  const stratRows = strategies.map((s) => ({
    id: s.id, user_id: uid, name: s.name, color: s.color,
    instrument: s.instrument, timeframe: s.timeframe, session: s.session,
    risk_per_trade_pct: s.riskPerTradePct ?? null,
    target_rrr: s.targetRRR ?? null,
    rules: s.rules, active: s.active,
    description: s.description ?? null, created_at: s.createdAt,
  }))

  const accountRows = accounts.map((a) => ({
    id: a.id, user_id: uid, firm_id: a.firmId, alias: a.alias,
    account_size: a.accountSize, evaluation_cost: a.evaluationCost,
    status: a.status, start_date: a.startDate,
    closed_date: a.closedDate ?? null, notes: a.notes ?? null,
    mode: a.mode ?? null,
    max_risk_per_trade_pct: a.maxRiskPerTradePct ?? null,
    max_daily_loss_pct: a.maxDailyLossPct ?? null,
    max_daily_trades: a.maxDailyTrades ?? null,
    target_payout_amount: a.targetPayoutAmount ?? null,
    created_at: a.createdAt,
  }))

  const tradeRows = trades.map((t) => ({
    id: t.id, user_id: uid, account_id: t.accountId, strategy_id: t.strategyId,
    date_time: t.dateTime, exit_date_time: t.exitDateTime ?? null,
    instrument: t.instrument, direction: t.direction,
    planned_pnl: t.plannedPnL, actual_pnl: t.actualPnL,
    r_multiple_strategy: t.rMultipleStrategy ?? null,
    r_multiple_actual: t.rMultipleActual ?? null,
    mood_before: t.moodBefore ?? null, mood_after: t.moodAfter ?? null,
    notes: t.notes ?? null, screenshot_url: t.screenshotUrl ?? null,
    created_at: t.createdAt,
  }))

  const payoutRows = payouts.map((p) => ({
    id: p.id, user_id: uid, account_id: p.accountId,
    amount: p.amount, date: p.date, note: p.note ?? null, created_at: p.createdAt,
  }))

  const errorRows = errors.map((e) => ({
    id: e.id, user_id: uid, trade_id: e.tradeId, strategy_id: e.strategyId,
    account_id: e.accountId, type: e.type, description: e.description,
    screenshot_url: e.screenshotUrl ?? null, created_at: e.createdAt,
  }))

  const emotionalRows = emotional.map((e) => ({
    id: e.id, user_id: uid, date: e.date, mood: e.mood,
    energy_before: e.energyBefore, energy_after: e.energyAfter ?? null,
    description: e.description, tags: e.tags ?? [],
    trade_ids: e.tradeIds ?? [], created_at: e.createdAt,
  }))

  // Upsert — order respects FKs: firms → strategies → accounts → trades/payouts
  if (firmRows.length > 0)     await sb.from('trading_firms').upsert(firmRows)
  if (stratRows.length > 0)    await sb.from('trading_strategies').upsert(stratRows)
  if (accountRows.length > 0)  await sb.from('trading_accounts').upsert(accountRows)
  if (tradeRows.length > 0)    await sb.from('trading_trades').upsert(tradeRows)
  if (payoutRows.length > 0)   await sb.from('trading_payouts').upsert(payoutRows)
  if (errorRows.length > 0)    await sb.from('trading_errors').upsert(errorRows)
  if (emotionalRows.length > 0) await sb.from('trading_emotional').upsert(emotionalRows)

  // Delete surplus — reverse FK order: leaf nodes first
  await deleteSurplus(sb, 'trading_errors', uid, errorRows.map((r) => r.id))
  await deleteSurplus(sb, 'trading_emotional', uid, emotionalRows.map((r) => r.id))
  await deleteSurplus(sb, 'trading_payouts', uid, payoutRows.map((r) => r.id))
  await deleteSurplus(sb, 'trading_trades', uid, tradeRows.map((r) => r.id))
  await deleteSurplus(sb, 'trading_accounts', uid, accountRows.map((r) => r.id))
  await deleteSurplus(sb, 'trading_strategies', uid, stratRows.map((r) => r.id))
  await deleteSurplus(sb, 'trading_firms', uid, firmRows.map((r) => r.id))
}

async function pullTrading(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [firmRes, stratRes, accRes, tradeRes, payRes, errRes, emotRes] = await Promise.all([
    sb.from('trading_firms').select('*').eq('user_id', uid),
    sb.from('trading_strategies').select('*').eq('user_id', uid),
    sb.from('trading_accounts').select('*').eq('user_id', uid),
    sb.from('trading_trades').select('*').eq('user_id', uid),
    sb.from('trading_payouts').select('*').eq('user_id', uid),
    sb.from('trading_errors').select('*').eq('user_id', uid),
    sb.from('trading_emotional').select('*').eq('user_id', uid),
  ])

  const anyError = firmRes.error ?? stratRes.error ?? accRes.error ?? tradeRes.error
    ?? payRes.error ?? errRes.error ?? emotRes.error
  if (anyError) {
    console.error('Trading pull failed', anyError)
    return false
  }

  const hasData = [firmRes, stratRes, accRes, tradeRes, payRes, errRes, emotRes]
    .some((r) => (r.data?.length ?? 0) > 0)
  if (!hasData) return false

  useTradingStore.setState({
    firms: (firmRes.data ?? []).map((f: Row) => ({
      id: f.id as string, name: f.name as string, color: f.color as string,
      rules: f.rules as import('@/lib/store/tradingStore').PropFirmRules,
      notes: (f.notes as string) ?? undefined, createdAt: f.created_at as string,
    })),
    strategies: (stratRes.data ?? []).map((s: Row) => ({
      id: s.id as string, name: s.name as string, color: s.color as string,
      instrument: s.instrument as string, timeframe: s.timeframe as string,
      session: s.session as string,
      riskPerTradePct: (s.risk_per_trade_pct as number) ?? undefined,
      targetRRR: (s.target_rrr as number) ?? undefined,
      rules: (s.rules as string) ?? '',
      active: s.active as boolean,
      description: (s.description as string) ?? undefined,
      createdAt: s.created_at as string,
    })),
    accounts: (accRes.data ?? []).map((a: Row) => ({
      id: a.id as string, firmId: a.firm_id as string, alias: a.alias as string,
      accountSize: a.account_size as number, evaluationCost: a.evaluation_cost as number,
      status: a.status as import('@/lib/store/tradingStore').AccountStatus,
      startDate: a.start_date as string,
      closedDate: (a.closed_date as string) ?? undefined,
      notes: (a.notes as string) ?? undefined,
      mode: (a.mode as import('@/lib/store/tradingStore').AccountMode) ?? undefined,
      maxRiskPerTradePct: (a.max_risk_per_trade_pct as number) ?? undefined,
      maxDailyLossPct: (a.max_daily_loss_pct as number) ?? undefined,
      maxDailyTrades: (a.max_daily_trades as number) ?? undefined,
      targetPayoutAmount: (a.target_payout_amount as number) ?? undefined,
      createdAt: a.created_at as string,
    })),
    trades: (tradeRes.data ?? []).map((t: Row) => ({
      id: t.id as string, accountId: t.account_id as string, strategyId: t.strategy_id as string,
      dateTime: t.date_time as string, exitDateTime: (t.exit_date_time as string) ?? undefined,
      instrument: t.instrument as string,
      direction: t.direction as 'long' | 'short',
      plannedPnL: t.planned_pnl as number, actualPnL: t.actual_pnl as number,
      rMultipleStrategy: (t.r_multiple_strategy as number) ?? undefined,
      rMultipleActual: (t.r_multiple_actual as number) ?? undefined,
      moodBefore: (t.mood_before as import('@/lib/store/tradingStore').Mood) ?? undefined,
      moodAfter: (t.mood_after as import('@/lib/store/tradingStore').Mood) ?? undefined,
      notes: (t.notes as string) ?? undefined,
      screenshotUrl: (t.screenshot_url as string) ?? undefined,
      createdAt: t.created_at as string,
    })),
    payouts: (payRes.data ?? []).map((p: Row) => ({
      id: p.id as string, accountId: p.account_id as string,
      amount: p.amount as number, date: p.date as string,
      note: (p.note as string) ?? undefined, createdAt: p.created_at as string,
    })),
    errors: (errRes.data ?? []).map((e: Row) => ({
      id: e.id as string, tradeId: e.trade_id as string,
      strategyId: e.strategy_id as string, accountId: e.account_id as string,
      type: e.type as import('@/lib/store/tradingStore').ErrorType,
      description: e.description as string,
      screenshotUrl: (e.screenshot_url as string) ?? undefined,
      createdAt: e.created_at as string,
    })),
    emotional: (emotRes.data ?? []).map((e: Row) => ({
      id: e.id as string, date: e.date as string,
      mood: e.mood as import('@/lib/store/tradingStore').Mood,
      energyBefore: e.energy_before as number,
      energyAfter: (e.energy_after as number) ?? undefined,
      description: e.description as string,
      tags: (e.tags as string[]) ?? [],
      tradeIds: (e.trade_ids as string[]) ?? [],
      createdAt: e.created_at as string,
    })),
  })

  return true
}

// ─── Scheduled pushes ─────────────────────────────────────────────────────────

function scheduleTasks()   { schedule(tasksPushTimer,   pushTasks,   (t) => { tasksPushTimer = t }) }
function scheduleWallet()  { schedule(walletPushTimer,  pushWallet,  (t) => { walletPushTimer = t }) }
function scheduleTrading() { schedule(tradingPushTimer, pushTrading, (t) => { tradingPushTimer = t }) }

// ─── Main hook ────────────────────────────────────────────────────────────────

/** Mount once at the app root. Wires tasks + wallet + trading sync. */
export function useSupabaseSync() {
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (!hasSupabaseConfig()) return
    const sb = getSupabaseBrowser()
    let mounted = true

    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!mounted) return
      state.userId = user?.id ?? null
      state.ready = true

      if (!state.userId) return

      // Initial pull + conditional push for each domain
      if (!state.tasksInit) {
        state.tasksInit = true
        const pulled = await pullTasks()
        if (pulled && pulled.projects === 0 && pulled.tasks === 0) {
          await pushTasks().catch((e) => console.error('Tasks initial push failed', e))
        }
      }

      if (!state.walletInit) {
        state.walletInit = true
        const had = await pullWallet()
        if (!had) {
          await pushWallet().catch((e) => console.error('Wallet initial push failed', e))
        }
      }

      if (!state.tradingInit) {
        state.tradingInit = true
        const had = await pullTrading()
        if (!had) {
          await pushTrading().catch((e) => console.error('Trading initial push failed', e))
        }
      }
    })()

    // Subscribe to local store changes
    if (!subscribedRef.current) {
      subscribedRef.current = true
      useTasksStore.subscribe(() => { if (state.userId) scheduleTasks() })
      useWalletStore.subscribe(() => { if (state.userId) scheduleWallet() })
      useTradingStore.subscribe(() => { if (state.userId) scheduleTrading() })
    }

    // Auth state changes
    const { data: sub } = sb.auth.onAuthStateChange((_event: string, session: { user?: { id: string } } | null) => {
      const newId = session?.user?.id ?? null
      if (newId !== state.userId) {
        state.userId = newId
        state.tasksInit = false
        state.walletInit = false
        state.tradingInit = false
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])
}

// ─── Manual triggers ──────────────────────────────────────────────────────────

export async function forceSyncTasks()    { await pushTasks() }
export async function forcePullTasks()    { return pullTasks() }
export async function forceSyncWallet()   { await pushWallet() }
export async function forcePullWallet()   { return pullWallet() }
export async function forceSyncTrading()  { await pushTrading() }
export async function forcePullTrading()  { return pullTrading() }
