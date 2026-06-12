'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Utensils, ShoppingCart, Wallet, Plus, Trash2, ExternalLink, Settings,
  StickyNote, ChevronDown, ChevronRight, BookOpen, Link2, Link2Off, Search,
} from 'lucide-react'
import {
  useFoodStore, sumMealMacros, sumStageMacros, categoryTotal,
  computeMacrosFromFood, parseLegacyQty,
  type Meal, type MealItem, type ShoppingCategory, type ShoppingItem,
  type FixedCost, type Stage, type FoodEntry, type FoodUnit,
} from '@/lib/store/foodStore'
import { useTranslation } from '@/hooks/useTranslation'

type Tab = 'compras' | 'gastos' | 'dieta' | 'alimentos'

const UNIT_LABEL: Record<FoodUnit, string> = { gr: 'gr', u: 'u', ml: 'ml' }
const UNIT_REF_LABEL: Record<FoodUnit, string> = { gr: 'por 100 gr', u: 'por 1 u', ml: 'por 100 ml' }

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
          {(['compras','gastos','dieta','alimentos'] as Tab[]).map((tabId) => {
            const Icon =
              tabId === 'dieta' ? Utensils :
              tabId === 'compras' ? ShoppingCart :
              tabId === 'alimentos' ? BookOpen :
              Wallet
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
      {tab === 'alimentos' && <AlimentosTab />}
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
  const setItemQuantity = useFoodStore((s) => s.setItemQuantity)
  const linkItemToFood = useFoodStore((s) => s.linkItemToFood)
  const addItemFromFood = useFoodStore((s) => s.addItemFromFood)
  const foods = useFoodStore((s) => s.foods)

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
            <button onClick={onAddItem} title="Agregar item libre"
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
        <MealItemRow key={it.id} item={it} foods={foods}
          onUpdateItem={(p) => onUpdateItem(it.id, p)}
          onRemove={() => onRemoveItem(it.id)}
          onChangeQty={(v) => setItemQuantity(stage.id, meal.id, it.id, v)}
          onLink={(fid) => linkItemToFood(stage.id, meal.id, it.id, fid)}
        />
      ))}

      {/* Add-from-library row */}
      <tr className="border-b border-zinc-800/60 bg-zinc-950/30">
        <td colSpan={7} className="px-2 py-1.5">
          <AddFromLibrary
            foods={foods}
            onPick={(foodId, qtyValue) => addItemFromFood(stage.id, meal.id, foodId, qtyValue)}
            onAddFree={onAddItem}
            mealName={meal.name}
          />
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

// ─── Meal Item Row ────────────────────────────────────────────────────────────

interface MealItemRowProps {
  item: MealItem
  foods: FoodEntry[]
  onUpdateItem: (p: Partial<MealItem>) => void
  onRemove: () => void
  onChangeQty: (qtyValue: number) => void
  onLink: (foodId: string | null) => void
}
function MealItemRow({ item, foods, onUpdateItem, onRemove, onChangeQty, onLink }: MealItemRowProps) {
  const linked = !!item.foodId
  const linkedFood = linked ? foods.find((f) => f.id === item.foodId) : undefined

  // Derivar qty efectiva: si tiene qtyValue lo uso, sino parseo el qty string legacy
  const effective = useMemo(() => {
    if (typeof item.qtyValue === 'number') {
      return { value: item.qtyValue, unit: (item.qtyUnit ?? 'gr') as FoodUnit }
    }
    const parsed = parseLegacyQty(item.qty)
    if (parsed) return { value: parsed.qtyValue, unit: parsed.qtyUnit }
    return { value: 0, unit: 'gr' as FoodUnit }
  }, [item.qty, item.qtyValue, item.qtyUnit])

  return (
    <tr className="group hover:bg-zinc-800/30 border-b border-zinc-900">
      {/* Cantidad: número + unidad */}
      <td className="px-1 py-1">
        <div className="flex items-center gap-0.5">
          <input
            type="number" step="any" min={0}
            value={effective.value || ''}
            onChange={(e) => onChangeQty(parseFloat(e.target.value) || 0)}
            className="w-12 bg-transparent text-xs text-zinc-300 tabular-nums text-right focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5"
          />
          <select
            value={effective.unit}
            disabled={linked}
            onChange={(e) => {
              const unit = e.target.value as FoodUnit
              onUpdateItem({ qtyValue: effective.value, qtyUnit: unit, qty: `${effective.value}${unit}` })
            }}
            className="bg-transparent text-[10px] font-mono text-zinc-500 focus:outline-none focus:bg-zinc-800 rounded px-0.5 disabled:opacity-60"
          >
            <option value="gr" className="bg-zinc-900">gr</option>
            <option value="u" className="bg-zinc-900">u</option>
            <option value="ml" className="bg-zinc-900">ml</option>
          </select>
        </div>
      </td>

      {/* Nombre / link */}
      <td className="px-1 py-1">
        <div className="flex items-center gap-1">
          {linked ? (
            <button
              onClick={() => onLink(null)}
              title={`Linkeado a ${linkedFood?.name ?? 'alimento'} — clic para desvincular`}
              className="text-emerald-400 hover:text-amber-400 transition-colors flex-shrink-0"
            >
              <Link2 className="w-3 h-3" />
            </button>
          ) : (
            <Link2Off className="w-3 h-3 text-zinc-700 flex-shrink-0" />
          )}
          <input
            value={item.name}
            onChange={(e) => onUpdateItem({ name: e.target.value })}
            disabled={linked}
            className={`w-full bg-transparent text-xs focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5 ${
              linked ? 'text-emerald-300' : 'text-zinc-200'
            }`}
          />
        </div>
      </td>

      {/* Macros: editables solo si NO está linkeado */}
      {(['calories','protein','carbs','fats'] as const).map((k) => (
        <td key={k} className="px-1 py-1">
          <input
            type="number" step="any"
            value={item[k]}
            disabled={linked}
            onChange={(e) => onUpdateItem({ [k]: parseFloat(e.target.value) || 0 })}
            className={`w-full bg-transparent text-xs tabular-nums text-right focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5 ${
              linked ? 'text-emerald-300/80' : 'text-zinc-300'
            }`}
          />
        </td>
      ))}

      <td className="px-1 py-1 text-right">
        <button onClick={onRemove}
          className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3 h-3" />
        </button>
      </td>
    </tr>
  )
}

// ─── Add From Library ─────────────────────────────────────────────────────────

interface AddFromLibraryProps {
  foods: FoodEntry[]
  onPick: (foodId: string, qtyValue: number) => void
  onAddFree: () => void
  mealName: string
}
function AddFromLibrary({ foods, onPick, onAddFree, mealName }: AddFromLibraryProps) {
  const [query, setQuery] = useState('')
  const [qty, setQty] = useState<number | ''>('')
  const [showList, setShowList] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return foods.slice(0, 8)
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8)
  }, [foods, query])

  const exact = useMemo(
    () => foods.find((f) => f.name.toLowerCase() === query.trim().toLowerCase()),
    [foods, query]
  )

  const defaultQty = exact ? (exact.unit === 'u' ? 1 : 100) : 100
  const effectiveQty = qty === '' ? defaultQty : qty

  function commit(food?: FoodEntry) {
    const f = food ?? exact
    if (!f) return
    onPick(f.id, effectiveQty)
    setQuery('')
    setQty('')
    setShowList(false)
    inputRef.current?.focus()
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowList(true) }}
          onFocus={() => setShowList(true)}
          onBlur={() => setTimeout(() => setShowList(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setShowList(false) }
          }}
          placeholder={`Buscar alimento para ${mealName || 'esta comida'}…`}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-7 pr-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60"
        />

        <AnimatePresence>
          {showList && matches.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-20 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto"
            >
              {matches.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); commit(f) }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs hover:bg-emerald-500/10 hover:text-emerald-300 text-zinc-300"
                >
                  <span className="truncate">{f.name}</span>
                  <span className="text-[10px] font-mono text-zinc-500 ml-2 flex-shrink-0">
                    {f.calories}cal · {UNIT_REF_LABEL[f.unit]}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Qty */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-md px-1.5 py-1">
        <input
          type="number" step="any" min={0}
          value={qty}
          onChange={(e) => setQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
          placeholder={defaultQty.toString()}
          className="w-14 bg-transparent text-xs text-zinc-200 tabular-nums text-right focus:outline-none"
        />
        <span className="text-[10px] font-mono text-zinc-500">
          {exact ? UNIT_LABEL[exact.unit] : 'gr'}
        </span>
      </div>

      <button
        onClick={() => commit()}
        disabled={!exact}
        className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-400 font-semibold flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Plus className="w-3 h-3" /> Agregar
      </button>

      <button
        onClick={onAddFree}
        title="Agregar item libre (sin biblioteca)"
        className="text-xs px-2 py-1.5 rounded-md text-zinc-500 hover:text-zinc-200 border border-dashed border-zinc-800 hover:border-zinc-600"
      >
        item libre
      </button>
    </div>
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

// ─── ALIMENTOS TAB ────────────────────────────────────────────────────────────

function AlimentosTab() {
  const foods = useFoodStore((s) => s.foods)
  const addFood = useFoodStore((s) => s.addFood)
  const updateFood = useFoodStore((s) => s.updateFood)
  const removeFood = useFoodStore((s) => s.removeFood)

  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const categories = useMemo(() => {
    const set = new Set<string>()
    foods.forEach((f) => { if (f.category) set.add(f.category) })
    return Array.from(set).sort()
  }, [foods])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return foods.filter((f) => {
      if (categoryFilter && f.category !== categoryFilter) return false
      if (q && !f.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [foods, query, categoryFilter])

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Biblioteca de alimentos</p>
            <p className="text-lg font-bold text-white">{foods.length} <span className="text-xs font-normal text-zinc-500">alimentos cargados</span></p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Macros por 100 gr/ml o por 1 unidad. Se usan para autocompletar la dieta.</p>
          </div>
          <button
            onClick={() => addFood({ name: 'Nuevo alimento' })}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-400 font-semibold flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Alimento
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-7 pr-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setCategoryFilter('')}
                className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md ${
                  !categoryFilter ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-zinc-500 hover:text-zinc-200 border border-zinc-800'
                }`}
              >Todos</button>
              {categories.map((c) => (
                <button key={c}
                  onClick={() => setCategoryFilter(c === categoryFilter ? '' : c)}
                  className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md ${
                    categoryFilter === c ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-zinc-500 hover:text-zinc-200 border border-zinc-800'
                  }`}
                >{c}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950/60">
              <tr className="text-left text-[10px] uppercase text-zinc-500 font-mono tracking-wider">
                <th className="px-3 py-2 font-semibold">Alimento</th>
                <th className="px-2 py-2 font-semibold w-24">Categoría</th>
                <th className="px-2 py-2 font-semibold w-28">Referencia</th>
                <th className="px-2 py-2 font-semibold text-right w-16">Cal</th>
                <th className="px-2 py-2 font-semibold text-right w-16">Prot</th>
                <th className="px-2 py-2 font-semibold text-right w-16">Carb</th>
                <th className="px-2 py-2 font-semibold text-right w-16">Grasa</th>
                <th className="px-1 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-zinc-600">
                  {query || categoryFilter ? 'Sin resultados.' : 'No hay alimentos. Agregá uno.'}
                </td></tr>
              )}
              {filtered.map((f) => (
                <FoodRow key={f.id} food={f}
                  onUpdate={(p) => updateFood(f.id, p)}
                  onRemove={() => {
                    if (confirm(`¿Eliminar "${f.name}" de la biblioteca?`)) removeFood(f.id)
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function FoodRow({ food, onUpdate, onRemove }: { food: FoodEntry; onUpdate: (p: Partial<FoodEntry>) => void; onRemove: () => void }) {
  return (
    <tr className="border-b border-zinc-900 hover:bg-zinc-800/20 group">
      <td className="px-3 py-1">
        <input value={food.name} onChange={(e) => onUpdate({ name: e.target.value })}
          className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
      </td>
      <td className="px-2 py-1">
        <input value={food.category ?? ''} onChange={(e) => onUpdate({ category: e.target.value || undefined })}
          placeholder="—"
          className="w-full bg-transparent text-[11px] text-zinc-400 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
      </td>
      <td className="px-2 py-1">
        <select value={food.unit} onChange={(e) => onUpdate({ unit: e.target.value as FoodUnit })}
          className="w-full bg-transparent text-[11px] font-mono text-zinc-400 focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5">
          <option value="gr" className="bg-zinc-900">por 100 gr</option>
          <option value="u"  className="bg-zinc-900">por 1 u</option>
          <option value="ml" className="bg-zinc-900">por 100 ml</option>
        </select>
      </td>
      {(['calories','protein','carbs','fats'] as const).map((k) => (
        <td key={k} className="px-1 py-1">
          <input type="number" step="any" value={food[k]}
            onChange={(e) => onUpdate({ [k]: parseFloat(e.target.value) || 0 })}
            className="w-full bg-transparent text-xs text-zinc-300 tabular-nums text-right focus:outline-none focus:bg-zinc-800 rounded px-1 py-0.5" />
        </td>
      ))}
      <td className="px-1 py-1 text-right">
        <button onClick={onRemove}
          className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3 h-3" />
        </button>
      </td>
    </tr>
  )
}
