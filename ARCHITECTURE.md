# 🗺️ Mapa de la app (para ahorrar búsquedas)

Mapa **grueso y estable** de cómo está programada Overseer, para que Claude y
Codex vayan directo al archivo correcto sin re-explorar. **Las reglas del "por
qué"** están en [`AGENTS.md`](AGENTS.md); **el estado del día a día** en
[`project_state.md`](project_state.md). Acá va **el "dónde" y los patrones**.

> **Mantenimiento (importante):** este mapa se actualiza **solo cuando se agrega
> un dominio/sección nuevo o cambia un patrón transversal** — NO en cada fix. Un
> mapa que crece en cada bug se pudre y miente. Mantenerlo grueso. Ante la duda,
> `grep` la verdad; el código manda, el mapa solo orienta.

## Stack
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 ·
Zustand (`persist`) · Supabase (auth + Postgres) · Framer Motion · lucide-react.
Deploy Vercel. PWA (`public/sw.js`) + push.

## Layout de carpetas
- `app/` — rutas (App Router). Una carpeta por sección: `app/tasks`, `app/mapas`,
  `app/ofertas`, `app/libros`, etc. `app/api/**/route.ts` = backend (Google
  Calendar, notifications, ai, health, push).
- `components/<seccion>/` — UI por sección (`tasks`, `calendar`, `offers`,
  `mindmap`, `estudio`, `dashboard`, `books`, …). `components/layout/` = shell
  (Sidebar, AppShell). `components/common/`, `components/ui/` = compartidos.
- `lib/store/` — **28 stores Zustand**, uno por dominio (`overseer-<nombre>` en
  localStorage). Fuente de verdad del estado del cliente.
- `lib/supabase/` — **el corazón del sync** (ver abajo). `sync.ts` es grande.
- `lib/<dominio>/` — lógica pura por dominio (`offers/blocks.ts`,
  `calendar/timeMath.ts`, `study/concepts.ts`, `dashboard/priorities.ts`, …).
- `lib/i18n/{es,en}.ts` — labels. `types/index.ts` — tipos de dominio compartidos.
- `supabase/*.sql` — migraciones (una por feature; hay ~59). `hooks/` — hooks React.

## Sincronización multi-dispositivo (lo que más caro cuesta entender)
Todo vive en `lib/supabase/sync.ts` (+ `syncMerge.ts`, `syncTracking.ts`,
`prefsMerge.ts`). Hay **dos patrones**:

1. **Per-fila** (la mayoría: tasks, offers, offer_templates, books, journal,
   youtube, meditations, mindmaps, study/concepts, gym, health, spi, …).
   Una fila por entidad en una tabla `<dominio>` (`id, user_id, created_at,
   updated_at, payload jsonb`). Flujo: `pushX` (upsert + `syncDeletes`) /
   `pullX` (fetch → **`sanitize`** campo por campo → `mergeById` por `updatedAt`
   + tombstones + baseline). Cada dominio tiene: flag `xInit`, `scheduleX`,
   subscribe, y reset del flag en 3 lugares (init, onAuthStateChange, tryAutoPull).
2. **Blob** (`app_preferences`): una fila JSON con preferencias chicas (nav,
   catálogos de ofertas, flags, hiddenProjects, …). Se **mergea por campo con
   timestamps** (`prefsMerge.ts` / `appPrefsFields()`), NUNCA se pisa entero.

**Sync entre pestañas** (aparte del multi-device): `lib/utils/initMultitabSync.ts`
tiene que listar TODOS los stores persistidos (si falta uno, se pierden datos
entre pestañas). Ver BASE nº1/2/3.

### ➕ Playbook: agregar un dominio sincronizado (per-fila)
Repetir para cada feature nueva que guarde datos (BASE nº1):
1. Store en `lib/store/xStore.ts` (`persist`, key `overseer-x`, toda mutación
   bumpea `updatedAt`).
2. `sync.ts`: `pushX`/`pullX` (copiar uno existente tipo `pushBooks`/`pullBooks`),
   con **`sanitize` que preserve TODOS los campos** (BASE nº2), `mergeById`,
   tombstones, baseline `x:items`.
3. `sync.ts` cableado: flag `state.xInit`, `scheduleX`, `subscribe`, reset del
   flag en `initAllDomains`, `onAuthStateChange` y `tryAutoPull` (+ `forceSyncAll`).
4. `initMultitabSync.ts`: `wireCrossTabSync(useXStore, 'overseer-x')`.
5. Migración `supabase/migration_x.sql` (tabla + RLS `auth.uid()=user_id`) — y
   **avisarle al usuario que la corra**.

## Navegación / secciones
- `lib/store/appStore.ts`: `CORE_NAV_KEYS` (siempre visibles) y
  `OPTIONAL_NAV_KEYS` (ocultas por default; el user las agrega). Agregar una
  sección opcional nueva → sumarla a `OPTIONAL_NAV_KEYS` **y** al `migrate` para
  que quede oculta en cuentas existentes (BASE nº4), bump de `version`.
- `components/layout/Sidebar.tsx`: `NAV_ITEMS` (ícono + href + key). Carpetas,
  orden y ocultar viven acá + en el blob `app_preferences`.

## Feature → archivos (grueso; el código manda)
| Feature | Store | UI | Sync / notas |
|---|---|---|---|
| Tareas | `tasksStore`, `taskUiStore` | `components/tasks/*` (`TasksPage`, `TaskCard`, `TaskDetail`, `ImportOutlineModal`) | per-fila `tasks`+`subtasks` (tabla propia, FK self-ref `parent_id` → subtareas anidadas SIN límite); árbol/parser puros en `lib/tasks/` (`subtaskTree.ts`, `parseOutline.ts`); push ordena padres-antes-hijos. `taskUiStore.hiddenProjects` va en el blob |
| Calendario | `googleCalendarStore` | `components/calendar/CalendarPage.tsx` | API `app/api/calendar/*`; `lib/calendar/timeMath.ts` |
| Ofertas (CRM) | `offersStore` | `components/offers/*` | per-fila `offer_systems`/`offers`/`offer_templates`; bloques `lib/offers/blocks.ts` |
| Mapas mentales | `mindmapStore` | `components/mindmap/MindMapCanvas.tsx` | per-fila; carpetas; nodos shape `rect/circle/bracket/text` |
| Estudio | `studyStore`, `conceptStore` | `components/estudio/*` | Carrera›Materia›Parcial›Tema; mapa de conceptos por materia; puente `reconcileStudyConceptMap` |
| Content Strategy | `contentStore` | `components/contenido/*` | mapa por perfil vía `lib/content/contentMindMap.ts` (`ensureProfileMindMap`) |
| Priority Gate | `lib/dashboard/priorityGate.ts` (`usePriorityGate`) | `components/common/PriorityGate.tsx` | única fuente de verdad; usado en Panel/Tasks/Calendar |
| Libros | `booksStore` | `components/books/BooksPage.tsx` | per-fila `books` |
| Panel/Dashboard | (varios) | `components/dashboard/*` (`DashboardPage` = widgets reordenables) | orden en localStorage |
| SPI / Proyección | `spiStore`, `projectionStore` | `components/spi/*`, `components/projection/*` | per-fila |
| Billetera / Hábitos / Salud / Gym / Comida / Trading / Journal / Meditaciones / YouTube / KPIs / Lab | `walletStore` / `habitsStore` / … | `components/<seccion>/*` | per-fila |

## Verificar (BASE nº5)
`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npx next dev -p 3099`
(middleware pasa sin auth) → medir DOM / localStorage. **Apagar al terminar.**
Lógica pura → tests con `npx tsx <file>.test.ts`.
