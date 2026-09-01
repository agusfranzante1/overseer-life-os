# 🗺️ Mapa de la app (para ahorrar búsquedas)

Mapa **grueso y estable** de cómo está programada Overseer, para que Claude vaya
directo al archivo correcto sin re-explorar. **Las reglas del "por
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

**Push tolerante a migraciones sin correr** (`lib/supabase/upsertTolerant.ts`): si la tabla
remota no tiene una columna nueva, se descarta esa columna y se reintenta en vez de tirar el
batch. Importa porque `syncDeletes` va DESPUÉS del upsert: un push que moría dejaba los
borrados sin propagar y el pull siguiente resucitaba lo borrado.

**Push tolerante al token vencido** (`lib/supabase/authRetry.ts` + `runPush` en sync.ts): el access
token dura una hora, así que con la app de fondo caduca y el push rebota con `PGRST303 · JWT
expired`. No es un error: `getSession()` lo renueva y se reintenta UNA vez. Acotado al token —
migraciones, RLS y red se comportan como siempre, y si el reintento falla se avisa igual.

**El push respeta los tombstones**: antes de subir, `pushTasks` descarta lo que figure en
`deleted_rows` (`isTombstoned`). Sin eso el upsert resucitaba en la nube lo que otro device o el
bridge MCP habían borrado mientras este device no pulleaba — el tombstone solo cubría el pull.

**Listas anidadas en el merge**: `mergeById` resucita todo cuando el local está vacío (un store
que no rehidrató). Ese heurístico NO aplica a listas anidadas dentro de una fila — las subtareas
de una tarea pasan `isNestedCollection: true` (`mergeTaskWithSubtasks`), porque quedarse con cero
subtareas es normal y si no el pull revivía las borradas.

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

## Bridge con Claude (`/api/mcp`) — datos hacia afuera
Overseer NO llama a ningún LLM para planificar: el razonamiento lo pone **Claude
corriendo en la suscripción del usuario** (Claude Code / claude.ai), que entra a
la cuenta por un servidor MCP propio. (La capa `lib/ai/*` + `app/api/ai/*` es
otra cosa: chat con API key facturada por uso. No se mezclan.)

- `app/api/mcp/route.ts` — servidor MCP (JSON-RPC 2.0 sobre HTTP, a mano, sin SDK).
- `app/api/export/brief/route.ts` — el mismo contenido como un GET read-only.
- `app/api/mcp/tokens/route.ts` — alta/listado/revocación (auth por SESIÓN, no por token).
- `lib/mcp/` — `auth.ts` (token sha256 + `authenticate()`), `queries.ts` (lecturas),
  `writes.ts` (plan + perfil), `taskWrites.ts` (crear tarea / recurrencia),
  `tools.ts` (catálogo MCP), `freeSlots.ts` y `taskInput.ts` (puros, con test).

**Auth:** token `ovs_...` en `Authorization: Bearer`; se guarda solo el sha256 en
`mcp_tokens`. Es la única puerta a los datos sin cookie de sesión (el middleware
ya deja pasar `/api/*`). Se distingue 401 (token malo) de 503 (backend caído).

**Superficie de ESCRITURA — acotada a propósito.** Escribir acá saltea los
stores y toda la lógica de dominio, que es como este proyecto ya perdió datos
tres veces. El bridge **no borra nada** (no hay tool de delete) y no toca
`subtasks` existentes, `archived_at`, `completed_at`, `status` ni `project_id`.
Puede: escribir `day_plans`, **crear** una tarea (con subtareas y recurrencia),
mover 4 campos escalares de una tarea (`due_date`, `due_time`,
`duration_minutes`, `scheduled_for`), poner/sacar la **regla** de recurrencia, y
mergear `plannerProfile`. Todo write bumpea `updated_at` — sin eso el pull LWW
lo pisa (BASE nº1).

**Crear tareas es seguro por un motivo puntual:** el pull **recomputa
`project.taskIds` desde `project_id`**, así que una fila insertada del lado
server aparece sola en su tablero. Y `tasks.status` es NOT NULL SIN default con
estados PROPIOS de cada proyecto (los del usuario están en español) → se
resuelve contra los del proyecto destino, nunca hardcodeado (`taskInput.ts`).
Una tarea entra al **calendario de Overseer** solo con `due_date` **y**
`due_time` (`CalendarPage`).

**Recurrentes — el reparto que hay que respetar:** *el server escribe la REGLA,
el cliente genera las INSTANCIAS*. Los ids de spawn son deterministas
(`rec_<madre>_<fecha>`) y los calcula el cliente; si el server inventara filas,
dos dispositivos generarían copias distintas y el merge las sumaría. Al CAMBIAR
una regla que ya tenía instancias, el server deja la marca
**`recurrence.rebuildAt`** y `TasksPage` al montar corre
`rebuildRecurringChain` + limpia la marca. Detener = sacar la regla de la madre
**y de sus instancias** (si queda en una, vuelve a sembrar la serie).

**`plannerProfile`** (lo que el planificador "aprende") vive en el blob
`app_preferences`. El server lo escribe leyendo el payload entero, tocando solo
esa clave y **sellando `payload._t.plannerProfile`** — sin esa marca el push del
cliente lo pisa con su copia vieja (ver `prefsMerge.ts`).

**Huecos libres:** `computeFreeSlots` resta a la ventana de trabajo los eventos
de Google Calendar (leídos server-side con el `refresh_token` de
`gcal_credentials`) **y las anclas de `idealSchedule`** (almuerzo, entrenamiento:
son compromisos reales, no decoración).

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
| Tareas | `tasksStore`, `taskUiStore` | `components/tasks/*` (`TasksPage`, `TaskCard`, `TaskDetail`, `ImportOutlineModal`) | per-fila `tasks`+`subtasks` (tabla propia, FK self-ref `parent_id` → subtareas anidadas SIN límite); árbol/parser puros en `lib/tasks/` (`subtaskTree.ts`, `parseOutline.ts`, `savedViews.ts`); push ordena padres-antes-hijos. `taskUiStore.hiddenProjects` y `savedViews` (listas guardadas / smart lists) van en el blob. **Recurrentes:** `recurringHeadId` es la ETIQUETA de la serie (se conserva aunque la fila de la madre no exista) e ids deterministas `rec_<madre>_<fecha>`; madre archivada = serie detenida; `migrateRecurringHeads` re-ancla fragmentos con criterio determinista y `dedupeRecurringInstances` limpia copias. Los SPAWNS son deterministas de punta a punta (instancia `rec_<madre>_<fecha>`, sus subtareas `<instancia>__<subtarea>` con el `parentId` remapeado a la copia, y la hermana de una subtarea recurrente `recsub_<subtarea>_<fecha>`) — si algo del spawn usa `genId()`, dos dispositivos generan copias distintas de la misma cosa y el merge las suma. Ver `lib/tasks/recurringSeries.test.ts` |
| Calendario | `googleCalendarStore` | `components/calendar/CalendarPage.tsx` | API `app/api/calendar/*`; `lib/calendar/timeMath.ts` (matemática de drag/resize) y `overlapLayout.ts` (los bloques que comparten franja se reparten el ancho de la columna) |
| Ofertas (CRM) | `offersStore` | `components/offers/*` | per-fila `offer_systems`/`offers`/`offer_templates`; bloques `lib/offers/blocks.ts`. **Borrado por-INTENCIÓN** (no por `baseline − local`): outbox `pendingDeletes` en el store → `pushExplicitDeletes` en sync.ts borra solo eso + tombstones; pull con baseline vacío. Doc por `docRev` (no reloj) |
| Mapas mentales | `mindmapStore` | `components/mindmap/MindMapCanvas.tsx` | per-fila; carpetas; nodos shape `rect/circle/bracket/text` |
| Estudio | `studyStore`, `conceptStore` | `components/estudio/*` | Carrera›Materia›Parcial›Tema; mapa de conceptos por materia; puente `reconcileStudyConceptMap` |
| Content Strategy | `contentStore` | `components/contenido/*` | mapa por perfil vía `lib/content/contentMindMap.ts` (`ensureProfileMindMap`) |
| Priority Gate | `lib/dashboard/priorityGate.ts` (`usePriorityGate`) | `components/common/PriorityGate.tsx` | única fuente de verdad; usado en Panel/Tasks/Calendar |
| **Plan del día / Bridge con Claude** | `dayPlanStore` | `components/dashboard/DayPlanPanel.tsx`, `components/settings/ClaudeBridgeSection.tsx` | per-fila `day_plans` (columnas reales, id determinista `plan_<fecha>`). El plan lo escribe Claude DESDE AFUERA vía el bridge — ver abajo |
| Libros | `booksStore` | `components/books/BooksPage.tsx` | per-fila `books` |
| Panel/Dashboard | (varios) | `components/dashboard/*` (`DashboardPage` = widgets reordenables) | orden en localStorage |
| SPI / Proyección | `spiStore`, `projectionStore` | `components/spi/*`, `components/projection/*` | per-fila |
| Billetera / Hábitos / Salud / Gym / Comida / Trading / Journal / Meditaciones / YouTube / KPIs / Lab | `walletStore` / `habitsStore` / … | `components/<seccion>/*` | per-fila |

## Verificar (BASE nº5)
`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npx next dev -p 3099`
(middleware pasa sin auth) → medir DOM / localStorage. **Apagar al terminar.**
Lógica pura → tests con `npx tsx <file>.test.ts`.
