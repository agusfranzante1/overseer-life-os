'use client'
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet as WalletIcon, Plus, Trash2, ArrowLeftRight, TrendingUp, TrendingDown,
  X, History, ChevronDown, ChevronUp, Settings, Check,
  Undo2, RotateCcw, AlertTriangle, Archive, Repeat, Pause, Play, Pencil,
} from 'lucide-react'
import {
  useWalletStore, getWalletBalance, getMonthlyTotals,
  Currency, Wallet, DEFAULT_CURRENCIES, type RecurringExpense,
} from '@/lib/store/walletStore'
import { useTranslation } from '@/hooks/useTranslation'

const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
const WALLET_COLORS = ['#10b981','#6366f1','#f59e0b','#ef4444','#3b82f6','#ec4899','#f97316','#8b5cf6','#14b8a6','#64748b','#003087','#009ee3']
const WALLET_ICONS  = ['💵','💶','💷','💴','🟡','🔵','💙','📈','🏦','💳','💰','🏧','🪙','💎']

function fmt(n: number, sym = '') {
  return `${sym}${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white/[0.03] border border-white/[0.12] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </motion.div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

const INPUT = 'w-full bg-zinc-800 border border-white/[0.12] rounded-2xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors'
const SELECT = 'w-full bg-zinc-800 border border-white/[0.12] rounded-2xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors'
const BTN_PRIMARY = 'w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl py-2.5 text-sm font-bold transition-colors'

// ─── Add Wallet Modal ─────────────────────────────────────────────────────────
function AddWalletModal({ onClose }: { onClose: () => void }) {
  const { addWallet, currencies } = useWalletStore()
  const [name, setName]     = useState('')
  const [color, setColor]   = useState(WALLET_COLORS[0])
  const [icon, setIcon]     = useState(WALLET_ICONS[0])
  const [selected, setSelected] = useState<string[]>(['USD'])

  const toggle = (code: string) =>
    setSelected(s => s.includes(code) ? s.filter(c => c !== code) : [...s, code])

  const submit = () => {
    if (!name.trim() || selected.length === 0) return
    addWallet({ name: name.trim(), color, icon, currencyCodes: selected })
    onClose()
  }

  return (
    <Modal title="Nueva billetera" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nombre">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Binance" className={INPUT} />
        </Field>
        <Field label="Ícono">
          <div className="flex flex-wrap gap-2">
            {WALLET_ICONS.map(ic => (
              <button key={ic} onClick={() => setIcon(ic)}
                className={`w-9 h-9 rounded-2xl text-lg flex items-center justify-center transition-all ${icon === ic ? 'ring-2 ring-indigo-500 bg-indigo-500/20' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
                {ic}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {WALLET_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900 scale-110' : ''}`}
                style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Field label="Divisas">
          <div className="flex flex-wrap gap-2">
            {currencies.map(cur => (
              <button key={cur.code} onClick={() => toggle(cur.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selected.includes(cur.code) ? 'border-transparent text-white' : 'border-white/[0.12] text-zinc-400 bg-zinc-800 hover:bg-zinc-700'}`}
                style={selected.includes(cur.code) ? { background: cur.color, borderColor: cur.color } : {}}>
                {cur.symbol} {cur.code}
              </button>
            ))}
          </div>
        </Field>
        <button onClick={submit} className={BTN_PRIMARY}>Crear billetera</button>
      </div>
    </Modal>
  )
}

// ─── Transaction Modal (income / expense) ─────────────────────────────────────
function TransactionModal({ walletId, type, currencyCode, onClose }: {
  walletId: string; type: 'income' | 'expense'; currencyCode: string; onClose: () => void
}) {
  const { addTransaction, wallets, currencies } = useWalletStore()
  const wallet   = wallets.find(w => w.id === walletId)!
  const currency = currencies.find(c => c.code === currencyCode)!
  const [label, setLabel]       = useState('')
  const [amount, setAmount]     = useState('')
  const [category, setCategory] = useState(type === 'income' ? 'Trabajo' : 'Gastos')
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0])

  const CATS = type === 'income'
    ? ['Trabajo','Inversión','Transferencia','Regalo','Otro']
    : ['Comida','Casa','Transporte','Salud','Ocio','Inversión','Transferencia','Otro']

  const submit = () => {
    const amt = parseFloat(amount)
    if (!label.trim() || isNaN(amt) || amt <= 0) return
    addTransaction({ type, walletId, currencyCode, amount: amt, label: label.trim(), category, date })
    onClose()
  }

  return (
    <Modal title={type === 'income' ? `💰 Registrar ingreso` : `💸 Registrar egreso`} onClose={onClose}>
      <div className="text-xs text-zinc-500 mb-4">
        {wallet.icon} {wallet.name} · <span style={{ color: currency.color }}>{currency.symbol} {currency.code}</span>
      </div>
      <div className="space-y-4">
        <Field label="Descripción">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej: Sueldo mayo" className={INPUT} />
        </Field>
        <Field label={`Monto (${currency.symbol})`}>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className={INPUT} />
        </Field>
        <Field label="Categoría">
          <select value={category} onChange={e => setCategory(e.target.value)} className={SELECT}>
            {CATS.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Fecha">
          <input value={date} onChange={e => setDate(e.target.value)} type="date" className={INPUT} />
        </Field>
        <button onClick={submit}
          className={`w-full rounded-2xl py-2.5 text-sm font-bold transition-colors text-white ${type === 'income' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}>
          {type === 'income' ? 'Registrar ingreso' : 'Registrar egreso'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Transfer Modal ────────────────────────────────────────────────────────────
function TransferModal({ onClose }: { onClose: () => void }) {
  const { wallets, currencies, transactions, addTransaction } = useWalletStore()
  const [fromWallet,   setFromWallet]   = useState(wallets[0]?.id ?? '')
  const [fromCurrency, setFromCurrency] = useState('')
  const [toWallet,     setToWallet]     = useState(wallets[1]?.id ?? '')
  const [toCurrency,   setToCurrency]   = useState('')
  const [amount,       setAmount]       = useState('')
  const [rate,         setRate]         = useState('1')
  const [label,        setLabel]        = useState('Transferencia')
  const [date,         setDate]         = useState(new Date().toISOString().split('T')[0])

  const fw = wallets.find(w => w.id === fromWallet)
  const tw = wallets.find(w => w.id === toWallet)
  const fc = fromCurrency || fw?.currencyCodes[0] || ''
  const tc = toCurrency   || tw?.currencyCodes[0] || ''
  const fcur = currencies.find(c => c.code === fc)
  const tcur = currencies.find(c => c.code === tc)
  const toAmount = (parseFloat(amount) || 0) * (parseFloat(rate) || 1)

  const submit = () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || !fromWallet || !toWallet || !fc || !tc) return
    addTransaction({
      type: 'transfer', walletId: fromWallet, currencyCode: fc, amount: amt,
      label, category: 'Transferencia', date,
      toWalletId: toWallet, toCurrencyCode: tc, toAmount,
    })
    onClose()
  }

  return (
    <Modal title="↔️ Transferir" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde">
            <select value={fromWallet} onChange={e => setFromWallet(e.target.value)} className={SELECT}>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
            </select>
          </Field>
          <Field label="Divisa origen">
            <select value={fc} onChange={e => setFromCurrency(e.target.value)} className={SELECT}>
              {(fw?.currencyCodes ?? []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Hacia">
            <select value={toWallet} onChange={e => setToWallet(e.target.value)} className={SELECT}>
              {wallets.filter(w => w.id !== fromWallet).map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
            </select>
          </Field>
          <Field label="Divisa destino">
            <select value={tc} onChange={e => setToCurrency(e.target.value)} className={SELECT}>
              {(tw?.currencyCodes ?? []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label={`Monto a enviar (${fcur?.symbol ?? ''} ${fc})`}>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className={INPUT} />
        </Field>
        <Field label={`Tipo de cambio (1 ${fc} = ? ${tc})`}>
          <input value={rate} onChange={e => setRate(e.target.value)} type="number" min="0" step="0.0001" className={INPUT} />
        </Field>
        {parseFloat(amount) > 0 && (
          <div className="bg-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-300">
            Recibís: <span className="font-bold" style={{ color: tcur?.color }}>
              {tcur?.symbol} {toAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tc}
            </span>
          </div>
        )}
        <Field label="Descripción">
          <input value={label} onChange={e => setLabel(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Fecha">
          <input value={date} onChange={e => setDate(e.target.value)} type="date" className={INPUT} />
        </Field>
        <button onClick={submit} className={BTN_PRIMARY}>Confirmar transferencia</button>
      </div>
    </Modal>
  )
}

// ─── Add Currency Modal ────────────────────────────────────────────────────────
function AddCurrencyModal({ onClose }: { onClose: () => void }) {
  const { addCurrency, currencies } = useWalletStore()
  const [code, setCode]     = useState('')
  const [symbol, setSymbol] = useState('')
  const [name, setName]     = useState('')
  const [color, setColor]   = useState('#6366f1')

  const submit = () => {
    if (!code.trim() || !symbol.trim() || !name.trim()) return
    if (currencies.find(c => c.code === code.toUpperCase())) return
    addCurrency({ code: code.toUpperCase(), symbol, name, color })
    onClose()
  }

  return (
    <Modal title="Nueva divisa" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código (ej: BTC)">
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="USD" className={INPUT} />
          </Field>
          <Field label="Símbolo (ej: $)">
            <input value={symbol} onChange={e => setSymbol(e.target.value)} maxLength={4} placeholder="$" className={INPUT} />
          </Field>
        </div>
        <Field label="Nombre">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Dólar" className={INPUT} />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {WALLET_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900 scale-110' : ''}`}
                style={{ background: c }} />
            ))}
          </div>
        </Field>
        <button onClick={submit} className={BTN_PRIMARY}>Crear divisa</button>
      </div>
    </Modal>
  )
}

// ─── Wallet Card ───────────────────────────────────────────────────────────────
function WalletCard({ wallet, selected, onClick, onRequestDelete }: { wallet: Wallet; selected: boolean; onClick: () => void; onRequestDelete: (w: Wallet) => void }) {
  const { transactions, currencies, updateWallet } = useWalletStore()
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(wallet.name)
  useEffect(() => { if (!editingName) setNameDraft(wallet.name) }, [wallet.name, editingName])

  const commitName = () => {
    setEditingName(false)
    const v = nameDraft.trim()
    if (v && v !== wallet.name) updateWallet(wallet.id, { name: v })
  }

  // Per-currency balances — first one is the headline (big), rest are
  // listed below as secondary lines. Previously we showed only the first
  // balance plus a "+N divisas" hint, which forced the user to click into
  // the wallet to see the rest. Now everything's visible at a glance.
  const balances = wallet.currencyCodes
    .map(code => ({
      cur: currencies.find(c => c.code === code),
      balance: getWalletBalance(wallet.id, code, transactions),
      code,
    }))
    .filter(b => b.cur)
  const [headline, ...rest] = balances

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className="relative text-left p-4 rounded-2xl border transition-all overflow-hidden group cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/20"
      style={{
        // Estilo del mockup: card oscura uniforme con glow radial del
        // color del brand en la esquina sup-izq. El borde se ilumina
        // SOLO cuando el wallet está seleccionado.
        background: `
          radial-gradient(circle at 0% 0%, ${wallet.color}28, transparent 50%),
          rgba(255, 255, 255, 0.03)
        `,
        borderColor: selected ? `${wallet.color}99` : 'rgba(255, 255, 255, 0.08)',
        boxShadow: selected
          ? `inset 0 0 0 1px ${wallet.color}55, 0 0 24px -8px ${wallet.color}77`
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Icon badge top-left — circle con el color del brand */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-2xl flex items-center justify-center text-lg"
          style={{
            background: `${wallet.color}22`,
            border: `1px solid ${wallet.color}40`,
          }}
        >
          <span>{wallet.icon}</span>
        </div>
        {/* Dot verde "selected" en la esquina sup-der */}
        {selected && (
          <div
            className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5"
            style={{ boxShadow: '0 0 6px rgba(52, 211, 153, 0.7)' }}
          />
        )}
      </div>

      {editingName ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitName}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commitName()
            if (e.key === 'Escape') { setNameDraft(wallet.name); setEditingName(false) }
          }}
          className="w-full bg-transparent border-b border-white/20 text-white text-[13px] font-medium focus:outline-none focus:border-white/50 px-0 py-0"
        />
      ) : (
        <p
          onClick={(e) => { e.stopPropagation(); setEditingName(true) }}
          title="Click para renombrar"
          className="text-[13px] font-medium text-white/90 truncate cursor-text hover:text-white"
        >
          {wallet.name}
        </p>
      )}
      {/* Headline balance — grande y blanco como en el mockup */}
      {headline && (
        <p className="text-xl font-bold tabular-nums mt-1 text-white">
          {headline.cur!.symbol}{fmt(headline.balance)}
          <span className="text-[11px] font-mono ml-1.5 text-zinc-500">{headline.code}</span>
        </p>
      )}
      {/* Additional currencies — vertical list, each with its own color.
          Tinted background pill on each line so they read as distinct
          "buckets" without taking too much space. */}
      {rest.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {rest.map(({ cur, balance, code }) => (
            <div key={code}
              className={`flex items-center justify-between gap-2 text-xs tabular-nums px-1.5 py-0.5 rounded ${
                selected ? 'bg-white/10' : ''
              }`}
              style={!selected ? { background: `${cur!.color}15` } : undefined}
            >
              <span className={`font-semibold ${selected ? 'text-white/80' : ''}`}
                style={!selected ? { color: cur!.color } : undefined}>
                {cur!.symbol}{fmt(balance)}
              </span>
              <span className={`text-[9px] font-mono ${selected ? 'text-white/60' : 'text-zinc-500'}`}>
                {code}
              </span>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={e => { e.stopPropagation(); onRequestDelete(wallet) }}
        title="Eliminar billetera"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-white/50 hover:text-red-400 transition-all"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  )
}

// ─── Edit Wallet Modal — change name, icon and color ─────────────────────────
function EditWalletModal({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const { updateWallet } = useWalletStore()
  const [name, setName] = useState(wallet.name)
  const [color, setColor] = useState(wallet.color)
  const [icon, setIcon] = useState(wallet.icon)

  // If the current color isn't in the preset palette (e.g. you imported
  // a wallet with a custom color), we still want to show it as selected.
  const allColors = WALLET_COLORS.includes(color) ? WALLET_COLORS : [color, ...WALLET_COLORS]

  const submit = () => {
    const patch: Partial<Wallet> = {}
    const n = name.trim()
    if (n && n !== wallet.name) patch.name = n
    if (color !== wallet.color) patch.color = color
    if (icon !== wallet.icon) patch.icon = icon
    if (Object.keys(patch).length > 0) updateWallet(wallet.id, patch)
    onClose()
  }

  return (
    <Modal title="Editar billetera" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nombre">
          <input value={name} onChange={e => setName(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Ícono">
          <div className="flex flex-wrap gap-2">
            {WALLET_ICONS.map(ic => (
              <button key={ic} onClick={() => setIcon(ic)}
                className={`w-9 h-9 rounded-2xl text-lg flex items-center justify-center transition-all ${icon === ic ? 'ring-2 ring-indigo-500 bg-indigo-500/20' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
                {ic}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {allColors.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900 scale-110' : ''}`}
                style={{ background: c }} />
            ))}
          </div>
          <p className="text-[10px] text-zinc-500 mt-2">
            Previsualización:
            <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border align-middle"
              style={{ background: color + '18', borderColor: color + '40', color }}>
              <span>{icon}</span> <span className="font-bold">{name || wallet.name}</span>
            </span>
          </p>
        </Field>
        <button onClick={submit} className={BTN_PRIMARY}>Guardar cambios</button>
      </div>
    </Modal>
  )
}

// ─── Wallet Detail ─────────────────────────────────────────────────────────────
function WalletDetail({ walletId, onTransaction }: {
  walletId: string
  onTransaction: (type: 'income' | 'expense', currency: string) => void
}) {
  const { wallets, currencies, transactions, addCurrencyToWallet, removeCurrencyFromWallet } = useWalletStore()
  const wallet = wallets.find(w => w.id === walletId)
  const [showEdit, setShowEdit] = useState(false)
  if (!wallet) return null

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center gap-3">
        <button
          onClick={() => setShowEdit(true)}
          title="Cambiar ícono / color / nombre"
          className="text-2xl hover:scale-110 transition-transform"
        >
          {wallet.icon}
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white">{wallet.name}</p>
          <p className="text-xs text-zinc-500">{wallet.currencyCodes.join(' · ')}</p>
        </div>
        <button
          onClick={() => setShowEdit(true)}
          title="Editar billetera"
          className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-white/[0.12] transition-colors flex items-center gap-1.5"
        >
          <span className="w-3 h-3 rounded-full border border-zinc-600" style={{ background: wallet.color }} />
          Editar
        </button>
      </div>

      <AnimatePresence>
        {showEdit && <EditWalletModal wallet={wallet} onClose={() => setShowEdit(false)} />}
      </AnimatePresence>

      {wallet.currencyCodes.map(code => {
        const cur = currencies.find(c => c.code === code)
        if (!cur) return null
        const balance = getWalletBalance(walletId, code, transactions)
        const walletTxns = transactions.filter(t => t.walletId === walletId && t.currencyCode === code)
        const income  = walletTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        const expense = walletTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

        return (
          <div key={code} className="flex items-center gap-4 px-5 py-4 border-b border-white/[0.08]/60 last:border-0">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cur.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black tabular-nums" style={{ color: cur.color }}>
                  {cur.symbol} {fmt(balance)}
                </span>
                <span className="text-xs text-zinc-500 font-mono">{code}</span>
              </div>
              <div className="flex gap-4 mt-1 text-xs text-zinc-500">
                <span className="text-emerald-400">↑ {cur.symbol}{fmt(income)}</span>
                <span className="text-red-400">↓ {cur.symbol}{fmt(expense)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onTransaction('income', code)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold transition-all">
                <TrendingUp className="w-3 h-3" /> Ingreso
              </button>
              <button onClick={() => onTransaction('expense', code)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-semibold transition-all">
                <TrendingDown className="w-3 h-3" /> Egreso
              </button>
              <button onClick={() => removeCurrencyFromWallet(walletId, code)}
                className="text-zinc-600 hover:text-red-400 transition-colors p-1">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )
      })}

      {/* Add currency to wallet */}
      <div className="px-5 py-3 bg-zinc-800/30">
        <select
          className="text-xs bg-transparent text-zinc-500 hover:text-zinc-300 cursor-pointer outline-none"
          value=""
          onChange={e => { if (e.target.value) addCurrencyToWallet(walletId, e.target.value) }}
        >
          <option value="">+ Agregar divisa…</option>
          {useWalletStore.getState().currencies
            .filter(c => !wallet.currencyCodes.includes(c.code))
            .map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>)}
        </select>
      </div>
    </div>
  )
}

// ─── Cash Flow Tables — ONE per currency ─────────────────────────────────────
// Renders a stack of per-currency cash flow tables. Each table shows the 12
// months of the year + a "Total" column with the annual roll-up so you don't
// have to mentally add the row.
//
// Only renders a table for currencies that actually have movements (≥1 income
// or expense in the year) — keeps the UI focused on what you use.
function CashFlowTable() {
  const { transactions, currencies } = useWalletStore()
  const year = new Date().getFullYear()

  // Decide which currencies to show — those with at least one transaction
  // this year. If a user has 5 currencies but only uses 2, the other 3
  // would be empty noise.
  const activeCurrencies = useMemo(() => {
    const codesWithMovement = new Set(
      transactions
        .filter((t) => t.date?.startsWith(String(year)))
        .flatMap((t) => [t.currencyCode, t.toCurrencyCode].filter(Boolean) as string[])
    )
    return currencies.filter((c) => codesWithMovement.has(c.code))
  }, [transactions, currencies, year])

  if (activeCurrencies.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Flujo de Caja {year}</p>
        <p className="text-xs text-zinc-600 italic">
          Sin movimientos este año todavía. Registrá un ingreso o egreso para ver el flujo por divisa.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
        Flujo de Caja {year} · {activeCurrencies.length} {activeCurrencies.length === 1 ? 'divisa' : 'divisas'}
      </p>
      {activeCurrencies.map((cur) => (
        <CurrencyCashFlowTable key={cur.code} currency={cur} year={year} transactions={transactions} />
      ))}
    </div>
  )
}

/** One cash flow table for a single currency. Includes Ingresos / Egresos /
 *  Balance rows + a Total column at the right showing the year roll-up. */
function CurrencyCashFlowTable({
  currency, year, transactions,
}: {
  currency: Currency
  year: number
  transactions: ReturnType<typeof useWalletStore.getState>['transactions']
}) {
  const currentMonth = new Date().getMonth()
  const isCurrentYear = year === new Date().getFullYear()

  const monthlyData = useMemo(
    () => getMonthlyTotals(currency.code, year, transactions),
    [currency.code, year, transactions]
  )

  // Annual totals — sum across the 12 months for the right-most "Total" col.
  const totals = useMemo(() => {
    const income  = monthlyData.reduce((s, m) => s + m.income, 0)
    const expense = monthlyData.reduce((s, m) => s + m.expense, 0)
    return { income, expense, balance: income - expense }
  }, [monthlyData])

  return (
    <div className="bg-white/[0.03] border rounded-2xl overflow-hidden"
      style={{ borderColor: currency.color + '40' }}>
      {/* Per-currency header — color-tinted so each table is easy to scan */}
      <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap"
        style={{ background: currency.color + '0F', borderColor: currency.color + '30' }}>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: currency.color }} />
          <span className="text-sm font-bold" style={{ color: currency.color }}>
            {currency.symbol} {currency.code}
          </span>
          <span className="text-xs text-zinc-500">· {currency.name}</span>
        </div>
        {/* Headline annual balance for this currency */}
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider">
          <span className="text-zinc-500">↑ <span className="text-emerald-400 tabular-nums">{currency.symbol}{fmt(totals.income)}</span></span>
          <span className="text-zinc-500">↓ <span className="text-red-400 tabular-nums">{currency.symbol}{fmt(totals.expense)}</span></span>
          <span className="text-zinc-500">
            = <span className="tabular-nums font-bold"
              style={{ color: totals.balance > 0 ? '#10b981' : totals.balance < 0 ? '#ef4444' : '#71717a' }}>
              {currency.symbol}{fmt(totals.balance)}
            </span>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="text-left px-4 py-2.5 text-zinc-500 font-semibold w-24 uppercase tracking-wider">Concepto</th>
              {MONTHS.map((m, i) => (
                <th key={m}
                  className={`px-3 py-2.5 text-center font-semibold uppercase tracking-wider ${
                    isCurrentYear && i === currentMonth ? 'text-indigo-400' : 'text-zinc-500'
                  }`}>
                  {m}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-zinc-300 border-l border-white/[0.08] bg-zinc-800/40">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Ingresos', key: 'income' as const, color: '#10b981' },
              { label: 'Egresos',  key: 'expense' as const, color: '#ef4444' },
            ].map(({ label, key, color }) => {
              const annualForRow = totals[key]
              return (
                <tr key={key} className="border-b border-white/[0.08]/50">
                  <td className="px-4 py-2.5 font-semibold" style={{ color }}>{label}</td>
                  {monthlyData.map((m, i) => (
                    <td key={i}
                      className={`px-3 py-2.5 text-center tabular-nums font-mono ${
                        isCurrentYear && i === currentMonth ? 'bg-indigo-500/5' : ''
                      }`}
                      style={{ color: m[key] > 0 ? color : '#52525b' }}>
                      {m[key] > 0 ? fmt(m[key]) : '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center tabular-nums font-mono font-bold border-l border-white/[0.08] bg-zinc-800/40"
                    style={{ color: annualForRow > 0 ? color : '#52525b' }}>
                    {annualForRow > 0 ? fmt(annualForRow) : '—'}
                  </td>
                </tr>
              )
            })}
            <tr className="bg-zinc-800/30">
              <td className="px-4 py-2.5 font-bold text-zinc-300">Balance</td>
              {monthlyData.map((m, i) => {
                const bal = m.income - m.expense
                return (
                  <td key={i}
                    className={`px-3 py-2.5 text-center tabular-nums font-bold font-mono ${
                      isCurrentYear && i === currentMonth ? 'bg-indigo-500/5' : ''
                    }`}
                    style={{ color: bal > 0 ? '#10b981' : bal < 0 ? '#ef4444' : '#52525b' }}>
                    {bal !== 0 ? fmt(bal) : '—'}
                  </td>
                )
              })}
              <td className="px-3 py-2.5 text-center tabular-nums font-black font-mono border-l border-white/[0.08] bg-zinc-800/60"
                style={{ color: totals.balance > 0 ? '#10b981' : totals.balance < 0 ? '#ef4444' : '#71717a' }}>
                {totals.balance !== 0 ? fmt(totals.balance) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Distribution Panel ────────────────────────────────────────────────────────
function DistributionPanel() {
  const { distribution, transactions, currencies, updateDistribution } = useWalletStore()
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [currency, setCurrency] = useState('USD')

  const month = new Date().toISOString().slice(0, 7)
  const monthlyIncome = transactions
    .filter(t => t.type === 'income' && t.currencyCode === currency && t.date.startsWith(month))
    .reduce((s, t) => s + t.amount, 0)

  const cur = currencies.find(c => c.code === currency)

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Distribución de Porcentajes</p>
        <select value={currency} onChange={e => setCurrency(e.target.value)}
          className="text-xs bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1 text-zinc-300 focus:outline-none">
          {currencies.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
        </select>
      </div>

      {monthlyIncome > 0 && (
        <div className="px-5 py-2.5 bg-zinc-800/40 border-b border-white/[0.08] text-xs text-zinc-400">
          Ingreso del mes: <span className="font-bold" style={{ color: cur?.color }}>{cur?.symbol}{fmt(monthlyIncome)} {currency}</span>
        </div>
      )}

      <div className="divide-y divide-zinc-800/60">
        {distribution.map(item => {
          const amount = (monthlyIncome * item.percentage) / 100
          return (
            <div key={item.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
              <span className="text-sm font-semibold text-zinc-200 flex-1">{item.label}</span>

              {editing === item.id ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { updateDistribution(item.id, parseFloat(editVal) || item.percentage); setEditing(null) }
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    className="w-14 bg-zinc-800 border border-indigo-500 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none"
                  />
                  <span className="text-zinc-400 text-sm">%</span>
                  <button onClick={() => { updateDistribution(item.id, parseFloat(editVal) || item.percentage); setEditing(null) }}
                    className="text-indigo-400 hover:text-indigo-300 ml-1"><Check className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <button onClick={() => { setEditVal(String(item.percentage)); setEditing(item.id) }}
                  className="text-sm font-bold tabular-nums hover:opacity-80 transition-opacity"
                  style={{ color: item.color }}>
                  {item.percentage}%
                </button>
              )}

              {monthlyIncome > 0 && (
                <span className="text-xs font-mono text-zinc-400 w-28 text-right">
                  {cur?.symbol}{fmt(amount)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-4 pt-2">
        <div className="flex h-2 rounded-full overflow-hidden gap-px">
          {distribution.map(item => (
            <div key={item.id} style={{ flex: item.percentage, background: item.color }} />
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-zinc-600">
          <span>Total: {distribution.reduce((s, d) => s + d.percentage, 0)}%</span>
          <span className={distribution.reduce((s, d) => s + d.percentage, 0) !== 100 ? 'text-amber-400' : 'text-emerald-400'}>
            {distribution.reduce((s, d) => s + d.percentage, 0) === 100 ? '✓ Balanceado' : '⚠ Ajustá los %'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Recurring Expenses Panel ─────────────────────────────────────────────────
//
// Lista de pagos/suscripciones que se cargan SOLOS el día del mes configurado.
// El processor (`processRecurringExpenses`) corre al montar MoneyPage + cada
// hora, y es idempotente (no doble-carga) gracias a `lastAppliedYearMonth`.
function RecurringExpensesPanel({ onOpenAdd }: { onOpenAdd: () => void }) {
  const { recurringExpenses, wallets, currencies, updateRecurringExpense, removeRecurringExpense } = useWalletStore()
  const [collapsed, setCollapsed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Sort: active first (by next charge day asc), inactive at the bottom
  const sorted = useMemo(() => {
    const today = new Date()
    const todayDay = today.getDate()
    return [...recurringExpenses].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      // For active ones, sort by "days until next charge" (smaller = sooner)
      const daysUntil = (r: RecurringExpense) => {
        const d = r.dayOfMonth - todayDay
        return d >= 0 ? d : d + 30  // wrap to next month
      }
      return daysUntil(a) - daysUntil(b)
    })
  }, [recurringExpenses])

  const activeCount = recurringExpenses.filter(r => r.active).length
  const monthlyByCurrency = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of recurringExpenses) {
      if (!r.active) continue
      map.set(r.currencyCode, (map.get(r.currencyCode) ?? 0) + r.amount)
    }
    return map
  }, [recurringExpenses])

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => setCollapsed(v => !v)} className="flex items-center gap-2 group">
          {collapsed ? <ChevronDown className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" /> : <ChevronUp className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />}
          <Repeat className="w-4 h-4 text-purple-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Pagos Recurrentes
          </p>
          <span className="text-[10px] font-mono text-zinc-500">
            {activeCount} {activeCount === 1 ? 'activo' : 'activos'}
          </span>
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Per-currency monthly total */}
          {Array.from(monthlyByCurrency.entries()).map(([code, total]) => {
            const cur = currencies.find(c => c.code === code)
            if (!cur) return null
            return (
              <span key={code} className="text-[10px] font-mono text-zinc-500">
                <span style={{ color: cur.color }}>
                  {cur.symbol}{fmt(total)} {code}
                </span>
                <span className="text-zinc-600 ml-1">/mes</span>
              </span>
            )
          })}
          <button onClick={onOpenAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-purple-300 rounded-lg text-xs font-semibold transition-all">
            <Plus className="w-3 h-3" /> Nuevo
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-zinc-800/60">
          {sorted.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Repeat className="w-8 h-8 text-purple-400/50 mx-auto mb-2" />
              <p className="text-sm text-zinc-400 font-semibold mb-1">Sin pagos recurrentes</p>
              <p className="text-xs text-zinc-600 mb-4 max-w-md mx-auto">
                Agregá una suscripción (Netflix, Spotify…) o un gasto fijo (alquiler, gym…) y
                se va a cargar SOLA el día del mes configurado. Idempotente — no se duplica si
                abrís la app varias veces.
              </p>
              <button onClick={onOpenAdd}
                className="px-4 py-2 bg-purple-500/15 border border-purple-500/40 hover:bg-purple-500/25 text-purple-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Crear el primero
              </button>
            </div>
          ) : sorted.map(r => (
            <RecurringRow
              key={r.id}
              recurring={r}
              wallets={wallets}
              currencies={currencies}
              onEdit={() => setEditingId(r.id)}
              onToggle={() => updateRecurringExpense(r.id, { active: !r.active })}
              onRemove={() => { if (confirm(`¿Eliminar "${r.label}"? El cargo automático se detiene. Las cargas pasadas quedan en el historial.`)) removeRecurringExpense(r.id) }}
              isEditing={editingId === r.id}
              onCloseEdit={() => setEditingId(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RecurringRow({
  recurring, wallets, currencies, onEdit, onToggle, onRemove, isEditing, onCloseEdit,
}: {
  recurring: RecurringExpense
  wallets: Wallet[]
  currencies: Currency[]
  onEdit: () => void
  onToggle: () => void
  onRemove: () => void
  isEditing: boolean
  onCloseEdit: () => void
}) {
  const wallet = wallets.find(w => w.id === recurring.walletId)
  const cur = currencies.find(c => c.code === recurring.currencyCode)
  const today = new Date()
  const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const todayDay = today.getDate()
  const chargedThisMonth = recurring.lastAppliedYearMonth === todayYM
  const daysUntil = chargedThisMonth
    ? null  // Already done this month
    : recurring.dayOfMonth >= todayDay
      ? recurring.dayOfMonth - todayDay
      : recurring.dayOfMonth + (30 - todayDay)  // approx — wraps to next month

  if (isEditing) {
    return (
      <div className="px-5 py-4">
        <RecurringExpenseForm
          existing={recurring}
          onSaved={onCloseEdit}
          onCancel={onCloseEdit}
        />
      </div>
    )
  }

  return (
    <div className={`px-5 py-3 flex items-center gap-3 transition-all ${recurring.active ? '' : 'opacity-50'}`}>
      {/* Day-of-month badge */}
      <div className="shrink-0 w-12 text-center">
        <div className="w-10 h-10 rounded-lg border flex flex-col items-center justify-center mx-auto"
          style={{
            background: (cur?.color ?? '#52525b') + '15',
            borderColor: (cur?.color ?? '#52525b') + '50',
          }}>
          <span className="text-[8px] font-mono uppercase leading-none" style={{ color: cur?.color }}>día</span>
          <span className="text-sm font-extrabold tabular-nums leading-tight" style={{ color: cur?.color }}>
            {recurring.dayOfMonth}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-zinc-200 truncate">{recurring.label}</p>
          {recurring.isSubscription && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300">
              suscripción
            </span>
          )}
          {!recurring.active && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 border border-white/[0.12] text-zinc-500">
              pausada
            </span>
          )}
          {recurring.active && chargedThisMonth && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-0.5">
              <Check className="w-2.5 h-2.5" /> cobrado este mes
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
          {wallet?.icon} {wallet?.name ?? '(wallet eliminada)'}
          {' · '}
          <span style={{ color: cur?.color }}>{cur?.symbol}{fmt(recurring.amount)} {cur?.code}</span>
          {recurring.category && <> · {recurring.category}</>}
          {recurring.active && !chargedThisMonth && daysUntil !== null && (
            <> · <span className="text-amber-400">próximo cargo en {daysUntil}d</span></>
          )}
          {recurring.endDate && <> · hasta {recurring.endDate}</>}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onToggle}
          title={recurring.active ? 'Pausar (no se cobra hasta reactivar)' : 'Reactivar'}
          className={`p-2 rounded-lg transition-colors ${recurring.active ? 'text-amber-400 hover:bg-amber-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}>
          {recurring.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onEdit}
          title="Editar"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onRemove}
          title="Eliminar (deja de cobrar)"
          className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Recurring expense Modal + inline form ────────────────────────────────────

function RecurringExpenseModal({
  existing, onClose,
}: { existing?: RecurringExpense; onClose: () => void }) {
  return (
    <Modal title={existing ? 'Editar recurrente' : 'Nuevo pago recurrente'} onClose={onClose}>
      <RecurringExpenseForm existing={existing} onSaved={onClose} onCancel={onClose} />
    </Modal>
  )
}

function RecurringExpenseForm({
  existing, onSaved, onCancel,
}: {
  existing?: RecurringExpense
  onSaved: () => void
  onCancel: () => void
}) {
  const { wallets, currencies, addRecurringExpense, updateRecurringExpense } = useWalletStore()

  const [walletId, setWalletId]     = useState(existing?.walletId ?? wallets[0]?.id ?? '')
  const [currencyCode, setCurrency] = useState(existing?.currencyCode ?? wallets[0]?.currencyCodes[0] ?? 'USD')
  const [amount, setAmount]         = useState(existing ? String(existing.amount) : '')
  const [label, setLabel]           = useState(existing?.label ?? '')
  const [category, setCategory]     = useState(existing?.category ?? 'Suscripción')
  const [dayOfMonth, setDay]        = useState(existing ? String(existing.dayOfMonth) : '1')
  const [startDate, setStart]       = useState(existing?.startDate ?? new Date().toISOString().split('T')[0])
  const [endDate, setEnd]           = useState(existing?.endDate ?? '')
  const [isSubscription, setIsSub]  = useState(existing?.isSubscription ?? true)
  const [active, setActive]         = useState(existing?.active ?? true)

  // Adjust currency if user switches wallet to one that doesn't support it
  const selectedWallet = wallets.find(w => w.id === walletId)
  const availableCurrencies = selectedWallet
    ? currencies.filter(c => selectedWallet.currencyCodes.includes(c.code))
    : currencies

  useEffect(() => {
    if (selectedWallet && !selectedWallet.currencyCodes.includes(currencyCode)) {
      setCurrency(selectedWallet.currencyCodes[0] ?? 'USD')
    }
  }, [walletId, currencyCode, selectedWallet])

  const submit = () => {
    const amt = parseFloat(amount)
    const day = parseInt(dayOfMonth, 10)
    if (!walletId || !label.trim() || !Number.isFinite(amt) || amt <= 0 || !Number.isFinite(day)) return
    const payload = {
      walletId, currencyCode, amount: amt, label: label.trim(),
      category: category.trim() || 'Suscripción',
      dayOfMonth: day, active,
      startDate, endDate: endDate || undefined,
      isSubscription,
    }
    if (existing) {
      updateRecurringExpense(existing.id, payload)
    } else {
      addRecurringExpense(payload)
    }
    onSaved()
  }

  const CATS = ['Suscripción', 'Casa', 'Transporte', 'Salud', 'Comida', 'Ocio', 'Inversión', 'Otro']

  return (
    <div className="space-y-4">
      <Field label="Etiqueta (qué es)">
        <input value={label} onChange={e => setLabel(e.target.value)}
          placeholder="Netflix, Alquiler, Gym..." className={INPUT}
          autoFocus enterKeyHint="next" autoCapitalize="sentences" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Billetera">
          <select value={walletId} onChange={e => setWalletId(e.target.value)} className={SELECT}>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
          </select>
        </Field>
        <Field label="Divisa">
          <select value={currencyCode} onChange={e => setCurrency(e.target.value)} className={SELECT}>
            {availableCurrencies.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto">
          <input value={amount} onChange={e => setAmount(e.target.value)}
            type="number" min="0" step="0.01" placeholder="0.00" className={INPUT} inputMode="decimal" />
        </Field>
        <Field label="Día del mes (1-28)">
          <input value={dayOfMonth} onChange={e => setDay(e.target.value)}
            type="number" min="1" max="28" className={INPUT} inputMode="numeric" />
        </Field>
      </div>

      <Field label="Categoría">
        <select value={category} onChange={e => setCategory(e.target.value)} className={SELECT}>
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Empezar el">
          <input value={startDate} onChange={e => setStart(e.target.value)}
            type="date" className={INPUT} />
        </Field>
        <Field label="Terminar el (opcional)">
          <input value={endDate} onChange={e => setEnd(e.target.value)}
            type="date" className={INPUT} placeholder="—" />
        </Field>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={isSubscription} onChange={e => setIsSub(e.target.checked)}
            className="accent-purple-500" />
          Es suscripción
        </label>
        <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
            className="accent-emerald-500" />
          Activa (cobra automático)
        </label>
      </div>

      <div className="flex items-center gap-2 justify-end pt-2 border-t border-white/[0.08]">
        <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-2">
          Cancelar
        </button>
        <button onClick={submit}
          disabled={!label.trim() || !walletId || !amount}
          className="px-4 py-2 bg-purple-500/20 border border-purple-500/40 hover:bg-purple-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-purple-200 rounded-lg text-sm font-semibold flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> {existing ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </div>
  )
}

// ─── Transaction History ───────────────────────────────────────────────────────
function TransactionHistory() {
  const { transactions, wallets, currencies, removeTransaction } = useWalletStore()
  const [filterWallet, setFilterWallet]   = useState('all')
  const [filterType,   setFilterType]     = useState('all')
  const [showCount,    setShowCount]      = useState(15)

  const sorted = [...transactions].sort((a, b) => b.timestamp - a.timestamp)
  const filtered = sorted.filter(t =>
    (filterWallet === 'all' || t.walletId === filterWallet) &&
    (filterType === 'all' || t.type === filterType)
  )
  const visible = filtered.slice(0, showCount)

  const typeColor = (type: string) =>
    type === 'income' ? '#10b981' : type === 'expense' ? '#ef4444' : '#6366f1'
  const typeLabel = (t: typeof transactions[0]) => {
    if (t.type === 'transfer') {
      const to = wallets.find(w => w.id === t.toWalletId)
      return `→ ${to?.name ?? '?'}`
    }
    return t.type === 'income' ? 'Ingreso' : 'Egreso'
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.08] flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-zinc-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Historial de Registros</p>
        </div>
        <div className="flex gap-2 ml-auto">
          <select value={filterWallet} onChange={e => setFilterWallet(e.target.value)}
            className="text-xs bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1.5 text-zinc-300 focus:outline-none">
            <option value="all">Todas las billeteras</option>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="text-xs bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1.5 text-zinc-300 focus:outline-none">
            <option value="all">Todos</option>
            <option value="income">Ingresos</option>
            <option value="expense">Egresos</option>
            <option value="transfer">Transferencias</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-10 text-center text-zinc-600 text-sm">Sin registros</div>
      ) : (
        <>
          <div className="divide-y divide-zinc-800/50">
            {visible.map(t => {
              const wallet = wallets.find(w => w.id === t.walletId)
              const cur    = currencies.find(c => c.code === t.currencyCode)
              return (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/30 transition-colors group">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: typeColor(t.type) }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-zinc-200 truncate">{t.label}</p>
                      <span className="text-[10px] text-zinc-600 shrink-0">{typeLabel(t)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>{wallet?.icon} {wallet?.name}</span>
                      <span>·</span>
                      <span>{t.category}</span>
                      <span>·</span>
                      <span>{t.date}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums" style={{ color: typeColor(t.type) }}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '→'}
                      {cur?.symbol}{fmt(t.amount)}
                    </p>
                    {t.type === 'transfer' && t.toAmount && (
                      <p className="text-[10px] text-zinc-500">
                        +{currencies.find(c => c.code === t.toCurrencyCode)?.symbol}
                        {fmt(t.toAmount)} {t.toCurrencyCode}
                      </p>
                    )}
                  </div>
                  <button onClick={() => removeTransaction(t.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all ml-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
          {filtered.length > showCount && (
            <button onClick={() => setShowCount(s => s + 15)}
              className="w-full py-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/[0.08]">
              Ver {Math.min(15, filtered.length - showCount)} más de {filtered.length} registros
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteWalletModal({ wallet, onConfirm, onClose }: { wallet: Wallet; onConfirm: () => void; onClose: () => void }) {
  const { transactions, currencies } = useWalletStore()
  const related = transactions.filter(t => t.walletId === wallet.id || t.toWalletId === wallet.id)
  const balances = wallet.currencyCodes.map(code => ({
    code,
    cur: currencies.find(c => c.code === code),
    balance: getWalletBalance(wallet.id, code, transactions),
  }))

  return (
    <Modal title="Eliminar billetera" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">
              Vas a eliminar <span className="text-red-400">{wallet.icon} {wallet.name}</span>
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {related.length} {related.length === 1 ? 'transacción' : 'transacciones'} también se moverán a la papelera.
              Podés restaurar todo desde el historial.
            </p>
          </div>
        </div>

        {balances.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Saldos al eliminar</p>
            <div className="space-y-1">
              {balances.map(b => (
                <div key={b.code} className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-zinc-800/50">
                  <span className="text-zinc-300">{b.code}</span>
                  <span className="font-bold tabular-nums" style={{ color: b.cur?.color }}>
                    {b.cur?.symbol}{fmt(b.balance)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl text-sm font-semibold transition-colors">
            Cancelar
          </button>
          <button onClick={() => { onConfirm(); onClose() }}
            className="flex-1 px-4 py-2.5 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 text-red-400 rounded-2xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Undo Toast (auto-dismisses after 10s, manual dismiss available) ──────────
function UndoToast({ deletedId, walletName, walletIcon, onUndo, onDismiss }: {
  deletedId: string
  walletName: string
  walletIcon: string
  onUndo: () => void
  onDismiss: () => void
}) {
  // Auto-dismiss after 10s
  useEffect(() => {
    const t = setTimeout(onDismiss, 10000)
    return () => clearTimeout(t)
  }, [deletedId, onDismiss])

  return (
    <motion.div
      key={deletedId}
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.12] shadow-2xl shadow-black/50 backdrop-blur"
    >
      <span className="text-xl">{walletIcon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          <span className="text-zinc-400">Eliminada:</span> {walletName}
        </p>
        <p className="text-[10px] text-zinc-500">Se va a la papelera. Tenés 10s para deshacer.</p>
      </div>
      <button
        onClick={onUndo}
        title="Deshacer (rehacer rápido)"
        className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-400 text-sm font-bold transition-all group"
      >
        <Undo2 className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Deshacer
      </button>
      <button
        onClick={onDismiss}
        className="text-zinc-600 hover:text-zinc-300 p-1"
        title="Descartar (ir a papelera)"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

// ─── Deleted Wallets History (papelera) ───────────────────────────────────────
function DeletedWalletsHistory() {
  const { deletedWallets, restoreWallet, purgeDeletedWallet, purgeAllDeleted, currencies } = useWalletStore()
  const [expanded, setExpanded] = useState(false)

  if (deletedWallets.length === 0) return null

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/40 transition-colors">
        <div className="flex items-center gap-3">
          <Archive className="w-4 h-4 text-zinc-500" />
          <div className="text-left">
            <h2 className="text-sm font-bold text-white">Papelera de billeteras</h2>
            <p className="text-[11px] text-zinc-500">
              {deletedWallets.length} eliminada{deletedWallets.length === 1 ? '' : 's'} · podés restaurar cualquiera
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expanded && deletedWallets.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); if (confirm('¿Borrar definitivamente todo el contenido de la papelera?')) purgeAllDeleted() }}
              className="text-[11px] font-semibold text-red-400/70 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10"
            >
              Vaciar papelera
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-2 border-t border-white/[0.08]/60 pt-4">
              {deletedWallets.map(entry => {
                const balances = entry.wallet.currencyCodes.map(code => ({
                  code,
                  cur: currencies.find(c => c.code === code),
                  balance: getWalletBalance(entry.wallet.id, code, entry.transactions),
                }))
                const dt = new Date(entry.deletedAt)
                const dateStr = dt.toLocaleString('es-AR', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-white/[0.08] bg-black/30/40 hover:border-white/[0.12] transition-all"
                    style={{ borderLeftColor: entry.wallet.color, borderLeftWidth: 3 }}
                  >
                    <span className="text-2xl shrink-0">{entry.wallet.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-200 truncate">{entry.wallet.name}</p>
                      <p className="text-[10px] text-zinc-500 font-mono">
                        eliminada · {dateStr} · {entry.transactions.length} tx
                      </p>
                      {balances.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          {balances.map(b => (
                            <span key={b.code} className="text-[11px] font-mono tabular-nums" style={{ color: b.cur?.color ?? '#71717a' }}>
                              {b.cur?.symbol ?? b.code}{fmt(b.balance)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => restoreWallet(entry.id)}
                      title="Restaurar billetera"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Borrar definitivamente "${entry.wallet.name}"? Esta acción no se puede deshacer.`)) purgeDeletedWallet(entry.id) }}
                      title="Borrar definitivamente"
                      className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── MoneyPage (main) ─────────────────────────────────────────────────────────
export function MoneyPage() {
  const { t } = useTranslation()
  const { wallets, currencies, removeWallet, restoreWallet, processRecurringExpenses } = useWalletStore()
  const [selectedWalletId, setSelectedWalletId] = useState(wallets[0]?.id ?? '')

  // Apply any pending recurring charges on every MoneyPage mount + once an hour
  // as a safety net (in case the user keeps the tab open across midnight or
  // across the 1st of the month). Idempotent — won't double-charge thanks to
  // `lastAppliedYearMonth` guard in the store.
  useEffect(() => {
    processRecurringExpenses()
    const id = setInterval(() => processRecurringExpenses(), 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [processRecurringExpenses])
  const [pendingDelete, setPendingDelete] = useState<Wallet | null>(null)
  const [lastDeleted, setLastDeleted] = useState<{ id: string; name: string; icon: string } | null>(null)
  const [modal, setModal] = useState<
    | { type: 'addWallet' }
    | { type: 'addCurrency' }
    | { type: 'transfer' }
    | { type: 'transaction'; txType: 'income' | 'expense'; walletId: string; currency: string }
    | null
  >(null)
  const [showAddRecurring, setShowAddRecurring] = useState<boolean | RecurringExpense>(false)

  const confirmDelete = () => {
    if (!pendingDelete) return
    const snapshot = { id: pendingDelete.id, name: pendingDelete.name, icon: pendingDelete.icon }
    removeWallet(pendingDelete.id)
    setLastDeleted(snapshot)
    // If the selected wallet was the one deleted, pick another
    if (selectedWalletId === pendingDelete.id) {
      const next = wallets.find(w => w.id !== pendingDelete.id)
      setSelectedWalletId(next?.id ?? '')
    }
  }

  const undoLastDelete = () => {
    if (!lastDeleted) return
    restoreWallet(lastDeleted.id)
    setSelectedWalletId(lastDeleted.id)
    setLastDeleted(null)
  }

  // Summary totals across all wallets per currency
  const { transactions } = useWalletStore()
  const summary = currencies.map(cur => {
    const income  = transactions.filter(t => t.type === 'income'  && t.currencyCode === cur.code).reduce((s, t) => s + t.amount, 0)
    const expense = transactions.filter(t => t.type === 'expense' && t.currencyCode === cur.code).reduce((s, t) => s + t.amount, 0)
    return { cur, income, expense, balance: income - expense }
  }).filter(s => s.income > 0 || s.expense > 0)

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-none flex items-center gap-2">
            <WalletIcon className="w-5 h-5 text-emerald-400" />
            {t('wallet.title')}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">{t('wallet.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setModal({ type: 'transfer' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-400 rounded-2xl text-sm font-semibold transition-all">
            <ArrowLeftRight className="w-4 h-4" /> {t('wallet.transfer')}
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setModal({ type: 'addCurrency' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 border border-white/[0.12] hover:bg-zinc-700 text-zinc-300 rounded-2xl text-sm font-semibold transition-all">
            <Settings className="w-4 h-4" /> {t('wallet.currencies')}
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setModal({ type: 'addWallet' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 rounded-2xl text-sm font-semibold transition-all">
            <Plus className="w-4 h-4" /> {t('wallet.walletShort')}
          </motion.button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {summary.map(({ cur, income, expense, balance }) => (
            <div key={cur.code} className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4"
              style={{ borderLeftColor: cur.color, borderLeftWidth: 3 }}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ background: cur.color }} />
                <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">{cur.name}</span>
              </div>
              <p className="text-xl font-black tabular-nums" style={{ color: balance >= 0 ? cur.color : '#ef4444' }}>
                {cur.symbol} {fmt(balance)}
              </p>
              <div className="flex gap-2 mt-1.5 text-[10px] text-zinc-500 font-mono">
                <span className="text-emerald-400">↑{fmt(income)}</span>
                <span className="text-red-400">↓{fmt(expense)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wallet Grid */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Mis billeteras</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {wallets.map(w => (
            <WalletCard key={w.id} wallet={w} selected={selectedWalletId === w.id}
              onClick={() => setSelectedWalletId(w.id)}
              onRequestDelete={(wallet) => setPendingDelete(wallet)} />
          ))}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setModal({ type: 'addWallet' })}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-white/[0.12] hover:border-zinc-500 text-zinc-600 hover:text-zinc-400 transition-all min-h-[100px]">
            <Plus className="w-5 h-5" />
            <span className="text-xs font-semibold">Nueva</span>
          </motion.button>
        </div>
      </div>

      {/* Selected Wallet Detail */}
      {selectedWalletId && (
        <WalletDetail
          walletId={selectedWalletId}
          onTransaction={(txType, currency) =>
            setModal({ type: 'transaction', txType, walletId: selectedWalletId, currency })
          }
        />
      )}

      {/* Cash Flow + Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        <CashFlowTable />
        <DistributionPanel />
      </div>

      {/* Recurring expenses / subscriptions */}
      <RecurringExpensesPanel onOpenAdd={() => setShowAddRecurring(true)} />

      {/* History */}
      <TransactionHistory />

      {/* Deleted wallets trash */}
      <DeletedWalletsHistory />

      {/* Modals */}
      <AnimatePresence>
        {modal?.type === 'addWallet'   && <AddWalletModal onClose={() => setModal(null)} />}
        {modal?.type === 'addCurrency' && <AddCurrencyModal onClose={() => setModal(null)} />}
        {modal?.type === 'transfer'    && <TransferModal onClose={() => setModal(null)} />}
        {modal?.type === 'transaction' && (
          <TransactionModal
            walletId={modal.walletId} type={modal.txType} currencyCode={modal.currency}
            onClose={() => setModal(null)}
          />
        )}
        {pendingDelete && (
          <DeleteWalletModal
            wallet={pendingDelete}
            onConfirm={confirmDelete}
            onClose={() => setPendingDelete(null)}
          />
        )}
        {showAddRecurring && (
          <RecurringExpenseModal
            existing={typeof showAddRecurring === 'object' ? showAddRecurring : undefined}
            onClose={() => setShowAddRecurring(false)}
          />
        )}
      </AnimatePresence>

      {/* Undo toast (auto-dismisses after 10s) */}
      <AnimatePresence>
        {lastDeleted && (
          <UndoToast
            deletedId={lastDeleted.id}
            walletName={lastDeleted.name}
            walletIcon={lastDeleted.icon}
            onUndo={undoLastDelete}
            onDismiss={() => setLastDeleted(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
