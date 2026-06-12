'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3) }

// ─── Types ────────────────────────────────────────────────────────────────────

export type FoodUnit = 'gr' | 'u' | 'ml'

export interface FoodEntry {
  id: string
  name: string
  unit: FoodUnit         // gr → macros por 100gr, ml → por 100ml, u → por 1 unidad
  calories: number
  protein: number
  carbs: number
  fats: number
  category?: string
}

export interface MealItem {
  id: string
  qty: string            // legacy: "4u", "70gr" — mantenido para back-compat / entrada libre
  name: string
  calories: number
  protein: number
  carbs: number
  fats: number
  // Nuevo: link a la biblioteca de alimentos + cantidad numérica
  foodId?: string
  qtyValue?: number
  qtyUnit?: FoodUnit
}

export interface Meal {
  id: string
  name: string           // "Desayuno / Merienda"
  timeLabel: string      // "11am – 4pm"
  items: MealItem[]
  isExtras?: boolean
}

export interface Stage {
  id: string
  name: string           // "Déficit 2600"
  shortLabel: string     // "Déficit"
  color: string
  caloriesTarget: number
  proteinTarget: number
  carbsTarget: number
  fatsTarget: number
  // Macro split for carb-load day (optional)
  carbDayCalories?: number
  carbDayProtein?: number
  carbDayCarbs?: number
  carbDayFats?: number
  meals: Meal[]
}

export interface ShoppingItem {
  id: string
  name: string
  qty: number
  unitPrice: number
  bought: boolean
  supplier?: string
  url?: string
}

export interface ShoppingCategory {
  id: string
  name: string
  items: ShoppingItem[]
}

export interface FixedCost {
  id: string
  label: string
  amount: number
  group: 'alquiler' | 'extras'
}

// ─── Defaults / Demo ──────────────────────────────────────────────────────────

const DEFICIT_MEALS: Meal[] = [
  {
    id: 'm1', name: 'Desayuno / Merienda', timeLabel: '11am – 4pm',
    items: [
      { id: 'i1', qty: '4u',   name: 'Huevos Medianos', calories: 300, protein: 25,  carbs: 4.9,  fats: 5   },
      { id: 'i2', qty: '7gr',  name: 'Manteca',         calories: 70,  protein: 0,   carbs: 0,    fats: 6   },
      { id: 'i3', qty: '2u',   name: 'Galleta Arroz',   calories: 60,  protein: 1.4, carbs: 12.7, fats: 0.5 },
    ],
  },
  {
    id: 'm2', name: 'Almuerzo', timeLabel: '13pm',
    items: [
      { id: 'i4', qty: '250gr', name: 'Pollo',     calories: 362, protein: 55.5, carbs: 0,    fats: 3   },
      { id: 'i5', qty: '15gr',  name: 'Manteca',   calories: 114, protein: 0,    carbs: 0,    fats: 12.6 },
      { id: 'i6', qty: '70gr',  name: 'Arroz Crudo',calories: 252, protein: 5,   carbs: 56,   fats: 0.4 },
    ],
  },
  {
    id: 'm3', name: 'Cena', timeLabel: '21hs',
    items: [
      { id: 'i7', qty: '70gr',  name: 'Arroz Crudo',calories: 252, protein: 5,   carbs: 56,   fats: 0.4 },
      { id: 'i8', qty: '250gr', name: 'Pollo',     calories: 362, protein: 55.5, carbs: 0,    fats: 15.5 },
      { id: 'i9', qty: '7gr',   name: 'Manteca',   calories: 70,  protein: 0,    carbs: 0,    fats: 6   },
    ],
  },
  {
    id: 'm4', name: 'Extras', timeLabel: '', isExtras: true,
    items: [
      { id: 'i10', qty: '250gr', name: 'Yogur Casero', calories: 189, protein: 11,   carbs: 14,   fats: 10  },
      { id: 'i11', qty: '1u',    name: 'Banana',       calories: 90,  protein: 1,    carbs: 21,   fats: 0.5 },
      { id: 'i12', qty: '70gr',  name: 'Avena',        calories: 272, protein: 11.2, carbs: 45.5, fats: 4.9 },
    ],
  },
]

const MAINTENANCE_MEALS: Meal[] = [
  {
    id: 'm1', name: 'Desayuno / Merienda', timeLabel: '11am – 4pm',
    items: [
      { id: 'i1', qty: '4u',   name: 'Huevos Medianos', calories: 300, protein: 25,   carbs: 4.9,  fats: 5    },
      { id: 'i2', qty: '7gr',  name: 'Manteca',         calories: 70,  protein: 0,    carbs: 0,    fats: 6    },
      { id: 'i3', qty: '2u',   name: 'Galleta Arroz',   calories: 60,  protein: 1.4,  carbs: 12.7, fats: 0.5  },
      { id: 'i4', qty: '40-60gr', name: 'Media Palta',  calories: 80,  protein: 2,    carbs: 4.25, fats: 7    },
      { id: 'i5', qty: '50gr', name: 'Cerdo al Horno',  calories: 138, protein: 25,   carbs: 3.1,  fats: 10.5 },
      { id: 'i6', qty: '4u',   name: 'Aceitunas',       calories: 30,  protein: 0,    carbs: 0.9,  fats: 3    },
      { id: 'i7', qty: '15gr', name: 'Aceite de Oliva', calories: 80,  protein: 0,    carbs: 0,    fats: 10   },
    ],
  },
  {
    id: 'm2', name: 'Almuerzo', timeLabel: '13pm',
    items: [
      { id: 'i8',  qty: '250gr', name: 'Pollo',         calories: 362, protein: 55.5, carbs: 0,    fats: 3    },
      { id: 'i9',  qty: '15gr',  name: 'Manteca',       calories: 114, protein: 0,    carbs: 0,    fats: 12.6 },
      { id: 'i10', qty: '15gr',  name: 'Aceite de Oliva',calories: 80, protein: 0,    carbs: 0,    fats: 10   },
      { id: 'i11', qty: '100gr', name: 'Brócoli',       calories: 40,  protein: 2.6,  carbs: 8.9,  fats: 0.3  },
      { id: 'i12', qty: '100gr', name: 'Cebolla',       calories: 40,  protein: 1.1,  carbs: 10.7, fats: 1.1  },
      { id: 'i13', qty: '100gr', name: 'Zanahoria',     calories: 41,  protein: 0.9,  carbs: 9.6,  fats: 0.2  },
    ],
  },
  {
    id: 'm3', name: 'Cena', timeLabel: '21hs',
    items: [
      { id: 'i14', qty: '400gr', name: 'Papa',          calories: 320, protein: 2.2,  carbs: 56,   fats: 0    },
      { id: 'i15', qty: '250gr', name: 'Pollo',         calories: 362, protein: 55.5, carbs: 0,    fats: 15.5 },
      { id: 'i16', qty: '7gr',   name: 'Manteca',       calories: 70,  protein: 0,    carbs: 0,    fats: 6    },
    ],
  },
  {
    id: 'm4', name: 'Extras', timeLabel: '', isExtras: true,
    items: [
      { id: 'i17', qty: '250gr',   name: 'Yogur',                calories: 180, protein: 12,    carbs: 17.6, fats: 7.6  },
      { id: 'i18', qty: '1u',      name: 'Banana',               calories: 90,  protein: 1,     carbs: 21,   fats: 0.5  },
      { id: 'i19', qty: '30gr o 3c',name: 'Avena',               calories: 117, protein: 5,     carbs: 20,   fats: 2    },
      { id: 'i20', qty: '10u-10gr',name: 'Almendra',             calories: 58,  protein: 2.13,  carbs: 1.97, fats: 5.06 },
      { id: 'i21', qty: '40gr',    name: 'Cucharada Pasta de Maní',calories: 240,protein: 4.7,  carbs: 3.3,  fats: 9.4  },
      { id: 'i22', qty: '',        name: 'Scoop Proteína',       calories: 130, protein: 25,    carbs: 3.5,  fats: 2    },
    ],
  },
]

const DEMO_STAGES: Stage[] = [
  {
    id: 's1', name: 'Déficit 2600', shortLabel: 'Déficit', color: '#ef4444',
    caloriesTarget: 2600, proteinTarget: 200, carbsTarget: 234, fatsTarget: 65,
    carbDayCalories: 0, carbDayProtein: 200, carbDayCarbs: 280, carbDayFats: 60,
    meals: DEFICIT_MEALS,
  },
  {
    id: 's2', name: 'Mantenimiento 3000', shortLabel: 'Mantenimiento', color: '#10b981',
    caloriesTarget: 3000, proteinTarget: 281, carbsTarget: 112, fatsTarget: 202.5,
    carbDayCalories: 0, carbDayProtein: 200, carbDayCarbs: 280, carbDayFats: 60,
    meals: MAINTENANCE_MEALS,
  },
  {
    id: 's3', name: 'Volumen 3400', shortLabel: 'Volumen', color: '#6366f1',
    caloriesTarget: 3400, proteinTarget: 281, carbsTarget: 320, fatsTarget: 95,
    carbDayCalories: 0, carbDayProtein: 200, carbDayCarbs: 280, carbDayFats: 60,
    meals: MAINTENANCE_MEALS.map(m => ({ ...m, id: m.id + 'v', items: m.items.map(i => ({ ...i, id: i.id + 'v' })) })),
  },
]

const DEMO_SHOPPING: ShoppingCategory[] = [
  {
    id: 'sc1', name: 'Comida Mensual',
    items: [
      { id: 'sci1',  name: 'Pollo Entero',        qty: 4, unitPrice: 4000,  bought: false, supplier: 'Coto' },
      { id: 'sci2',  name: 'Roast Beef',          qty: 2, unitPrice: 12000, bought: true,  supplier: 'Coto' },
      { id: 'sci3',  name: 'Trucha o Salmón',     qty: 1, unitPrice: 30000, bought: false, supplier: 'Coto' },
      { id: 'sci4',  name: 'Pechuga Pollo',       qty: 4, unitPrice: 7699.5,bought: false, supplier: 'Carrefour' },
      { id: 'sci5',  name: 'Peceto de Cerdo',     qty: 2, unitPrice: 9700,  bought: false, supplier: 'Coto' },
      { id: 'sci6',  name: 'Cuadrada de Cerdo',   qty: 2, unitPrice: 10000, bought: false, supplier: 'Coto' },
      { id: 'sci7',  name: 'Riñones',             qty: 1, unitPrice: 6800,  bought: false, supplier: 'Raza' },
      { id: 'sci8',  name: 'Merluza',             qty: 2, unitPrice: 12000, bought: false, supplier: 'Carrefour' },
      { id: 'sci9',  name: 'Avena',               qty: 4, unitPrice: 0,     bought: true                },
      { id: 'sci10', name: 'Yerba KG',            qty: 2, unitPrice: 4865,  bought: false               },
      { id: 'sci11', name: 'Manteca',             qty: 2, unitPrice: 4600,  bought: false               },
      { id: 'sci12', name: 'Aceite Oliva Virgen', qty: 1, unitPrice: 15000, bought: false               },
      { id: 'sci13', name: 'Maple Huevo',         qty: 4, unitPrice: 6000,  bought: true                },
      { id: 'sci14', name: 'Salsa Tomate',        qty: 4, unitPrice: 900,   bought: true                },
      { id: 'sci15', name: 'Pasta de Maní',       qty: 3, unitPrice: 5900,  bought: true                },
      { id: 'sci16', name: 'Leche',               qty: 8, unitPrice: 2200,  bought: true, supplier: 'Coto' },
      { id: 'sci17', name: 'Galletas de Arroz',   qty: 4, unitPrice: 0,     bought: true,  supplier: 'Carrefour' },
      { id: 'sci18', name: 'Yogur',               qty: 2, unitPrice: 3300,  bought: true                },
      { id: 'sci19', name: 'Café',                qty: 1, unitPrice: 20000, bought: false, supplier: 'Carrefour' },
    ],
  },
  {
    id: 'sc2', name: 'Frutos Secos Mensual',
    items: [
      { id: 'fs1', name: 'Almendras', qty: 1, unitPrice: 0, bought: false },
      { id: 'fs2', name: 'Dátiles',   qty: 1, unitPrice: 0, bought: false },
      { id: 'fs3', name: 'Nueces',    qty: 1, unitPrice: 0, bought: false },
      { id: 'fs4', name: 'Miel',      qty: 1, unitPrice: 0, bought: false },
      { id: 'fs5', name: 'Arándanos', qty: 1, unitPrice: 0, bought: false },
    ],
  },
  {
    id: 'sc3', name: 'Verdura Mensual',
    items: [
      { id: 'v1', name: 'Banana',          qty: 3, unitPrice: 800,  bought: false, supplier: 'Verdulería' },
      { id: 'v2', name: 'Zanahoria',       qty: 2, unitPrice: 650,  bought: false                         },
      { id: 'v3', name: 'Cebolla',         qty: 2, unitPrice: 300,  bought: false                         },
      { id: 'v4', name: 'Papa',            qty: 2, unitPrice: 500,  bought: false                         },
      { id: 'v5', name: 'Remolacha',       qty: 1, unitPrice: 1990, bought: false                         },
      { id: 'v6', name: 'Ajo Entero',      qty: 1, unitPrice: 1300, bought: false                         },
    ],
  },
  {
    id: 'sc4', name: 'Suplementación',
    items: [
      { id: 'sp1', name: 'Melatonina + Triptófano',      qty: 1, unitPrice: 0,     bought: false                     },
      { id: 'sp2', name: 'Creatina (5g) Creapure',       qty: 1, unitPrice: 30000, bought: false, supplier: 'Star Nutrition' },
      { id: 'sp3', name: 'BisGlycinate Magnesium 400mg', qty: 1, unitPrice: 14000, bought: false                     },
      { id: 'sp4', name: 'Zinc BisGlicinato 15/30 mg',   qty: 1, unitPrice: 7000,  bought: false                     },
      { id: 'sp5', name: 'Multivitamínico Star Nutrition',qty: 1, unitPrice: 25500,bought: false                     },
      { id: 'sp6', name: 'Omega 3',                       qty: 1, unitPrice: 12750,bought: false                     },
      { id: 'sp7', name: 'Vitamina D3 4000UI + K2 100μg',qty: 1, unitPrice: 10300, bought: false                     },
      { id: 'sp8', name: 'Vitamina C 500mg',              qty: 1, unitPrice: 0,    bought: false                     },
    ],
  },
]

// Macros por 100gr (gr/ml) o por 1 unidad (u). Derivados de las comidas demo.
const DEMO_FOODS: FoodEntry[] = [
  { id: 'f-huevo',     name: 'Huevo mediano',       unit: 'u',  calories: 75,  protein: 6.25, carbs: 1.225, fats: 1.25,  category: 'Proteína' },
  { id: 'f-manteca',   name: 'Manteca',             unit: 'gr', calories: 760, protein: 0,    carbs: 0,     fats: 84,    category: 'Grasa' },
  { id: 'f-pollo',     name: 'Pollo (pechuga)',     unit: 'gr', calories: 145, protein: 22.2, carbs: 0,     fats: 3,     category: 'Proteína' },
  { id: 'f-arroz',     name: 'Arroz crudo',         unit: 'gr', calories: 360, protein: 7.14, carbs: 80,    fats: 0.57,  category: 'Carbo' },
  { id: 'f-galleta',   name: 'Galleta de arroz',    unit: 'u',  calories: 30,  protein: 0.7,  carbs: 6.35,  fats: 0.25,  category: 'Carbo' },
  { id: 'f-banana',    name: 'Banana',              unit: 'u',  calories: 90,  protein: 1,    carbs: 21,    fats: 0.5,   category: 'Fruta' },
  { id: 'f-avena',     name: 'Avena',               unit: 'gr', calories: 389, protein: 16,   carbs: 65,    fats: 7,     category: 'Carbo' },
  { id: 'f-yogur',     name: 'Yogur',               unit: 'gr', calories: 72,  protein: 4.8,  carbs: 7.04,  fats: 3.04,  category: 'Lácteo' },
  { id: 'f-aceite',    name: 'Aceite de oliva',     unit: 'gr', calories: 884, protein: 0,    carbs: 0,     fats: 100,   category: 'Grasa' },
  { id: 'f-palta',     name: 'Palta',               unit: 'gr', calories: 160, protein: 2,    carbs: 8.5,   fats: 14.66, category: 'Grasa' },
  { id: 'f-cerdo',     name: 'Cerdo al horno',      unit: 'gr', calories: 276, protein: 50,   carbs: 6.2,   fats: 21,    category: 'Proteína' },
  { id: 'f-aceitunas', name: 'Aceitunas',           unit: 'u',  calories: 7.5, protein: 0,    carbs: 0.225, fats: 0.75,  category: 'Grasa' },
  { id: 'f-brocoli',   name: 'Brócoli',             unit: 'gr', calories: 40,  protein: 2.6,  carbs: 8.9,   fats: 0.3,   category: 'Verdura' },
  { id: 'f-cebolla',   name: 'Cebolla',             unit: 'gr', calories: 40,  protein: 1.1,  carbs: 10.7,  fats: 1.1,   category: 'Verdura' },
  { id: 'f-zanahoria', name: 'Zanahoria',           unit: 'gr', calories: 41,  protein: 0.9,  carbs: 9.6,   fats: 0.2,   category: 'Verdura' },
  { id: 'f-papa',      name: 'Papa',                unit: 'gr', calories: 80,  protein: 0.55, carbs: 14,    fats: 0,     category: 'Carbo' },
  { id: 'f-almendra',  name: 'Almendra',            unit: 'u',  calories: 5.8, protein: 0.213,carbs: 0.197, fats: 0.506, category: 'Fruto seco' },
  { id: 'f-pasta-mani',name: 'Pasta de maní',       unit: 'gr', calories: 600, protein: 11.75,carbs: 8.25,  fats: 23.5,  category: 'Grasa' },
  { id: 'f-proteina',  name: 'Scoop proteína',      unit: 'u',  calories: 130, protein: 25,   carbs: 3.5,   fats: 2,     category: 'Proteína' },
]

const DEMO_FIXED_COSTS: FixedCost[] = [
  { id: 'fc1', label: 'Alquiler',         amount: 0,      group: 'alquiler' },
  { id: 'fc2', label: 'Servicios',        amount: 0,      group: 'alquiler' },
  { id: 'fc3', label: 'Peluquería',       amount: 28000,  group: 'extras' },
  { id: 'fc4', label: 'AFIP',             amount: 90000,  group: 'extras' },
  { id: 'fc5', label: 'Suplementación',   amount: 59050,  group: 'extras' },
]

// ─── Store ────────────────────────────────────────────────────────────────────

interface State {
  stages: Stage[]
  currentStageId: string
  shopping: ShoppingCategory[]
  fixedCosts: FixedCost[]
  foods: FoodEntry[]
  notes: string

  setCurrentStage: (id: string) => void
  setNotes: (notes: string) => void

  // Stage / meals / items
  updateStage: (id: string, patch: Partial<Stage>) => void
  addMealToStage: (stageId: string) => void
  removeMeal: (stageId: string, mealId: string) => void
  updateMeal: (stageId: string, mealId: string, patch: Partial<Meal>) => void
  addItem: (stageId: string, mealId: string) => void
  addItemFromFood: (stageId: string, mealId: string, foodId: string, qtyValue: number) => void
  updateItem: (stageId: string, mealId: string, itemId: string, patch: Partial<MealItem>) => void
  setItemQuantity: (stageId: string, mealId: string, itemId: string, qtyValue: number) => void
  linkItemToFood: (stageId: string, mealId: string, itemId: string, foodId: string | null) => void
  removeItem: (stageId: string, mealId: string, itemId: string) => void

  // Food library
  addFood: (patch?: Partial<FoodEntry>) => void
  updateFood: (id: string, patch: Partial<FoodEntry>) => void
  removeFood: (id: string) => void

  // Shopping
  addShoppingCategory: (name: string) => void
  removeShoppingCategory: (id: string) => void
  addShoppingItem: (categoryId: string) => void
  updateShoppingItem: (categoryId: string, itemId: string, patch: Partial<ShoppingItem>) => void
  removeShoppingItem: (categoryId: string, itemId: string) => void

  // Fixed costs
  addFixedCost: (group: 'alquiler' | 'extras', label: string) => void
  updateFixedCost: (id: string, patch: Partial<FixedCost>) => void
  removeFixedCost: (id: string) => void
}

export const useFoodStore = create<State>()(
  persist(
    (set) => ({
      stages: [],
      currentStageId: '',
      shopping: [],
      fixedCosts: [],
      foods: DEMO_FOODS,
      notes: '',

      setCurrentStage: (id) => set({ currentStageId: id }),
      setNotes: (notes) => set({ notes }),

      updateStage: (id, patch) => set((s) => ({
        stages: s.stages.map((st) => st.id === id ? { ...st, ...patch } : st),
      })),
      addMealToStage: (stageId) => set((s) => ({
        stages: s.stages.map((st) => st.id !== stageId ? st : {
          ...st,
          meals: [...st.meals, { id: genId(), name: 'Nueva comida', timeLabel: '', items: [] }],
        }),
      })),
      removeMeal: (stageId, mealId) => set((s) => ({
        stages: s.stages.map((st) => st.id !== stageId ? st : { ...st, meals: st.meals.filter((m) => m.id !== mealId) }),
      })),
      updateMeal: (stageId, mealId, patch) => set((s) => ({
        stages: s.stages.map((st) => st.id !== stageId ? st : {
          ...st,
          meals: st.meals.map((m) => m.id === mealId ? { ...m, ...patch } : m),
        }),
      })),
      addItem: (stageId, mealId) => set((s) => ({
        stages: s.stages.map((st) => st.id !== stageId ? st : {
          ...st,
          meals: st.meals.map((m) => m.id !== mealId ? m : {
            ...m,
            items: [...m.items, { id: genId(), qty: '', name: '', calories: 0, protein: 0, carbs: 0, fats: 0 }],
          }),
        }),
      })),
      addItemFromFood: (stageId, mealId, foodId, qtyValue) => set((s) => {
        const food = s.foods.find((f) => f.id === foodId)
        if (!food) return s
        const macros = computeMacrosFromFood(food, qtyValue)
        const newItem: MealItem = {
          id: genId(),
          name: food.name,
          qty: formatQty(qtyValue, food.unit),
          qtyValue,
          qtyUnit: food.unit,
          foodId: food.id,
          ...macros,
        }
        return {
          stages: s.stages.map((st) => st.id !== stageId ? st : {
            ...st,
            meals: st.meals.map((m) => m.id !== mealId ? m : { ...m, items: [...m.items, newItem] }),
          }),
        }
      }),
      updateItem: (stageId, mealId, itemId, patch) => set((s) => ({
        stages: s.stages.map((st) => st.id !== stageId ? st : {
          ...st,
          meals: st.meals.map((m) => m.id !== mealId ? m : {
            ...m,
            items: m.items.map((it) => it.id === itemId ? { ...it, ...patch } : it),
          }),
        }),
      })),
      setItemQuantity: (stageId, mealId, itemId, qtyValue) => set((s) => ({
        stages: s.stages.map((st) => st.id !== stageId ? st : {
          ...st,
          meals: st.meals.map((m) => m.id !== mealId ? m : {
            ...m,
            items: m.items.map((it) => {
              if (it.id !== itemId) return it
              const food = it.foodId ? s.foods.find((f) => f.id === it.foodId) : undefined
              if (food) {
                const macros = computeMacrosFromFood(food, qtyValue)
                return { ...it, qtyValue, qtyUnit: food.unit, qty: formatQty(qtyValue, food.unit), ...macros }
              }
              const unit = it.qtyUnit ?? 'gr'
              return { ...it, qtyValue, qtyUnit: unit, qty: formatQty(qtyValue, unit) }
            }),
          }),
        }),
      })),
      linkItemToFood: (stageId, mealId, itemId, foodId) => set((s) => ({
        stages: s.stages.map((st) => st.id !== stageId ? st : {
          ...st,
          meals: st.meals.map((m) => m.id !== mealId ? m : {
            ...m,
            items: m.items.map((it) => {
              if (it.id !== itemId) return it
              if (!foodId) return { ...it, foodId: undefined }
              const food = s.foods.find((f) => f.id === foodId)
              if (!food) return it
              const qtyValue = it.qtyValue ?? (food.unit === 'u' ? 1 : 100)
              const macros = computeMacrosFromFood(food, qtyValue)
              return {
                ...it,
                foodId: food.id,
                name: food.name,
                qtyValue,
                qtyUnit: food.unit,
                qty: formatQty(qtyValue, food.unit),
                ...macros,
              }
            }),
          }),
        }),
      })),
      removeItem: (stageId, mealId, itemId) => set((s) => ({
        stages: s.stages.map((st) => st.id !== stageId ? st : {
          ...st,
          meals: st.meals.map((m) => m.id !== mealId ? m : { ...m, items: m.items.filter((it) => it.id !== itemId) }),
        }),
      })),

      addShoppingCategory: (name) => set((s) => ({
        shopping: [...s.shopping, { id: genId(), name, items: [] }],
      })),
      removeShoppingCategory: (id) => set((s) => ({ shopping: s.shopping.filter((c) => c.id !== id) })),
      addShoppingItem: (categoryId) => set((s) => ({
        shopping: s.shopping.map((c) => c.id !== categoryId ? c : {
          ...c,
          items: [...c.items, { id: genId(), name: '', qty: 1, unitPrice: 0, bought: false }],
        }),
      })),
      updateShoppingItem: (categoryId, itemId, patch) => set((s) => ({
        shopping: s.shopping.map((c) => c.id !== categoryId ? c : {
          ...c,
          items: c.items.map((it) => it.id === itemId ? { ...it, ...patch } : it),
        }),
      })),
      removeShoppingItem: (categoryId, itemId) => set((s) => ({
        shopping: s.shopping.map((c) => c.id !== categoryId ? c : { ...c, items: c.items.filter((it) => it.id !== itemId) }),
      })),

      addFood: (patch) => set((s) => ({
        foods: [
          {
            id: genId(),
            name: '',
            unit: 'gr',
            calories: 0,
            protein: 0,
            carbs: 0,
            fats: 0,
            ...patch,
          },
          ...s.foods,
        ],
      })),
      updateFood: (id, patch) => set((s) => {
        const newFoods = s.foods.map((f) => f.id === id ? { ...f, ...patch } : f)
        const updated = newFoods.find((f) => f.id === id)
        if (!updated) return { foods: newFoods }
        // Cascada: cualquier meal item linkeado a este food recalcula macros y nombre
        const newStages = s.stages.map((st) => ({
          ...st,
          meals: st.meals.map((m) => ({
            ...m,
            items: m.items.map((it) => {
              if (it.foodId !== id) return it
              const qtyValue = it.qtyValue ?? 0
              const macros = computeMacrosFromFood(updated, qtyValue)
              return {
                ...it,
                name: updated.name,
                qtyUnit: updated.unit,
                qty: formatQty(qtyValue, updated.unit),
                ...macros,
              }
            }),
          })),
        }))
        return { foods: newFoods, stages: newStages }
      }),
      removeFood: (id) => set((s) => ({
        foods: s.foods.filter((f) => f.id !== id),
        // Desvincular items huérfanos (mantengo macros, solo borro link)
        stages: s.stages.map((st) => ({
          ...st,
          meals: st.meals.map((m) => ({
            ...m,
            items: m.items.map((it) => it.foodId === id ? { ...it, foodId: undefined } : it),
          })),
        })),
      })),

      addFixedCost: (group, label) => set((s) => ({
        fixedCosts: [...s.fixedCosts, { id: genId(), label, amount: 0, group }],
      })),
      updateFixedCost: (id, patch) => set((s) => ({
        fixedCosts: s.fixedCosts.map((f) => f.id === id ? { ...f, ...patch } : f),
      })),
      removeFixedCost: (id) => set((s) => ({ fixedCosts: s.fixedCosts.filter((f) => f.id !== id) })),
    }),
    { name: 'overseer-food' }
  )
)

// ─── Selectors ────────────────────────────────────────────────────────────────

export function sumMealMacros(meal: Meal) {
  return meal.items.reduce(
    (acc, it) => ({
      calories: acc.calories + it.calories,
      protein:  acc.protein  + it.protein,
      carbs:    acc.carbs    + it.carbs,
      fats:     acc.fats     + it.fats,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )
}

export function sumStageMacros(stage: Stage) {
  return stage.meals
    .filter((m) => !m.isExtras)
    .reduce(
      (acc, m) => {
        const s = sumMealMacros(m)
        return {
          calories: acc.calories + s.calories,
          protein:  acc.protein  + s.protein,
          carbs:    acc.carbs    + s.carbs,
          fats:     acc.fats     + s.fats,
        }
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    )
}

export function computeMacrosFromFood(food: FoodEntry, qtyValue: number) {
  const ref = food.unit === 'u' ? 1 : 100
  const factor = (qtyValue || 0) / ref
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    calories: round(food.calories * factor),
    protein:  round(food.protein  * factor),
    carbs:    round(food.carbs    * factor),
    fats:     round(food.fats     * factor),
  }
}

export function formatQty(qtyValue: number, unit: FoodUnit): string {
  if (!Number.isFinite(qtyValue)) return ''
  const trimmed = Number.isInteger(qtyValue) ? qtyValue.toString() : (Math.round(qtyValue * 100) / 100).toString()
  return `${trimmed}${unit}`
}

const LEGACY_QTY_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(gr|g|ml|u)\s*$/i
export function parseLegacyQty(raw: string | undefined): { qtyValue: number; qtyUnit: FoodUnit } | null {
  if (!raw) return null
  const m = LEGACY_QTY_RE.exec(raw)
  if (!m) return null
  const num = parseFloat(m[1].replace(',', '.'))
  if (!Number.isFinite(num)) return null
  const u = m[2].toLowerCase()
  const unit: FoodUnit = u === 'ml' ? 'ml' : u === 'u' ? 'u' : 'gr'
  return { qtyValue: num, qtyUnit: unit }
}

export function categoryTotal(c: ShoppingCategory): number {
  return c.items.reduce((acc, it) => acc + it.qty * it.unitPrice, 0)
}
