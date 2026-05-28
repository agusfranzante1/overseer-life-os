'use client'
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet as WalletIcon, Plus, Trash2, ArrowLeftRight, TrendingUp, TrendingDown,
  X, History, ChevronDown, ChevronUp, Settings, Check,
  Undo2, RotateCcw, AlertTriangle, Archive
} from 'lucide-react'
import {
  useWalletStore, getWalletBalance, getMonthlyTotals,
  Currency, Wallet, DEFAULT_CURRENCIES
} from '@/lib/store/walletStore'

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
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
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

const INPUT = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors'
const SELECT = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors'
const BTN_PRIMARY = 'w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-bold transition-colors'

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
                className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${icon === ic ? 'ring-2 ring-indigo-500 bg-indigo-500/20' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
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
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selected.includes(cur.code) ? 'border-transparent text-white' : 'border-zinc-700 text-zinc-400 bg-zinc-800 hover:bg-zinc-700'}`}
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
          className={`w-full rounded-xl py-2.5 text-sm font-bold transition-colors text-white ${type === 'income' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}>
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
          <div className="bg-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300">
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

  // Show total USD-equivalent (rough) — just show first currency balance
  const mainCurrency = currencies.find(c => c.code === wallet.currencyCodes[0])
  const mainBalance  = getWalletBalance(wallet.id, wallet.currencyCodes[0], transactions)

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
        background: selected ? wallet.color : `${wallet.color}18`,
        borderColor: selected ? wallet.color : `${wallet.color}40`,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-2xl">{wallet.icon}</span>
        {selected && (
          <div className="w-2 h-2 rounded-full bg-white mt-1" />
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
          className={`w-full bg-transparent border-b ${selected ? 'border-white/40 text-white' : 'border-zinc-600 text-zinc-100'} text-sm font-bold focus:outline-none focus:border-white px-0 py-0`}
        />
      ) : (
        <p onClick={(e) => { e.stopPropagation(); setEditingName(true) }}
          title="Click para renombrar"
          className={`text-sm font-bold truncate cursor-text ${selected ? 'text-white' : 'text-zinc-200'} hover:opacity-80`}>
          {wallet.name}
        </p>
      )}
      <p className={`text-lg font-black tabular-nums mt-0.5 ${selected ? 'text-white' : ''}`}
        style={{ color: selected ? 'white' : mainCurrency?.color }}>
        {mainCurrency?.symbol}{fmt(mainBalance)}
        <span className="text-xs font-semibold ml-1 opacity-70">{wallet.currencyCodes[0]}</span>
      </p>
      {wallet.currencyCodes.length > 1 && (
        <p className={`text-[10px] mt-0.5 ${selected ? 'text-white/60' : 'text-zinc-500'}`}>
          +{wallet.currencyCodes.length - 1} divisa{wallet.currencyCodes.length > 2 ? 's' : ''}
        </p>
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
                className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${icon === ic ? 'ring-2 ring-indigo-500 bg-indigo-500/20' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
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
          className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5"
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
          <div key={code} className="flex items-center gap-4 px-5 py-4 border-b border-zinc-800/60 last:border-0">
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

// ─── Cash Flow Table ───────────────────────────────────────────────────────────
function CashFlowTable() {
  const { transactions, currencies } = useWalletStore()
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const year = new Date().getFullYear()
  const currentMonth = new Date().getMonth() // 0-indexed

  const monthlyData = useMemo(
    () => getMonthlyTotals(selectedCurrency, year, transactions),
    [transactions, selectedCurrency, year]
  )
  const cur = currencies.find(c => c.code === selectedCurrency)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Flujo de Caja {year}</p>
        <select value={selectedCurrency} onChange={e => setSelectedCurrency(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300 focus:outline-none">
          {currencies.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-2.5 text-zinc-500 font-semibold w-24 uppercase tracking-wider">Concepto</th>
              {MONTHS.map((m, i) => (
                <th key={m} className={`px-3 py-2.5 text-center font-semibold uppercase tracking-wider ${i === currentMonth ? 'text-indigo-400' : 'text-zinc-500'}`}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Ingresos', key: 'income' as const, color: '#10b981' },
              { label: 'Egresos',  key: 'expense' as const, color: '#ef4444' },
            ].map(({ label, key, color }) => (
              <tr key={key} className="border-b border-zinc-800/50">
                <td className="px-4 py-2.5 font-semibold" style={{ color }}>{label}</td>
                {monthlyData.map((m, i) => (
                  <td key={i} className={`px-3 py-2.5 text-center tabular-nums font-mono ${i === currentMonth ? 'bg-indigo-500/5' : ''}`}
                    style={{ color: m[key] > 0 ? color : '#52525b' }}>
                    {m[key] > 0 ? fmt(m[key]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-zinc-800/30">
              <td className="px-4 py-2.5 font-bold text-zinc-300">Balance</td>
              {monthlyData.map((m, i) => {
                const bal = m.income - m.expense
                return (
                  <td key={i} className={`px-3 py-2.5 text-center tabular-nums font-bold font-mono ${i === currentMonth ? 'bg-indigo-500/5' : ''}`}
                    style={{ color: bal > 0 ? '#10b981' : bal < 0 ? '#ef4444' : '#52525b' }}>
                    {bal !== 0 ? fmt(bal) : '—'}
                  </td>
                )
              })}
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Distribución de Porcentajes</p>
        <select value={currency} onChange={e => setCurrency(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300 focus:outline-none">
          {currencies.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
        </select>
      </div>

      {monthlyIncome > 0 && (
        <div className="px-5 py-2.5 bg-zinc-800/40 border-b border-zinc-800 text-xs text-zinc-400">
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-zinc-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Historial de Registros</p>
        </div>
        <div className="flex gap-2 ml-auto">
          <select value={filterWallet} onChange={e => setFilterWallet(e.target.value)}
            className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-300 focus:outline-none">
            <option value="all">Todas las billeteras</option>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-300 focus:outline-none">
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
              className="w-full py-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors border-t border-zinc-800">
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
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
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
            className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-semibold transition-colors">
            Cancelar
          </button>
          <button onClick={() => { onConfirm(); onClose() }}
            className="flex-1 px-4 py-2.5 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 text-red-400 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
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
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl shadow-black/50 backdrop-blur"
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
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-400 text-sm font-bold transition-all group"
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
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
            <div className="px-5 pb-5 space-y-2 border-t border-zinc-800/60 pt-4">
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
                    className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition-all"
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
  const { wallets, currencies, removeWallet, restoreWallet } = useWalletStore()
  const [selectedWalletId, setSelectedWalletId] = useState(wallets[0]?.id ?? '')
  const [pendingDelete, setPendingDelete] = useState<Wallet | null>(null)
  const [lastDeleted, setLastDeleted] = useState<{ id: string; name: string; icon: string } | null>(null)
  const [modal, setModal] = useState<
    | { type: 'addWallet' }
    | { type: 'addCurrency' }
    | { type: 'transfer' }
    | { type: 'transaction'; txType: 'income' | 'expense'; walletId: string; currency: string }
    | null
  >(null)

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
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <WalletIcon className="w-5 h-5 text-emerald-400" />
            Gestión Financiera
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">Billeteras, divisas y flujo de caja</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setModal({ type: 'transfer' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-sm font-semibold transition-all">
            <ArrowLeftRight className="w-4 h-4" /> Transferir
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setModal({ type: 'addCurrency' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-semibold transition-all">
            <Settings className="w-4 h-4" /> Divisas
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setModal({ type: 'addWallet' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-sm font-semibold transition-all">
            <Plus className="w-4 h-4" /> Billetera
          </motion.button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {summary.map(({ cur, income, expense, balance }) => (
            <div key={cur.code} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
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
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-600 hover:text-zinc-400 transition-all min-h-[100px]">
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
