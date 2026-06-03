'use client'
import { useEffect, useRef } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowser, hasSupabaseConfig } from './client'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useWalletStore } from '@/lib/store/walletStore'
import { useTradingStore } from '@/lib/store/tradingStore'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useGymStore } from '@/lib/store/gymStore'
import { useHealthStore } from '@/lib/store/healthStore'
import { useChatStore } from '@/lib/store/chatStore'
import { useFoodStore } from '@/lib/store/foodStore'
import { useSPIStore } from '@/lib/store/spiStore'
import { useProjectionStore } from '@/lib/store/projectionStore'
import { useLabStore } from '@/lib/store/labStore'
import { useAppStore } from '@/lib/store/appStore'
import { useMindMapStore } from '@/lib/store/mindmapStore'

// ─── Shared state ─────────────────────────────────────────────────────────────

interface SyncState {
  userId: string | null
  ready: boolean
  tasksInit: boolean
  walletInit: boolean
  tradingInit: boolean
  habitsInit: boolean
  gymBasicsInit: boolean
  healthInit: boolean
  chatInit: boolean
  foodInit: boolean
  spiInit: boolean
  projectionInit: boolean
  labInit: boolean
  appPrefsInit: boolean
  mindmapInit: boolean
}

const state: SyncState = {
  userId: null,
  ready: false,
  tasksInit: false,
  walletInit: false,
  tradingInit: false,
  habitsInit: false,
  gymBasicsInit: false,
  healthInit: false,
  chatInit: false,
  foodInit: false,
  spiInit: false,
  projectionInit: false,
  labInit: false,
  appPrefsInit: false,
  mindmapInit: false,
}

// ─── Push timers (debounced per domain) ───────────────────────────────────────

let tasksPushTimer: ReturnType<typeof setTimeout> | null = null
let walletPushTimer: ReturnType<typeof setTimeout> | null = null
let tradingPushTimer: ReturnType<typeof setTimeout> | null = null
let habitsPushTimer: ReturnType<typeof setTimeout> | null = null
let gymBasicsPushTimer: ReturnType<typeof setTimeout> | null = null
let healthPushTimer: ReturnType<typeof setTimeout> | null = null
let chatPushTimer: ReturnType<typeof setTimeout> | null = null
let foodPushTimer: ReturnType<typeof setTimeout> | null = null
let spiPushTimer: ReturnType<typeof setTimeout> | null = null
let projectionPushTimer: ReturnType<typeof setTimeout> | null = null
let labPushTimer: ReturnType<typeof setTimeout> | null = null
let appPrefsPushTimer: ReturnType<typeof setTimeout> | null = null
let mindmapPushTimer: ReturnType<typeof setTimeout> | null = null

function schedule(
  timer: ReturnType<typeof setTimeout> | null,
  fn: () => Promise<void>,
  setTimer: (t: ReturnType<typeof setTimeout>) => void,
) {
  if (timer) clearTimeout(timer)
  setTimer(setTimeout(() => fn().catch((e) => reportSyncError(`Sync push failed: ${e?.message ?? e}`)), 1500))
}

/** Surface a sync failure to the user. Previously these were `console.error`
 *  only — invisible unless devtools were open. Now we ALSO fire a browser
 *  CustomEvent the UI subscribes to (see `useSyncErrors` hook) so users get
 *  a real toast and can fix the underlying issue (usually a missing migration). */
function reportSyncError(message: string) {
  console.error('[sync]', message)
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('overseer-sync-error', { detail: { message, at: Date.now() } }))
    } catch { /* noop */ }
  }
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
    archived_at: t.archivedAt ?? null,
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
      // Campos de ciclo de vida — sin esto el auto-purge nocturno no
      // podía archivar subtasks porque al hacer pull se perdía completedAt.
      // Requiere migration_subtasks_completion_fields.sql aplicada.
      completed_at: s.completedAt ?? null,
      archived_at:  s.archivedAt  ?? null,
      due_date:     s.dueDate     ?? null,
      description:  s.description ?? null,
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
        // Ciclo de vida — necesario para que el auto-purge nocturno
        // pueda archivar subtasks completadas el día anterior. Sin esto
        // el pull pisaba `completedAt` con undefined y el archive las
        // ignoraba por su guard `!st.completedAt`.
        completedAt: (s.completed_at as string) ?? undefined,
        archivedAt:  (s.archived_at  as string) ?? undefined,
        dueDate:     (s.due_date     as string) ?? undefined,
        description: (s.description  as string) ?? undefined,
      })),
      createdAt: t.created_at as string,
      scheduledFor: (t.scheduled_for as 'today' | 'tomorrow') ?? undefined,
      completedAt: (t.completed_at as string) ?? undefined,
      archivedAt: (t.archived_at as string) ?? undefined,
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
  const { currencies, wallets, transactions, distribution, deletedWallets, recurringExpenses } = useWalletStore.getState()

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

  // Recurring expenses
  const recurringRows = recurringExpenses.map((r) => ({
    id: r.id, user_id: uid,
    wallet_id: r.walletId, currency_code: r.currencyCode,
    amount: r.amount, label: r.label, category: r.category,
    day_of_month: r.dayOfMonth, active: r.active,
    start_date: r.startDate, end_date: r.endDate ?? null,
    last_applied_year_month: r.lastAppliedYearMonth ?? null,
    is_subscription: r.isSubscription ?? true,
    notes: r.notes ?? null, created_at: r.createdAt,
  }))

  // Upserts — check each result and surface failures loudly so the user
  // doesn't lose data silently (this was happening when migration_phase2
  // hadn't been run and the PK was wrong on wallet_currencies).
  if (currencyRows.length > 0) {
    const r = await sb.from('wallet_currencies').upsert(currencyRows, { onConflict: 'user_id,code' })
    if (r.error) {
      // Most likely cause: PK on wallet_currencies is still `code` only
      // (pre-migration_phase2.sql). The onConflict 'user_id,code' needs
      // a composite UNIQUE/PK to match. Run migration_wallet_currencies_pk.sql.
      reportSyncError(
        `wallet_currencies upsert failed: ${r.error.message}. ` +
        `Likely missing PK migration — run supabase/migration_wallet_currencies_pk.sql.`
      )
      throw r.error
    }
  }
  if (walletRows.length > 0) {
    const r = await sb.from('wallets').upsert(walletRows)
    if (r.error) { reportSyncError(`wallets upsert failed: ${r.error.message}`); throw r.error }
  }
  if (txRows.length > 0) {
    const r = await sb.from('wallet_transactions').upsert(txRows)
    if (r.error) { reportSyncError(`wallet_transactions upsert failed: ${r.error.message}`); throw r.error }
  }

  // Distribution as singleton JSONB (wallet_config table from migration_phase2.sql)
  await sb.from('wallet_config').upsert(
    { user_id: uid, distribution, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )

  if (deletedRows.length > 0) await sb.from('wallets_deleted').upsert(deletedRows)

  if (recurringRows.length > 0) {
    const r = await sb.from('wallet_recurring_expenses').upsert(recurringRows)
    if (r.error) {
      reportSyncError(`wallet_recurring_expenses upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_wallet_recurring.sql.`)
      throw r.error
    }
  }

  // Delete surplus
  await deleteSurplus(sb, 'wallet_transactions', uid, txRows.map((r) => r.id))
  await deleteSurplus(sb, 'wallets', uid, walletRows.map((r) => r.id))
  await deleteSurplus(sb, 'wallets_deleted', uid, deletedRows.map((r) => r.id))
  await deleteSurplus(sb, 'wallet_recurring_expenses', uid, recurringRows.map((r) => r.id))

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

  const [curRes, wallRes, txRes, cfgRes, delRes, recRes] = await Promise.all([
    sb.from('wallet_currencies').select('*').eq('user_id', uid),
    sb.from('wallets').select('*').eq('user_id', uid),
    sb.from('wallet_transactions').select('*').eq('user_id', uid),
    sb.from('wallet_config').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('wallets_deleted').select('*').eq('user_id', uid),
    sb.from('wallet_recurring_expenses').select('*').eq('user_id', uid),
  ])

  if (curRes.error || wallRes.error || txRes.error || cfgRes.error || delRes.error) {
    console.error('Wallet pull failed', curRes.error ?? wallRes.error ?? txRes.error ?? cfgRes.error ?? delRes.error)
    return false
  }
  // recRes is non-fatal — if the migration isn't run yet, skip it and let
  // the next push surface the error via the toast.
  if (recRes.error) {
    console.warn('Wallet recurring pull failed (run migration_wallet_recurring.sql):', recRes.error)
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
    // Only overwrite recurringExpenses if we actually got valid data —
    // otherwise (migration missing, transient error) keep whatever the
    // store has locally.
    ...(recRes.error
      ? {}
      : {
          recurringExpenses: (recRes.data ?? []).map((r: Row) => ({
            id: r.id as string,
            walletId: r.wallet_id as string,
            currencyCode: r.currency_code as string,
            amount: r.amount as number,
            label: r.label as string,
            category: r.category as string,
            dayOfMonth: r.day_of_month as number,
            active: r.active as boolean,
            startDate: r.start_date as string,
            endDate: (r.end_date as string) ?? undefined,
            lastAppliedYearMonth: (r.last_applied_year_month as string) ?? undefined,
            isSubscription: (r.is_subscription as boolean) ?? true,
            notes: (r.notes as string) ?? undefined,
            createdAt: r.created_at as string,
          })),
        }
    ),
  })

  return true
}

// ─── TRADING ──────────────────────────────────────────────────────────────────

async function pushTrading() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { firms, accounts, strategies, trades, payouts, errors, emotional, scaling } = useTradingStore.getState()

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

  // ─── Scaling System config (singleton JSONB row) ──
  const r = await sb.from('trading_scaling_config').upsert(
    { user_id: uid, payload: scaling, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (r.error) {
    reportSyncError(`trading_scaling_config upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_trading_scaling.sql.`)
    throw r.error
  }
}

async function pullTrading(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [firmRes, stratRes, accRes, tradeRes, payRes, errRes, emotRes, scalingRes] = await Promise.all([
    sb.from('trading_firms').select('*').eq('user_id', uid),
    sb.from('trading_strategies').select('*').eq('user_id', uid),
    sb.from('trading_accounts').select('*').eq('user_id', uid),
    sb.from('trading_trades').select('*').eq('user_id', uid),
    sb.from('trading_payouts').select('*').eq('user_id', uid),
    sb.from('trading_errors').select('*').eq('user_id', uid),
    sb.from('trading_emotional').select('*').eq('user_id', uid),
    sb.from('trading_scaling_config').select('*').eq('user_id', uid).maybeSingle(),
  ])

  const anyError = firmRes.error ?? stratRes.error ?? accRes.error ?? tradeRes.error
    ?? payRes.error ?? errRes.error ?? emotRes.error
  if (anyError) {
    console.error('Trading pull failed', anyError)
    return false
  }
  // scalingRes error is non-fatal — if the migration isn't run yet, skip
  // and let the next push fail loudly via the toast.
  if (scalingRes.error) {
    console.warn('Trading scaling pull failed (run migration_trading_scaling.sql):', scalingRes.error)
  }

  const hasData = [firmRes, stratRes, accRes, tradeRes, payRes, errRes, emotRes]
    .some((r) => (r.data?.length ?? 0) > 0) || !!scalingRes.data
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
    // Only overwrite scaling if the remote row actually exists. Otherwise
    // keep whatever local default the store already has (avoids wiping the
    // user's local scaling config on a fresh device where the migration
    // hasn't been run yet).
    ...(scalingRes.data
      ? { scaling: (scalingRes.data as { payload: unknown }).payload as import('@/lib/store/tradingStore').ScalingConfig }
      : {}),
  })

  return true
}

// ─── HABITS ───────────────────────────────────────────────────────────────────

async function pushHabits() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { habits } = useHabitsStore.getState()

  // Position in the local array IS the canonical order — push it explicitly
  // so reordering from any device persists and propagates back.
  const rows = habits.map((h, idx) => ({
    id: h.id, user_id: uid, name: h.name, icon: h.icon, color: h.color,
    target_days: h.targetDays, completed_dates: h.completedDates,
    skipped_dates: h.skippedDates ?? [],
    category: h.category, created_at: h.createdAt,
    sort_order: idx,
    reminder_time: h.reminderTime ?? null,
  }))

  if (rows.length > 0) await sb.from('habits').upsert(rows)
  await deleteSurplus(sb, 'habits', uid, rows.map((r) => r.id))
}

async function pullHabits(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  // Order by sort_order so manual reordering persists across devices. Rows
  // without sort_order (legacy) fall to the end, then ordered by created_at.
  const res = await sb.from('habits').select('*').eq('user_id', uid)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (res.error) {
    console.error('Habits pull failed', res.error)
    return false
  }
  if ((res.data?.length ?? 0) === 0) return false

  useHabitsStore.setState({
    habits: (res.data ?? []).map((h: Row) => ({
      id: h.id as string,
      name: h.name as string,
      icon: h.icon as string,
      color: h.color as string,
      targetDays: (h.target_days as number[]) ?? [],
      completedDates: (h.completed_dates as string[]) ?? [],
      skippedDates: (h.skipped_dates as string[]) ?? [],
      category: h.category as string,
      createdAt: h.created_at as string,
      reminderTime: (h.reminder_time as string | null) ?? undefined,
    })),
  })
  return true
}

// ─── SPI (weekly planning sessions) ───────────────────────────────────────────

async function pushSPI() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { sessions, bitacoraEntries } = useSPIStore.getState()

  // ── Sessions ──────────────────────────────────────────────────────
  // Each session stored as one row; full payload in JSONB. We strip the
  // top-level metadata (week_start_date, closed_at) into columns for query
  // performance later (e.g. "all closed sessions this quarter").
  const sessRows = sessions.map((sess) => ({
    id: sess.id,
    user_id: uid,
    week_start_date: sess.weekStartDate,
    created_at: sess.createdAt,
    updated_at: sess.updatedAt,
    closed_at: sess.closedAt ?? null,
    payload: sess,
  }))
  if (sessRows.length > 0) await sb.from('spi_sessions').upsert(sessRows)
  await deleteSurplus(sb, 'spi_sessions', uid, sessRows.map((r) => r.id))

  // ── Bitácora (cross-session) ──────────────────────────────────────
  const bitRows = bitacoraEntries.map((e) => ({
    id: e.id,
    user_id: uid,
    kind: e.kind,
    situation: e.situation,
    domino_effect: e.dominoEffect,
    resolved: e.resolved ?? false,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  }))
  if (bitRows.length > 0) await sb.from('spi_bitacora').upsert(bitRows)
  await deleteSurplus(sb, 'spi_bitacora', uid, bitRows.map((r) => r.id))
}

async function pullSPI(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [sessRes, bitRes] = await Promise.all([
    sb.from('spi_sessions').select('*').eq('user_id', uid)
      .order('week_start_date', { ascending: false }),
    sb.from('spi_bitacora').select('*').eq('user_id', uid)
      .order('created_at', { ascending: false }),
  ])

  if (sessRes.error) { console.error('SPI sessions pull failed', sessRes.error); return false }
  if (bitRes.error)  { console.error('SPI bitacora pull failed', bitRes.error) }

  const hasSessions = (sessRes.data?.length ?? 0) > 0
  const hasBitacora = (bitRes.data?.length ?? 0) > 0
  if (!hasSessions && !hasBitacora) return false

  type SessRow = { payload: unknown }
  type BitRow = {
    id: string; kind: 'working' | 'broken'
    situation: string; domino_effect: string
    resolved: boolean | null
    created_at: string; updated_at: string
  }

  // Sanitize: sessions stored before fields como `selectedLanes`,
  // `mainChecklist`, `tasks`, `values` existieran necesitan defaults para
  // que los renderers (que hacen `session.selectedLanes.length` etc.) no
  // crasheen.
  //
  // IMPORTANTE: spread `...s` PRIMERO para preservar cualquier campo
  // opcional (selectedKpiIds, weekSnapshot, etc.). Si solo enumerábamos
  // explícitamente, cualquier campo nuevo se perdía silenciosamente al
  // hacer pull. Antes pasaba con `selectedKpiIds` — el push subía la
  // session entera al payload JSONB pero el pull la sanitizaba dejando
  // solo los campos enumerados → los KPIs activados se borraban al
  // refrescar la página.
  const sanitize = (raw: unknown): import('@/lib/spi/types').SPISession => {
    const s = (raw ?? {}) as Partial<import('@/lib/spi/types').SPISession>
    return {
      ...s,
      id: s.id ?? '',
      weekStartDate: s.weekStartDate ?? '',
      createdAt: s.createdAt ?? new Date().toISOString(),
      updatedAt: s.updatedAt ?? new Date().toISOString(),
      closedAt: s.closedAt,
      mainChecklist: s.mainChecklist ?? {},
      selectedLanes: Array.isArray(s.selectedLanes) ? s.selectedLanes : [],
      values: s.values ?? {},
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
      mood: s.mood,
      score: s.score,
      notes: s.notes,
      templateVersion: s.templateVersion ?? 1,
      // Campos opcionales nuevos — el spread los preserva, pero los
      // sanitizamos por las dudas para que sean del tipo correcto.
      selectedKpiIds: Array.isArray(s.selectedKpiIds) ? s.selectedKpiIds : undefined,
    }
  }

  useSPIStore.setState({
    sessions: (sessRes.data ?? []).map((r: SessRow) => sanitize(r.payload)),
    bitacoraEntries: (bitRes.data ?? []).map((r: BitRow) => ({
      id: r.id,
      kind: r.kind,
      situation: r.situation,
      dominoEffect: r.domino_effect,
      resolved: r.resolved ?? false,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  })
  return true
}

// ─── PROYECCIÓN (annual / quarterly / monthly plans) ──────────────────────────

async function pushProjection() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { plans } = useProjectionStore.getState()

  const rows = plans.map((plan) => ({
    id: plan.id,
    user_id: uid,
    level: plan.level,
    period_key: plan.periodKey,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
    closed_at: plan.closedAt ?? null,
    payload: plan,
  }))

  if (rows.length > 0) await sb.from('projection_plans').upsert(rows)
  await deleteSurplus(sb, 'projection_plans', uid, rows.map((r) => r.id))
}

async function pullProjection(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('projection_plans').select('*').eq('user_id', uid)
    .order('period_key', { ascending: false })
  if (res.error) { console.error('Projection pull failed', res.error); return false }
  if ((res.data?.length ?? 0) === 0) return false

  type Row = { payload: unknown }
  const sanitize = (raw: unknown): import('@/lib/projection/types').ProjectionPlan => {
    const p = (raw ?? {}) as Partial<import('@/lib/projection/types').ProjectionPlan>
    return {
      id: p.id ?? '',
      level: p.level ?? 'year',
      periodKey: p.periodKey ?? '',
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
      closedAt: p.closedAt,
      values: p.values ?? {},
      mood: p.mood,
      score: p.score,
      notes: p.notes,
      templateVersion: p.templateVersion ?? 1,
      selectedLanes: p.selectedLanes,
    }
  }
  useProjectionStore.setState({
    plans: (res.data ?? []).map((r: Row) => sanitize(r.payload)),
  })
  return true
}

// ─── LAB (mind/emotion exercise sessions) ────────────────────────────────────

async function pushLab() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { sessions, beliefs } = useLabStore.getState()

  // ─── Sessions ──
  const rows = sessions.map((sess) => ({
    id: sess.id,
    user_id: uid,
    exercise_key: sess.exerciseKey,
    category_key: sess.categoryKey,
    status: sess.status,
    created_at: sess.createdAt,
    updated_at: sess.updatedAt,
    closed_at: sess.closedAt ?? null,
    spi_session_id: sess.spiSessionId ?? null,
    payload: sess,
  }))

  if (rows.length > 0) await sb.from('lab_sessions').upsert(rows)
  await deleteSurplus(sb, 'lab_sessions', uid, rows.map((r) => r.id))

  // ─── Beliefs ──
  const beliefRows = beliefs.map((b) => ({
    id: b.id,
    user_id: uid,
    category_key: b.categoryKey,
    text: b.text,
    status: b.status,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    resolved_at: b.resolvedAt ?? null,
    insight: b.insight ?? null,
    linked_session_ids: b.linkedSessionIds ?? [],
  }))
  if (beliefRows.length > 0) {
    const r = await sb.from('lab_beliefs').upsert(beliefRows)
    if (r.error) {
      reportSyncError(`lab_beliefs upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_lab_beliefs.sql.`)
      throw r.error
    }
  }
  await deleteSurplus(sb, 'lab_beliefs', uid, beliefRows.map((r) => r.id))
}

async function pullLab(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  // Run both in parallel — they're independent tables.
  const [sessionRes, beliefRes] = await Promise.all([
    sb.from('lab_sessions').select('*').eq('user_id', uid).order('updated_at', { ascending: false }),
    sb.from('lab_beliefs').select('*').eq('user_id', uid).order('updated_at', { ascending: false }),
  ])

  if (sessionRes.error) { console.error('Lab sessions pull failed', sessionRes.error); return false }
  // Beliefs table is optional — if the migration isn't run yet, we get an
  // error but don't fail the whole pull. Just warn and continue with empty.
  let beliefs: import('@/lib/lab/types').LabBelief[] = []
  if (beliefRes.error) {
    console.warn('Lab beliefs pull failed (run migration_lab_beliefs.sql):', beliefRes.error)
  } else {
    type BeliefRow = {
      id: string; category_key: string; text: string
      status: import('@/lib/lab/types').LabBeliefStatus
      created_at: string; updated_at: string
      resolved_at: string | null; insight: string | null
      linked_session_ids: string[] | null
    }
    beliefs = ((beliefRes.data as BeliefRow[] | null) ?? []).map((r) => ({
      id: r.id,
      categoryKey: r.category_key,
      text: r.text,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      resolvedAt: r.resolved_at ?? undefined,
      insight: r.insight ?? undefined,
      linkedSessionIds: r.linked_session_ids ?? [],
    }))
  }

  const hasSessions = (sessionRes.data?.length ?? 0) > 0
  const hasBeliefs = beliefs.length > 0
  if (!hasSessions && !hasBeliefs) return false

  type LabRow = { payload: unknown }
  const sanitize = (raw: unknown): import('@/lib/lab/types').LabSession => {
    const p = (raw ?? {}) as Partial<import('@/lib/lab/types').LabSession>
    return {
      id: p.id ?? '',
      exerciseKey: p.exerciseKey ?? '',
      categoryKey: p.categoryKey ?? '',
      title: p.title ?? 'Sesión',
      status: p.status ?? 'open',
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
      closedAt: p.closedAt,
      values: p.values ?? {},
      outcome: p.outcome,
      spiSessionId: p.spiSessionId,
      linkedBeliefId: p.linkedBeliefId,
      autoTitled: p.autoTitled,
    }
  }
  useLabStore.setState({
    sessions: (sessionRes.data ?? []).map((r: LabRow) => sanitize(r.payload)),
    beliefs,
  })
  return true
}

// ─── MIND MAPS (mapas mentales) ──────────────────────────────────────────────

async function pushMindMaps() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { maps } = useMindMapStore.getState()

  const rows = maps.map((m) => ({
    id: m.id,
    user_id: uid,
    title: m.title,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    payload: m,
  }))

  if (rows.length > 0) {
    const r = await sb.from('mindmaps').upsert(rows)
    if (r.error) {
      reportSyncError(`mindmaps upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_mindmaps.sql.`)
      throw r.error
    }
  }
  await deleteSurplus(sb, 'mindmaps', uid, rows.map((r) => r.id))
}

async function pullMindMaps(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('mindmaps').select('*').eq('user_id', uid)
    .order('updated_at', { ascending: false })
  if (res.error) {
    console.error('Mindmaps pull failed (run migration_mindmaps.sql?):', res.error)
    return false
  }
  if ((res.data?.length ?? 0) === 0) return false

  type MapRow = { payload: unknown }
  const sanitize = (raw: unknown): import('@/lib/store/mindmapStore').MindMap => {
    const p = (raw ?? {}) as Partial<import('@/lib/store/mindmapStore').MindMap>
    return {
      id: p.id ?? '',
      title: p.title ?? 'Mapa',
      nodes: Array.isArray(p.nodes) ? p.nodes : [],
      edges: Array.isArray(p.edges) ? p.edges : [],
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
    }
  }
  useMindMapStore.setState({
    maps: (res.data ?? []).map((r: MapRow) => sanitize(r.payload)),
  })
  return true
}

// ─── APP PREFERENCES (sidebar nav order, language, timezone, schedule, etc.) ─
//
// Singleton row per user. The payload is a flexible JSONB blob that mirrors
// the cross-device-relevant subset of useAppStore. Ephemeral UI state
// (sidebarCollapsed, activeSection, chatOpen, etc.) is INTENTIONALLY excluded
// so that a "collapsed" preference on a laptop doesn't override a "showing"
// preference on a phone.

/** The subset of appStore that gets synced. Adding a field here = it syncs;
 *  removing it = it stays device-local. */
type AppPrefsPayload = {
  language?: import('@/types').Language
  timezone?: string
  autoPurgeCompletedTasks?: boolean
  idealSchedule?: import('@/lib/store/appStore').ScheduleSlot extends infer _ ? Record<string, import('@/lib/store/appStore').ScheduleSlot> : never
  scheduleOrder?: string[]
  dayTypes?: import('@/types').DayTypeConfig[]
  navOrder?: string[]
  aiProvider?: 'off' | 'ollama' | 'anthropic'
  anthropicApiKey?: string
  anthropicModel?: string
  metrics?: import('@/types').MetricEntry
}

async function pushAppPrefs() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const s = useAppStore.getState()
  const payload: AppPrefsPayload = {
    language: s.language,
    timezone: s.timezone,
    autoPurgeCompletedTasks: s.autoPurgeCompletedTasks,
    idealSchedule: s.idealSchedule,
    scheduleOrder: s.scheduleOrder,
    dayTypes: s.dayTypes,
    navOrder: s.navOrder,
    aiProvider: s.aiProvider,
    anthropicApiKey: s.anthropicApiKey,
    anthropicModel: s.anthropicModel,
    metrics: s.metrics,
  }
  // Piggyback al sync de prefs: ALSO actualizamos `user_settings` que es
  // la tabla que lee el dispatcher de notificaciones del lado server.
  //
  // Bug que arreglamos: el dispatcher leía timezone='UTC' (default) cuando
  // el user nunca había tocado un toggle de notification settings — porque
  // `user_settings` solo se pusheaba al togglear una pref. Resultado:
  // habit reminders configurados a las 21:00 local (Argentina) NUNCA
  // disparaban porque el dispatcher chequeaba "es 21:00 en UTC?" cuando
  // en Argentina recién eran las 18:00. Para los 21:00 reales en AR,
  // el dispatcher veía 00:00 UTC del día siguiente → no match.
  //
  // Ahora se sincroniza en cada init/edit de prefs, así el timezone está
  // siempre fresco en user_settings. Fire-and-forget para no bloquear.
  void sb.from('user_settings').upsert({
    user_id: uid,
    timezone: s.timezone,
    notification_prefs: {
      spiNewSession: s.notificationPrefs.spiNewSession ?? true,
      taskDueSoon: s.notificationPrefs.taskDueSoon ?? true,
      taskOverdue: s.notificationPrefs.taskOverdue ?? true,
      habitReminder: s.notificationPrefs.habitReminder ?? false,
      habitSpecificReminders: s.notificationPrefs.habitSpecificReminders ?? true,
    },
    habit_reminder_hour: s.notificationPrefs.habitReminderHour ?? 21,
    habit_reminder_minute: s.notificationPrefs.habitReminderMinute ?? 0,
    task_due_lead_minutes: s.notificationPrefs.taskDueLeadMinutes ?? 60,
    spi_new_lead_minutes: s.notificationPrefs.spiNewSessionLeadMinutes ?? 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).then((r: { error: { message: string } | null }) => {
    if (r.error) console.warn('[user_settings sync from pushAppPrefs] failed:', r.error.message)
  })

  const r = await sb.from('app_preferences').upsert(
    { user_id: uid, payload, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (r.error) {
    reportSyncError(`app_preferences upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_app_preferences.sql.`)
    throw r.error
  }
}

async function pullAppPrefs(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const res = await sb.from('app_preferences').select('*').eq('user_id', uid).maybeSingle()
  if (res.error) { console.error('App prefs pull failed', res.error); return false }
  if (!res.data) return false
  const p = ((res.data as { payload: unknown }).payload ?? {}) as AppPrefsPayload
  // Merge: only overwrite fields actually present in the remote payload.
  // Anything missing stays at the local/default value — important for
  // forward/backward compat as we evolve the payload shape.
  useAppStore.setState((prev) => ({
    ...prev,
    ...(p.language !== undefined ? { language: p.language } : {}),
    ...(p.timezone !== undefined ? { timezone: p.timezone } : {}),
    ...(p.autoPurgeCompletedTasks !== undefined ? { autoPurgeCompletedTasks: p.autoPurgeCompletedTasks } : {}),
    ...(p.idealSchedule !== undefined ? { idealSchedule: p.idealSchedule } : {}),
    ...(p.scheduleOrder !== undefined ? { scheduleOrder: p.scheduleOrder } : {}),
    ...(p.dayTypes !== undefined ? { dayTypes: p.dayTypes } : {}),
    ...(p.navOrder !== undefined ? { navOrder: p.navOrder } : {}),
    ...(p.aiProvider !== undefined ? { aiProvider: p.aiProvider } : {}),
    ...(p.anthropicApiKey !== undefined ? { anthropicApiKey: p.anthropicApiKey } : {}),
    ...(p.anthropicModel !== undefined ? { anthropicModel: p.anthropicModel } : {}),
    ...(p.metrics !== undefined ? { metrics: p.metrics } : {}),
  }))
  return true
}

// ─── GYM (weight entries + config + routines + sessions) ──────────────────────

async function pushGym() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { weightEntries, gymType, phase, weightGoalKg, routines, sessions } = useGymStore.getState()

  // Weight entries
  const weightRows = weightEntries.map((e) => ({
    id: e.id, user_id: uid, date: e.date, kg: e.kg,
    note: e.note ?? null, created_at: e.createdAt,
  }))
  if (weightRows.length > 0) await sb.from('gym_weight_entries').upsert(weightRows)
  await deleteSurplus(sb, 'gym_weight_entries', uid, weightRows.map((r) => r.id))

  // Config (singleton)
  await sb.from('gym_config').upsert(
    {
      user_id: uid,
      gym_type: gymType,
      phase,
      weight_goal_kg: weightGoalKg,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  // Routines (nested exercises as JSONB)
  const routineRows = routines.map((r) => ({
    id: r.id, user_id: uid, name: r.name, day_label: r.dayLabel,
    exercises: r.exercises,
  }))
  if (routineRows.length > 0) await sb.from('gym_routines').upsert(routineRows)
  await deleteSurplus(sb, 'gym_routines', uid, routineRows.map((r) => r.id))

  // Sessions (nested exercises + sets as JSONB). activeSession is local-only.
  const sessionRows = sessions.map((s) => ({
    id: s.id, user_id: uid, date: s.date, name: s.name,
    routine_id: s.routineId ?? null,
    exercises: s.exercises,
    started_at: s.startedAt,
    ended_at: s.endedAt ?? null,
    notes: s.notes ?? null,
  }))
  if (sessionRows.length > 0) await sb.from('gym_sessions').upsert(sessionRows)
  await deleteSurplus(sb, 'gym_sessions', uid, sessionRows.map((r) => r.id))
}

async function pullGym(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [weightRes, cfgRes, routinesRes, sessionsRes] = await Promise.all([
    sb.from('gym_weight_entries').select('*').eq('user_id', uid).order('date', { ascending: false }),
    sb.from('gym_config').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('gym_routines').select('*').eq('user_id', uid),
    sb.from('gym_sessions').select('*').eq('user_id', uid).order('started_at', { ascending: false }),
  ])

  const anyError = weightRes.error ?? cfgRes.error ?? routinesRes.error ?? sessionsRes.error
  if (anyError) {
    console.error('Gym pull failed', anyError)
    return false
  }

  const hasData =
    (weightRes.data?.length ?? 0) > 0 ||
    !!cfgRes.data ||
    (routinesRes.data?.length ?? 0) > 0 ||
    (sessionsRes.data?.length ?? 0) > 0
  if (!hasData) return false

  const patch: Partial<ReturnType<typeof useGymStore.getState>> = {}

  if ((weightRes.data?.length ?? 0) > 0) {
    patch.weightEntries = (weightRes.data ?? []).map((e: Row) => ({
      id: e.id as string,
      date: e.date as string,
      kg: Number(e.kg),
      note: (e.note as string) ?? undefined,
      createdAt: e.created_at as string,
    }))
  }

  if (cfgRes.data) {
    const c = cfgRes.data as Row
    patch.gymType = (c.gym_type as 'home' | 'commercial') ?? 'home'
    patch.phase = (c.phase as 'cut' | 'maintenance' | 'bulk') ?? 'maintenance'
    patch.weightGoalKg = c.weight_goal_kg !== null && c.weight_goal_kg !== undefined
      ? Number(c.weight_goal_kg)
      : null
  }

  if ((routinesRes.data?.length ?? 0) > 0) {
    patch.routines = (routinesRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      name: r.name as string,
      dayLabel: (r.day_label as string) ?? '',
      exercises: (r.exercises as import('@/lib/store/gymStore').RoutineExercise[]) ?? [],
    }))
  }

  if ((sessionsRes.data?.length ?? 0) > 0) {
    patch.sessions = (sessionsRes.data ?? []).map((s: Row) => ({
      id: s.id as string,
      date: s.date as string,
      name: s.name as string,
      routineId: (s.routine_id as string) ?? undefined,
      exercises: (s.exercises as import('@/lib/store/gymStore').WorkoutExercise[]) ?? [],
      startedAt: s.started_at as string,
      endedAt: (s.ended_at as string) ?? undefined,
      notes: (s.notes as string) ?? undefined,
    }))
  }

  useGymStore.setState(patch)
  return true
}

// Aliases for backwards compatibility with previous "basics-only" naming.
const pushGymBasics = pushGym
const pullGymBasics = pullGym

// ─── HEALTH (snapshots + sleep goal) ──────────────────────────────────────────

async function pushHealth() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { snapshots, baseline } = useHealthStore.getState()

  const snapRows = Object.values(snapshots).map((s) => ({
    user_id: uid, date: s.date,
    steps: s.steps, sleep_minutes: s.sleepMinutes,
    sleep_start: s.sleepStart ?? null, sleep_end: s.sleepEnd ?? null,
    sleep_in_bed_minutes: s.sleepInBedMinutes ?? null,
    sleep_core_minutes: s.sleepCoreMinutes ?? null,
    sleep_deep_minutes: s.sleepDeepMinutes ?? null,
    sleep_rem_minutes: s.sleepRemMinutes ?? null,
    sleep_awake_minutes: s.sleepAwakeMinutes ?? null,
    resting_hr: s.restingHR ?? null, hrv: s.hrv ?? null,
    source: s.source, synced_at: s.syncedAt,
  }))

  if (snapRows.length > 0) {
    await sb.from('health_snapshots').upsert(snapRows, { onConflict: 'user_id,date' })
  }

  // Delete snapshots no longer present locally
  const { data: remote } = await sb.from('health_snapshots').select('date').eq('user_id', uid)
  if (remote) {
    const localDates = new Set(Object.keys(snapshots))
    const toDelete = (remote as Row[]).filter((r) => !localDates.has(r.date as string)).map((r) => r.date as string)
    if (toDelete.length > 0) {
      await sb.from('health_snapshots').delete().eq('user_id', uid).in('date', toDelete)
    }
  }

  await sb.from('health_config').upsert(
    { user_id: uid, sleep_goal_minutes: baseline.sleepGoalMinutes, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
}

async function pullHealth(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [snapRes, cfgRes] = await Promise.all([
    sb.from('health_snapshots').select('*').eq('user_id', uid),
    sb.from('health_config').select('*').eq('user_id', uid).maybeSingle(),
  ])

  if (snapRes.error || cfgRes.error) {
    console.error('Health pull failed', snapRes.error ?? cfgRes.error)
    return false
  }

  const hasData = (snapRes.data?.length ?? 0) > 0 || !!cfgRes.data
  if (!hasData) return false

  const snapMap: Record<string, import('@/lib/store/healthStore').HealthSnapshot> = {}
  for (const s of (snapRes.data ?? []) as Row[]) {
    const date = s.date as string
    snapMap[date] = {
      date,
      steps: (s.steps as number) ?? 0,
      sleepMinutes: (s.sleep_minutes as number) ?? 0,
      sleepStart: (s.sleep_start as string) ?? undefined,
      sleepEnd: (s.sleep_end as string) ?? undefined,
      sleepInBedMinutes: (s.sleep_in_bed_minutes as number) ?? undefined,
      sleepCoreMinutes: (s.sleep_core_minutes as number) ?? undefined,
      sleepDeepMinutes: (s.sleep_deep_minutes as number) ?? undefined,
      sleepRemMinutes: (s.sleep_rem_minutes as number) ?? undefined,
      sleepAwakeMinutes: (s.sleep_awake_minutes as number) ?? undefined,
      restingHR: (s.resting_hr as number) ?? undefined,
      hrv: s.hrv !== null && s.hrv !== undefined ? Number(s.hrv) : undefined,
      source: (s.source as 'shortcut' | 'manual') ?? 'manual',
      syncedAt: (s.synced_at as number) ?? Date.now(),
    }
  }

  const sleepGoal = cfgRes.data
    ? ((cfgRes.data as Row).sleep_goal_minutes as number) ?? 480
    : useHealthStore.getState().baseline.sleepGoalMinutes

  useHealthStore.setState({
    snapshots: snapMap,
    baseline: { ...useHealthStore.getState().baseline, sleepGoalMinutes: sleepGoal },
    lastSyncAt: Date.now(),
  })
  useHealthStore.getState().computeBaseline()
  return true
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────

async function pushChat() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { messages } = useChatStore.getState()

  const rows = messages.map((m) => ({
    id: m.id, user_id: uid, role: m.role, content: m.content,
    timestamp: m.timestamp, action_card: m.actionCard ?? null,
  }))

  if (rows.length > 0) await sb.from('chat_messages').upsert(rows)
  await deleteSurplus(sb, 'chat_messages', uid, rows.map((r) => r.id))
}

async function pullChat(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('chat_messages').select('*').eq('user_id', uid).order('timestamp', { ascending: true })
  if (res.error) {
    console.error('Chat pull failed', res.error)
    return false
  }
  if ((res.data?.length ?? 0) === 0) return false

  useChatStore.setState({
    messages: (res.data ?? []).map((m: Row) => ({
      id: m.id as string,
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
      timestamp: m.timestamp as string,
      actionCard: (m.action_card as import('@/types').ChatActionCard | null) ?? undefined,
    })),
  })
  return true
}

// ─── FOOD (singleton row, JSONB blobs for nested data) ────────────────────────

async function pushFood() {
  if (!state.userId) return
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { stages, shopping, fixedCosts, currentStageId, notes } = useFoodStore.getState()

  await sb.from('food_data').upsert(
    {
      user_id: uid,
      stages, shopping, fixed_costs: fixedCosts,
      current_stage_id: currentStageId || null,
      notes: notes ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
}

async function pullFood(): Promise<boolean> {
  if (!state.userId) return false
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('food_data').select('*').eq('user_id', uid).maybeSingle()
  if (res.error) {
    console.error('Food pull failed', res.error)
    return false
  }
  if (!res.data) return false

  const d = res.data as Row
  useFoodStore.setState({
    stages: (d.stages as import('@/lib/store/foodStore').Stage[]) ?? [],
    shopping: (d.shopping as import('@/lib/store/foodStore').ShoppingCategory[]) ?? [],
    fixedCosts: (d.fixed_costs as import('@/lib/store/foodStore').FixedCost[]) ?? [],
    currentStageId: (d.current_stage_id as string) ?? '',
    notes: (d.notes as string) ?? '',
  })
  return true
}

// ─── Scheduled pushes ─────────────────────────────────────────────────────────

function scheduleTasks()      { schedule(tasksPushTimer,     pushTasks,     (t) => { tasksPushTimer = t }) }
function scheduleWallet()     { schedule(walletPushTimer,    pushWallet,    (t) => { walletPushTimer = t }) }
function scheduleTrading()    { schedule(tradingPushTimer,   pushTrading,   (t) => { tradingPushTimer = t }) }
function scheduleHabits()     { schedule(habitsPushTimer,    pushHabits,    (t) => { habitsPushTimer = t }) }
function scheduleGymBasics()  { schedule(gymBasicsPushTimer, pushGymBasics, (t) => { gymBasicsPushTimer = t }) }
function scheduleHealth()     { schedule(healthPushTimer,    pushHealth,    (t) => { healthPushTimer = t }) }
function scheduleChat()       { schedule(chatPushTimer,      pushChat,      (t) => { chatPushTimer = t }) }
function scheduleFood()       { schedule(foodPushTimer,      pushFood,      (t) => { foodPushTimer = t }) }
function scheduleSPI()        { schedule(spiPushTimer,       pushSPI,       (t) => { spiPushTimer = t }) }
function scheduleProjection() { schedule(projectionPushTimer, pushProjection, (t) => { projectionPushTimer = t }) }
function scheduleLab()        { schedule(labPushTimer,        pushLab,        (t) => { labPushTimer = t }) }
function scheduleAppPrefs()   { schedule(appPrefsPushTimer,   pushAppPrefs,   (t) => { appPrefsPushTimer = t }) }
function scheduleMindMaps()   { schedule(mindmapPushTimer,    pushMindMaps,   (t) => { mindmapPushTimer = t }) }

// ─── Main hook ────────────────────────────────────────────────────────────────

/** Push-then-pull cada dominio. Idempotente — gated por *Init flags.
 *
 *  Por qué push-then-pull y no pull-then-push:
 *  ──────────────────────────────────────────
 *  Los pushes están debounced 1500ms (ver `schedule()`). Si el user edita
 *  cualquier cosa y refresca en <1.5s, el push pendiente nunca se dispara
 *  y el cambio queda solo en localStorage. En el siguiente mount, si
 *  primero pullábamos, el pull traía el estado viejo de Supabase y lo
 *  escribía sobre el localStorage → pérdida silenciosa de data.
 *
 *  Fix: si hay datos locales (persist hidrató algo), pusheamos PRIMERO.
 *  Eso sube cualquier edición pendiente. Después pull mergea con cambios
 *  de otros dispositivos (last-write-wins por id).
 *
 *  Edge case "device fresh, local vacío": el guard `hasLocal === false`
 *  evita el push (que con su deleteSurplus borraría todo el remoto), y
 *  el pull trae los datos del primer dispositivo. ✓
 *
 *  appPrefs es excepción: es una fila única por user_id sin deleteSurplus,
 *  y el local siempre tiene defaults — pusheamos siempre, después pull. */
async function initAllDomains() {
  if (!state.userId) return

  // ─── Tasks ────────────────────────────────────────────────────────────
  if (!state.tasksInit) {
    state.tasksInit = true
    const { projects, tasks } = useTasksStore.getState()
    const hasLocal = Object.keys(projects).length > 0 || Object.keys(tasks).length > 0
    if (hasLocal) {
      await pushTasks().catch((e) => console.error('Tasks initial push failed', e))
    }
    await pullTasks()
  }

  // ─── Wallet ───────────────────────────────────────────────────────────
  if (!state.walletInit) {
    state.walletInit = true
    const { wallets, transactions, currencies } = useWalletStore.getState()
    const hasLocal = wallets.length > 0 || transactions.length > 0 || currencies.length > 0
    if (hasLocal) {
      await pushWallet().catch((e) => console.error('Wallet initial push failed', e))
    }
    await pullWallet()
  }

  // ─── Trading ──────────────────────────────────────────────────────────
  if (!state.tradingInit) {
    state.tradingInit = true
    const { firms, accounts, trades } = useTradingStore.getState()
    const hasLocal = firms.length > 0 || accounts.length > 0 || trades.length > 0
    if (hasLocal) {
      await pushTrading().catch((e) => console.error('Trading initial push failed', e))
    }
    await pullTrading()
  }

  // ─── Habits ───────────────────────────────────────────────────────────
  if (!state.habitsInit) {
    state.habitsInit = true
    const { habits } = useHabitsStore.getState()
    if (habits.length > 0) {
      await pushHabits().catch((e) => console.error('Habits initial push failed', e))
    }
    await pullHabits()
  }

  // ─── Gym basics ───────────────────────────────────────────────────────
  if (!state.gymBasicsInit) {
    state.gymBasicsInit = true
    const { weightEntries, routines, sessions, trainingPlan } = useGymStore.getState()
    const hasLocal = weightEntries.length > 0
      || routines.length > 0
      || sessions.length > 0
      || Object.keys(trainingPlan).length > 0
    if (hasLocal) {
      await pushGymBasics().catch((e) => console.error('Gym basics initial push failed', e))
    }
    await pullGymBasics()
  }

  // ─── Health ───────────────────────────────────────────────────────────
  if (!state.healthInit) {
    state.healthInit = true
    const { snapshots } = useHealthStore.getState()
    const hasLocal = Object.keys(snapshots).length > 0
    if (hasLocal) {
      await pushHealth().catch((e) => console.error('Health initial push failed', e))
    }
    await pullHealth()
  }

  // ─── Chat ─────────────────────────────────────────────────────────────
  if (!state.chatInit) {
    state.chatInit = true
    const { messages } = useChatStore.getState()
    if (messages.length > 0) {
      await pushChat().catch((e) => console.error('Chat initial push failed', e))
    }
    await pullChat()
  }

  // ─── Food ─────────────────────────────────────────────────────────────
  if (!state.foodInit) {
    state.foodInit = true
    const { stages, shopping, notes } = useFoodStore.getState()
    const hasLocal = stages.length > 0 || shopping.length > 0 || !!notes
    if (hasLocal) {
      await pushFood().catch((e) => console.error('Food initial push failed', e))
    }
    await pullFood()
  }

  // ─── SPI ──────────────────────────────────────────────────────────────
  if (!state.spiInit) {
    state.spiInit = true
    const { sessions, bitacoraEntries } = useSPIStore.getState()
    const hasLocal = sessions.length > 0 || bitacoraEntries.length > 0
    if (hasLocal) {
      await pushSPI().catch((e) => console.error('SPI initial push failed', e))
    }
    await pullSPI()
  }

  // ─── Projection ───────────────────────────────────────────────────────
  if (!state.projectionInit) {
    state.projectionInit = true
    const { plans } = useProjectionStore.getState()
    if (plans.length > 0) {
      await pushProjection().catch((e) => console.error('Projection initial push failed', e))
    }
    await pullProjection()
  }

  // ─── Lab ──────────────────────────────────────────────────────────────
  if (!state.labInit) {
    state.labInit = true
    const { sessions, beliefs } = useLabStore.getState()
    const hasLocal = sessions.length > 0 || beliefs.length > 0
    if (hasLocal) {
      await pushLab().catch((e) => console.error('Lab initial push failed', e))
    }
    await pullLab()
  }

  // ─── App preferences ──────────────────────────────────────────────────
  // Excepción: fila única por user_id, sin deleteSurplus. El local store
  // SIEMPRE tiene defaults — pusheamos siempre. Esto garantiza que los
  // cambios de prefs (timezone, schedule, ideal hours, notif settings,
  // navOrder, etc.) sobrevivan al refresh, sin riesgo de borrar nada
  // remoto.
  if (!state.appPrefsInit) {
    state.appPrefsInit = true
    await pushAppPrefs().catch((e) => console.error('App prefs initial push failed', e))
    await pullAppPrefs()
  }

  // ─── Mind maps ────────────────────────────────────────────────────────
  if (!state.mindmapInit) {
    state.mindmapInit = true
    const { maps } = useMindMapStore.getState()
    if (maps.length > 0) {
      await pushMindMaps().catch((e) => console.error('Mindmaps initial push failed', e))
    }
    await pullMindMaps()
  }
}

/** Mount once at the app root. Wires all domains for sync. */
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
      await initAllDomains()
    })()

    // Subscribe to local store changes
    if (!subscribedRef.current) {
      subscribedRef.current = true
      useTasksStore.subscribe(() => { if (state.userId) scheduleTasks() })
      useWalletStore.subscribe(() => { if (state.userId) scheduleWallet() })
      useTradingStore.subscribe(() => { if (state.userId) scheduleTrading() })
      useHabitsStore.subscribe(() => { if (state.userId) scheduleHabits() })
      useGymStore.subscribe(() => { if (state.userId) scheduleGymBasics() })
      useHealthStore.subscribe(() => { if (state.userId) scheduleHealth() })
      useChatStore.subscribe(() => { if (state.userId) scheduleChat() })
      useFoodStore.subscribe(() => { if (state.userId) scheduleFood() })
      useSPIStore.subscribe(() => { if (state.userId) scheduleSPI() })
      useProjectionStore.subscribe(() => { if (state.userId) scheduleProjection() })
      useLabStore.subscribe(() => { if (state.userId) scheduleLab() })
      useAppStore.subscribe(() => { if (state.userId) scheduleAppPrefs() })
      useMindMapStore.subscribe(() => { if (state.userId) scheduleMindMaps() })
    }

    // Auth state changes — when the user signs in *after* mount (e.g. from
    // /login → /dashboard), re-run init so the new user's data gets pulled.
    const { data: sub } = sb.auth.onAuthStateChange((_event: string, session: { user?: { id: string } } | null) => {
      const newId = session?.user?.id ?? null
      if (newId === state.userId) return
      state.userId = newId
      state.tasksInit = false
      state.walletInit = false
      state.tradingInit = false
      state.habitsInit = false
      state.gymBasicsInit = false
      state.healthInit = false
      state.chatInit = false
      state.foodInit = false
      state.spiInit = false
      state.projectionInit = false
      state.labInit = false
      state.appPrefsInit = false
      state.mindmapInit = false
      if (newId) {
        initAllDomains().catch((e) => console.error('Init after auth change failed', e))
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
export async function forceSyncHabits()   { await pushHabits() }
export async function forcePullHabits()   { return pullHabits() }
export async function forceSyncGymBasics() { await pushGymBasics() }
export async function forcePullGymBasics() { return pullGymBasics() }
export async function forceSyncHealth()   { await pushHealth() }
export async function forcePullHealth()   { return pullHealth() }
export async function forceSyncChat()     { await pushChat() }
export async function forcePullChat()     { return pullChat() }
export async function forceSyncFood()     { await pushFood() }
export async function forcePullFood()     { return pullFood() }
export async function forceSyncSPI()      { await pushSPI() }
export async function forcePullSPI()      { return pullSPI() }
export async function forceSyncProjection() { await pushProjection() }
export async function forcePullProjection() { return pullProjection() }
export async function forceSyncLab()      { await pushLab() }
export async function forcePullLab()      { return pullLab() }
export async function forceSyncAppPrefs() { await pushAppPrefs() }
export async function forcePullAppPrefs() { return pullAppPrefs() }
export async function forceSyncMindMaps() { await pushMindMaps() }
export async function forcePullMindMaps() { return pullMindMaps() }
