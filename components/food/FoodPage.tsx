'use client'
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Utensils, ShoppingCart, Wallet, Plus, Trash2, ExternalLink, Settings,
  StickyNote, ChevronDown, ChevronRight,
} from 'lucide-react'
import {
  useFoodStore, sumMealMacros, sumStageMacros, categoryTotal,
  type Meal, type MealItem, type ShoppingCategory, type ShoppingItem,
  type FixedCost, type Stage,
} from '@/lib/store/foodStore'
import { useTranslation } from '@/hooks/useTranslation'

type Tab = 'compras' | 'gastos' | 'dieta'

function fmtMoney(n: number, ars = true): string {
  if (!Number.isFinite(n)) return '—'
  const opt: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  return ars ? `$${n.toLocaleString('es-AR', opt)}` : n.toLocaleString('es-AR', opt)
}

function fmtNum(n: number): string {
  return Math.round(n * 100) / 100 + ''
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function FoodPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('compras')

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Utensils className="w-5 h-5 text-emerald-400" />
            {t('food.title')}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">{t('food.subtitle')}</p>
        </div>
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          {(['compras','gastos','dieta'] as Tab[]).map((tabId) => {
            const Icon = tabId === 'dieta' ? Utensils : tabId === 'compras' ? ShoppingCart : Wallet
            return (
              <button key={tabId} onClick={() => setTab(tabId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  tab === tabId ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
                }`}>
                <Icon className="w-3.5 h-3.5" /> {t(`food.tabs.${tabId}`)}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'dieta' && <DietaTab />}
      {tab === 'compras' && <ComprasTab />}
      {tab === 'gastos' && <GastosTab />}
    </motion.div>
  )
}

// ─── DIETA TAB ────────────────────────────────────────────────────────────────

function DietaTab() {
  const { stages, currentStageId, setCurrentStage } = useFoodStore()
  const stage = stages.find((s) => s.id === currentStageId) ?? stages[0]
  const [showTargetsEditor, setShowTargetsEditor] = useState(false)

  if (!stage) return <p className="text-sm text-zinc-500">No hay etapas configuradas.</p>

  return (
    <div className="space-y-6">
      {/* Notas / memo libre para la dieta */}
      <DietNotesCard />

      {/* Stage tabs */}
      <div className="flex flex-wrap gap-2">
        {stages.map((s) => (
          <button key={s.id} onClick={() => setCurrentStage(s.id)}
            className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${
              s.id === currentStageId
                ? 'border-transparent text-white'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
            style={s.id === currentStageId ? { background: s.color + '25', borderColor: s.color, color: s.color } : {}}>
            {s.name}
          </button>
        ))}
        <button onClick={() => setShowTargetsEditor((v) => !v)}
          className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white text-xs font-semibold flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" /> Objetivos
        </button>
      </div>

      {/* Targets editor */}
      <AnimatePresence>
        {showTargetsEditor && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4">
            <TargetsEditor stage={stage} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Meals */}
      <StageMealsTable stage={stage} />
    </div>
  )
}

function DietNotesCard() {
  const notes = useFoodStore((s) => s.notes)
  const setNotes = useFoodStore((s) => s.setNotes)
  const [open, setOpen] = useState<boolean>(() => (notes?.trim().length ?? 0) > 0)

  const hasContent = (notes?.trim().length ?? 0) > 0

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-zinc-200">Notas</span>
          {hasContent && !open && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/70 ml-1">
              · contiene apuntes
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <textarea
                value={notes ?? ''}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Apuntes de tu dieta: recordatorios, sustituciones, suplementación, lo que sea…"
                rows={5}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 resize-y"
              />
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mt-1.5">
                Se guarda automáticamente
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TargetsEditor({ stage }: { stage: Stage }) {
  const { updateStage } = useFoodStore()
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">
        Objetivos de macros — {stage.name}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <NumberField label="Calorías"  value={stage.caloriesTarget} onChange={(v) => updateStage(stage.id, { caloriesTarget: v })} />
        <NumberField label="Proteína"  value={stage.proteinTarget}  onChange={(v) => updateStage(stage.id, { proteinTarget: v })} />
        <NumberField label="Carbs"     value={stage.carbsTarget}    onChange={(v) => updateStage(stage.id, { carbsTarget: v })} />
        <NumberField label="Grasas"    value={stage.fatsTarget}     onChange={(v) => updateStage(stage.id, { fatsTarget: v })} />
      </div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">
        Objetivo día carga (opcional)
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumberField label="Cal"     value={stage.carbDayCalories ?? 0} onChange={(v) => updateStage(stage.id, { carbDayCalories: v })} />
        <NumberField label="Prot"    value={stage.carbDayProtein ?? 0}  onChange={(v) => updateStage(stage.id, { carbDayProtein: v })} />
        <NumberField label="Carbs"   value={stage.carbDayCarbs ?? 0}    onChange={(v) => updateStage(stage.id, { carbDayCarbs: v })} />
        <NumberField label="Grasas"  value={stage.carbDayFats ?? 0}     onChange={(v) => updateStage(stage.id, { carbDayFats: v })} />
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</label>
      <input type="number" value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500" />
    </div>
  )
}

function StageMealsTable({ stage }: { stage: Stage }) {
  const { addItem, updateItem, removeItem, addMealToStage, updateMeal, removeMeal } = useFoodStore()
  const totals = sumStageMacros(stage)

  // Deltas vs target
  const dCal  = totals.calories - stage.caloriesTarget
  const dProt = totals.protein  - stage.proteinTarget
  const dCarb = totals.carbs    - stage.carbsTarget
  const dFat  = totals.fats     - stage.fatsTarget

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between" style={{ background: stage.color + '10' }}>
        <h2 className="text-sm font-bold" style={{ color: stage.color }}>{stage.name.toUpperCase()}</h2>
        <button onClick={() => addMealToStage(stage.id)}
          className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Comida
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950/60">
            <tr className="text-left text-[10px] uppercase text-zinc-500 font-mono tracking-wider">
              <th className="px-2 py-2 font-semibold w-20">Cant.</th>
              <th className="px-2 py-2 font-semibold">Alimento</th>
              <th className="px-2 py-2 font-semibold text-right">Cal</th>
              <th className="px-2 py-2 font-semibold text-right">Prot</th>
              <th className="px-2 py-2 font-semibold text-right">Carb</th>
              <th className="px-2 py-2 font-semibold text-right">Grasa</th>
              <th className="px-1 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {stage.meals.map((meal) => (
              <MealBlock key={meal.id} stage={stage} meal={meal}
                onUpdate={(p) => updateMeal(stage.id, meal.id, p)}
                onDelete={() => removeMeal(stage.id, meal.id)}
                onAddItem={() => addItem(stage.id, meal.id)}
                onUpdateItem={(itemId, p) => updateItem(stage.id, meal.id, itemId, p)}
                onRemoveItem={(itemId) => removeItem(stage.id, meal.id, itemId)}
              />
            ))}
          </tbody>
          {/* Totals row */}
          <tfoot>
            <tr className="bg-zinc-950 border-t-2 border-zinc-700 font-bold">
              <td className="px-2 py-3 text-zinc-300 text-xs uppercase tracking-wider" colSpan={2}>Totales (sin extras)</td>
              <td className="px-2 py-3 text-right tabular-nums" style={{ color: stage.color }}>{fmtNum(totals.calories)}</td>
              <td className="px-2 py-3 text-right tabular-nums" style={{ color: stage.color }}>{fmtNum(totals.protein)}</td>
              <td className="px-2 py-3 text-right tabular-nums" style={{ color: stage.color }}>{fmtNum(totals.carbs)}</td>
              <td className="px-2 py-3 text-right tabular-nums" style={{ color: stage.color }}>{fmtNum(totals.fats)}</td>
              <td></td>
            </tr>
            <tr className="bg-zinc-950/60">
              <td className="px-2 py-2 text-zinc-400 text-[10px] uppercase tracking-wider font-mono" colSpan={2}>Objetivo</td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-300">{fmtNum(stage.caloriesTarget)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-300">{fmtNum(stage.proteinTarget)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-300">{fmtNum(stage.carbsTarget)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-300">{fmtNum(stage.fatsTarget)}</td>
              <td></td>
            </tr>
            <tr>
              <td className="px-2 py-2 text-zinc-400 text-[10px] uppercase tracking-wider font-mono" colSpan={2}>Δ vs objetivo</td>
              <DeltaCell value={dCal} />
              <DeltaCell value={dProt} />
              <DeltaCell value={dCarb} />
              <DeltaCell value={dFat} />
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function DeltaCell({ value }: { value: number }) {
  const color = Math.abs(value) < 0.5 ? '#71717a' : value > 0 ? '#f97316' : '#3b82f6'
  const sign = value > 0 ? '+' : ''
  return (
    <td className="px-2 py-2 text-right tabular-nums font-mono text-xs" style={{ color }}>
      {sign}{fmtNum(value)}
    </td>
  )
}

interface MealBlockProps {
  stage: Stage
  meal: Meal
  onUpdate: (p: Partial<Meal>) => void
  onDelete: () => void
  onAddItem: () => void
  onUpdateItem: (id: string, p: Partial<MealItem>) => void
  onRemoveItem: (id: string) => void
}
function MealBlock({ stage, meal, onUpdate, onDelete, onAddItem, onUpdateItem, onRemoveItem }: MealBlockProps) {
  const totals = sumMealMacros(meal)
  return (
    <>
      {/* Meal header */}
      <tr className="bg-zinc-800/50 border-y border-zinc-800/80 group">
        <td colSpan={7} className="px-2 py-2">
          <div className="flex items-center gap-2">
            <input value={meal.name} onChange={(e) => onUpdate({ name: e.target.value })}
              className="bg-transparent text-xs font-bold uppercase tracking-wider text-zinc-300 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5 flex-1 min-w-0" />
            <input value={meal.timeLabel} onChange={(e) => onUpdate({ timeLabel: e.target.value })}
              placeholder="hora"
              className="bg-transparent text-[10px] font-mono text-zinc-500 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5 w-24" />
            <button onClick={onAddItem} title="Agregar alimento"
              className="text-zinc-500 hover:text-emerald-400 transition-colors opacity-50 hover:opacity-100">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} title="Eliminar comida"
              className="text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </td>
      </tr>

      {/* Items */}
      {meal.items.map((it) => (
        <tr key={it.id} className="group hover:bg-zinc-800/30 border-b border-zinc-900">
          <td className="px-1 py-1">
            <input value={it.qty} onChange={(e) => onUpdateItem(it.id, { qty: e.target.value })}
              className="w-full bg-transparent text-xs text-zinc-400 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
          </td>
          <td className="px-1 py-1">
            <input value={it.name} onChange={(e) => onUpdateItem(it.id, { name: e.target.value })}
              className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
          </td>
          {(['calories','protein','carbs','fats'] as const).map((k) => (
            <td key={k} className="px-1 py-1">
              <input type="number" step="any" value={it[k]}
                onChange={(e) => onUpdateItem(it.id, { [k]: parseFloat(e.target.value) || 0 })}
                className="w-full bg-transparent text-xs text-zinc-300 tabular-nums text-right focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
            </td>
          ))}
          <td className="px-1 py-1 text-right">
            <button onClick={() => onRemoveItem(it.id)}
              className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
              <Trash2 className="w-3 h-3" />
            </button>
          </td>
        </tr>
      ))}

      {/* Add-item row — always visible */}
      <tr className="border-b border-zinc-800/60 bg-zinc-950/30">
        <td colSpan={7} className="px-2 py-1.5">
          <button onClick={onAddItem}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-semibold text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 border border-dashed border-zinc-800 hover:border-emerald-500/40 transition-all">
            <Plus className="w-3 h-3" /> Agregar alimento a <span className="text-zinc-400 group-hover:text-emerald-300">{meal.name || 'esta comida'}</span>
          </button>
        </td>
      </tr>

      {/* Meal subtotal */}
      <tr className="border-b border-zinc-800 bg-zinc-900/40">
        <td colSpan={2} className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-600 text-right">subtotal</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-xs font-bold" style={{ color: stage.color }}>{fmtNum(totals.calories)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-xs font-bold" style={{ color: stage.color }}>{fmtNum(totals.protein)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-xs font-bold" style={{ color: stage.color }}>{fmtNum(totals.carbs)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-xs font-bold" style={{ color: stage.color }}>{fmtNum(totals.fats)}</td>
        <td></td>
      </tr>
    </>
  )
}

// ─── COMPRAS TAB ──────────────────────────────────────────────────────────────

function ComprasTab() {
  const { shopping, addShoppingCategory } = useFoodStore()
  const [newCat, setNewCat] = useState('')

  const grandTotal = useMemo(() =>
    shopping.reduce((acc, c) => acc + categoryTotal(c), 0),
    [shopping]
  )

  return (
    <div className="space-y-4">
      {/* Grand total */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Compras mensuales totales</p>
          <p className="text-2xl font-extrabold text-emerald-400 tabular-nums">{fmtMoney(grandTotal)}</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (newCat.trim()) { addShoppingCategory(newCat.trim()); setNewCat('') } }}
          className="flex items-center gap-2">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)}
            placeholder="Nueva categoría"
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500" />
          <button type="submit"
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-400 font-semibold flex items-center gap-1">
            <Plus className="w-3 h-3" /> Categoría
          </button>
        </form>
      </div>

      {shopping.map((cat) => <ShoppingCategoryTable key={cat.id} category={cat} />)}
    </div>
  )
}

function ShoppingCategoryTable({ category }: { category: ShoppingCategory }) {
  const { addShoppingItem, updateShoppingItem, removeShoppingItem, removeShoppingCategory } = useFoodStore()
  const total = categoryTotal(category)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/40">
        <h3 className="text-sm font-bold text-zinc-200">{category.name}</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-emerald-400 tabular-nums">{fmtMoney(total)}</span>
          <button onClick={() => addShoppingItem(category.id)}
            className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Item
          </button>
          <button onClick={() => { if (confirm(`¿Eliminar la categoría "${category.name}"?`)) removeShoppingCategory(category.id) }}
            className="text-zinc-600 hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950/40">
            <tr className="text-left text-[10px] uppercase text-zinc-500 font-mono tracking-wider">
              <th className="px-3 py-2 w-8"></th>
              <th className="px-2 py-2 font-semibold">Alimento</th>
              <th className="px-2 py-2 font-semibold text-right w-16">Cant.</th>
              <th className="px-2 py-2 font-semibold text-right w-32">Precio Un.</th>
              <th className="px-2 py-2 font-semibold text-right w-32">Total</th>
              <th className="px-2 py-2 font-semibold w-32">Comercio</th>
              <th className="px-2 py-2 font-semibold w-12">URL</th>
              <th className="px-1 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {category.items.map((it) => (
              <ShoppingItemRow key={it.id} item={it}
                onUpdate={(p) => updateShoppingItem(category.id, it.id, p)}
                onRemove={() => removeShoppingItem(category.id, it.id)} />
            ))}
            {category.items.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-4 text-center text-xs text-zinc-600">Sin items. Tocá &quot;+ Item&quot; para agregar.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ShoppingItemRow({ item, onUpdate, onRemove }: { item: ShoppingItem; onUpdate: (p: Partial<ShoppingItem>) => void; onRemove: () => void }) {
  const total = item.qty * item.unitPrice
  return (
    <tr className="border-b border-zinc-900 hover:bg-zinc-800/20 group">
      <td className="px-3 py-1">
        <input type="checkbox" checked={item.bought} onChange={(e) => onUpdate({ bought: e.target.checked })}
          className="accent-emerald-500 cursor-pointer" />
      </td>
      <td className="px-2 py-1">
        <input value={item.name} onChange={(e) => onUpdate({ name: e.target.value })}
          className={`w-full bg-transparent text-xs focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5 ${
            item.bought ? 'text-zinc-500 line-through' : 'text-zinc-200'
          }`} />
      </td>
      <td className="px-2 py-1">
        <input type="number" step="any" value={item.qty}
          onChange={(e) => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
          className="w-full bg-transparent text-xs text-zinc-300 tabular-nums text-right focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
      </td>
      <td className="px-2 py-1">
        <input type="number" step="any" value={item.unitPrice}
          onChange={(e) => onUpdate({ unitPrice: parseFloat(e.target.value) || 0 })}
          className="w-full bg-transparent text-xs text-zinc-300 tabular-nums text-right focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-xs font-bold text-emerald-400">
        {fmtMoney(total)}
      </td>
      <td className="px-2 py-1">
        <input value={item.supplier ?? ''} onChange={(e) => onUpdate({ supplier: e.target.value || undefined })}
          placeholder="—"
          className="w-full bg-transparent text-xs text-zinc-400 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
      </td>
      <td className="px-2 py-1">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer"
            className="text-indigo-400 hover:text-indigo-300 inline-flex items-center">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <input type="url" value={item.url ?? ''} onChange={(e) => onUpdate({ url: e.target.value || undefined })}
            placeholder="https://"
            className="w-full bg-transparent text-[10px] text-zinc-600 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
        )}
      </td>
      <td className="px-1 py-1 text-right">
        <button onClick={onRemove}
          className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3 h-3" />
        </button>
      </td>
    </tr>
  )
}

// ─── GASTOS TAB ───────────────────────────────────────────────────────────────

function GastosTab() {
  const { shopping, fixedCosts, addFixedCost, updateFixedCost, removeFixedCost } = useFoodStore()

  const totalComida = useMemo(
    () => shopping.reduce((a, c) => a + categoryTotal(c), 0),
    [shopping]
  )
  const totalAlquiler = fixedCosts.filter((f) => f.group === 'alquiler').reduce((a, f) => a + f.amount, 0)
  const totalExtras   = fixedCosts.filter((f) => f.group === 'extras').reduce((a, f) => a + f.amount, 0)
  const grandTotal = totalComida + totalAlquiler + totalExtras

  return (
    <div className="space-y-4">
      {/* Big total */}
      <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/20 rounded-2xl p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-300/80">Final x Mes</p>
        <p className="text-4xl font-black text-white tabular-nums mt-1">{fmtMoney(grandTotal)}</p>
        <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
          <div className="bg-zinc-950/40 rounded-lg p-2">
            <p className="text-[10px] text-zinc-500 uppercase">Comida</p>
            <p className="text-emerald-400 font-bold tabular-nums">{fmtMoney(totalComida)}</p>
          </div>
          <div className="bg-zinc-950/40 rounded-lg p-2">
            <p className="text-[10px] text-zinc-500 uppercase">Alquiler</p>
            <p className="text-indigo-400 font-bold tabular-nums">{fmtMoney(totalAlquiler)}</p>
          </div>
          <div className="bg-zinc-950/40 rounded-lg p-2">
            <p className="text-[10px] text-zinc-500 uppercase">Extras</p>
            <p className="text-pink-400 font-bold tabular-nums">{fmtMoney(totalExtras)}</p>
          </div>
        </div>
      </div>

      <FixedCostGroup title="Alquiler" group="alquiler" total={totalAlquiler}
        items={fixedCosts.filter((f) => f.group === 'alquiler')}
        onAdd={(label) => addFixedCost('alquiler', label)}
        onUpdate={updateFixedCost} onRemove={removeFixedCost} />

      <FixedCostGroup title="Extras" group="extras" total={totalExtras}
        items={fixedCosts.filter((f) => f.group === 'extras')}
        onAdd={(label) => addFixedCost('extras', label)}
        onUpdate={updateFixedCost} onRemove={removeFixedCost} />

      {/* Comida breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/40">
          <h3 className="text-sm font-bold text-zinc-200">Comida — desglose por categoría</h3>
          <span className="text-sm font-bold text-emerald-400 tabular-nums">{fmtMoney(totalComida)}</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {shopping.map((c) => (
              <tr key={c.id} className="border-b border-zinc-900">
                <td className="px-4 py-2.5 text-zinc-300">{c.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400 font-semibold">{fmtMoney(categoryTotal(c))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface FixedCostGroupProps {
  title: string
  group: 'alquiler' | 'extras'
  total: number
  items: FixedCost[]
  onAdd: (label: string) => void
  onUpdate: (id: string, p: Partial<FixedCost>) => void
  onRemove: (id: string) => void
}
function FixedCostGroup({ title, total, items, onAdd, onUpdate, onRemove }: FixedCostGroupProps) {
  const [newLabel, setNewLabel] = useState('')
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/40">
        <h3 className="text-sm font-bold text-zinc-200">{title}</h3>
        <span className="text-sm font-bold text-indigo-400 tabular-nums">{fmtMoney(total)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-zinc-900 group hover:bg-zinc-800/20">
              <td className="px-4 py-1.5">
                <input value={it.label} onChange={(e) => onUpdate(it.id, { label: e.target.value })}
                  className="w-full bg-transparent text-sm text-zinc-300 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
              </td>
              <td className="px-4 py-1.5 w-40">
                <input type="number" step="any" value={it.amount}
                  onChange={(e) => onUpdate(it.id, { amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-transparent text-sm text-zinc-300 tabular-nums text-right focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
              </td>
              <td className="px-2 py-1.5 w-8 text-right">
                <button onClick={() => onRemove(it.id)}
                  className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-3 h-3" />
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td className="px-4 py-2" colSpan={3}>
              <form onSubmit={(e) => { e.preventDefault(); if (newLabel.trim()) { onAdd(newLabel.trim()); setNewLabel('') } }}
                className="flex items-center gap-2">
                <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={`Nuevo en ${title.toLowerCase()}…`}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500" />
                <button type="submit" className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Agregar
                </button>
              </form>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
