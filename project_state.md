# 📔 Estado del Proyecto — Overseer Life OS

> Bitácora viva. Cambia todo el tiempo. Claude la lee al empezar cada chat
> (se carga sola vía `CLAUDE.md`) y la actualiza al terminar cada cambio.
> El método de trabajo está en [`instructions.md`](instructions.md); las reglas
> técnicas no negociables en [`AGENTS.md`](AGENTS.md).

**Última actualización:** 2026-08-15 · **Roadmap:** 7 etapas. **Etapas 1–6 COMPLETAS.** **Etapa 7 (Dashboard) DESCARTADA por decisión del usuario** (no quiso cambios). Roadmap cerrado. Extra post-roadmap: **Tareas favoritas** (⭐).

⚠️ **PENDIENTE del usuario:** correr en Supabase `supabase/migration_offer_templates.sql` (Etapa 5), `supabase/migration_books.sql` (Etapa 6) y **`supabase/migration_tasks_favorite.sql`** (⭐ favoritas) — este último es CRÍTICO: hasta correrlo, el push de tareas FALLA (columna `favorite` desconocida) y el sync de tareas se corta.

---

## 🎯 Objetivo

Sistema personal de gestión de vida ("life OS") en español: tareas, plata,
hábitos, salud, estudio, contenido, meditación, trading y más, en un solo lugar.
Todo se guarda solo y **sincroniza entre la compu, la notebook y el celu**.

## 🧱 Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + TypeScript
- **Tailwind 4** + Framer Motion (animaciones) + lucide-react (íconos)
- **Zustand** con `persist` (estado + localStorage), un store por dominio
- **Supabase** (auth + Postgres) para el sync multi-dispositivo
- Deploy en **Vercel**; repo `agusfranzante1/overseer-life-os`
- PWA con service worker (`public/sw.js`) + push notifications vía cron

## 🔑 Cómo es el sync (lo que más se rompe)

- **Por-fila** (tasks, offers, journal, youtube, meditaciones…): una fila por
  entidad, merge por `updatedAt` (LWW) + tombstones + baselines.
- **Blob** (`app_preferences`): una fila JSON. Se **mergea por campo** con
  marcas de tiempo (`prefsMerge.ts`), nunca se pisa entero.
- **Entre pestañas** del mismo navegador: `initMultitabSync.ts` re-hidrata cada
  store cuando otra pestaña escribe. **Tiene que listar TODOS los stores.**

---

## ✅ Hecho recientemente

- [x] **Listas guardadas (smart lists) en Tareas** (Claude directo, verificado corriendo la app):
  Debajo de Recurrentes/Papelera hay una sección **"Listas"** donde el usuario arma vistas
  propias que **cruzan todos los proyectos**. Cada lista combina criterios —etiquetas,
  prioridad, vencimiento (hoy / vencidas+hoy / esta semana)— con modo **"Cualquiera" (OR)**
  o **"Todos" (AND)**. Ej: "Software" (tag=software) o "Hacer hoy" (vence hoy O urgente).
  - **Modelo/estado:** `SavedTaskView` + motor puro `taskMatchesView` en
    `lib/tasks/savedViews.ts`. Viven en `taskUiStore.savedViews` (acciones add/update/delete).
  - **Sync multi-device:** viajan en el blob `app_preferences` (merge por-campo), igual que
    `hiddenProjects` — agregado a `appPrefsFields()` y `applyPrefsFieldsInner()` en `sync.ts`.
    **Sin migración** (el blob es jsonb).
  - **UI (`TasksPage`):** sentinel `__view__:<id>` (como `__archive__`/`__recurring__`);
    la vista deshabilita los filtros del toolbar (la lista ES el filtro) y renderiza una
    lista PLANA con badge de proyecto. Modal `SavedViewModal` para crear/editar (nombre,
    tags, prioridad, vencimiento, modo any/all). Botón "+" en la sección Listas.
  - **Verificado:** "Software" muestra 2 tareas de 2 proyectos distintos; "Hacer hoy" (OR)
    trae urgente + vence-hoy; crear desde el modal persiste, auto-abre y filtra. `tsc` OK.

- [x] **Tanda de 7 mejoras de Tareas + KPIs + Mapas** (Claude directo, verificado corriendo la app):
  1. **Orden alfabético inverso (Z→A):** nuevo modo `alphabeticalReverse` en
     `lib/utils/taskSort.ts` (subtasks) + `sortTasks` de `TasksPage` + opción en el
     dropdown ("Alfabético A→Z" / "Z→A"). Verificado: opción presente.
  2. **Favoritos en subtasks (⭐):** campo `favorite?` en `Subtask` (`types/index.ts`),
     acción `toggleSubtaskFavorite` (bumpea `updatedAt` de la madre → merge LWW), toggle
     en el menú ⋯ de la subtarea + estrella persistente en la fila. **Sync:** push/pull de
     `subtasks.favorite` en `sync.ts`. **Panel "Favoritas" del Dashboard** ahora lista
     también las subtasks favoritas SOLAS, con su proyecto + tarea madre ("en X").
     **Requiere `migration_subtasks_favorite.sql`.** Verificado: estrella + aparece en panel.
  3. **Botón `+` directo en la card:** acceso rápido para agregar subtarea sin abrir el
     menú ⋯ (antes había que desplegarlo). Verificado: 1 botón directo por card.
  4. **Etiquetas (tags) transversales a proyectos:** campo `tags?: string[]` en `Task`,
     editor de etiquetas en `TaskDetail` (chips removibles + autocompletado de tags
     existentes), chips `#tag` en la `TaskCard`, y **filtro "Etiqueta"** en el toolbar
     (multi-select, persistido). En "Todos los proyectos" el filtro **cruza proyectos** →
     ves juntas todas las tareas de una etiqueta. **Sync:** push/pull de `tasks.tags`
     (jsonb). **Requiere `migration_tasks_tags.sql`.** Verificado end-to-end: filtrar
     "software" muestra tareas de 2 proyectos distintos y oculta las demás.
  5. **Mapas mentales — bug de formato al salir de edición:** el `<textarea>` preservaba
     los saltos de línea pero el display de los nodos normales colapsaba los `\n` ("se
     ponía todo junto"). Fix de 1 línea: `whitespace-pre-wrap` en el display del nodo
     (`MindMapCanvas.tsx`). El texto nunca se perdía — era CSS.
  6. **Bloqueo de completar en cascada:** una subtarea que tiene subtareas internas sin
     completar ya NO se puede marcar hecha (espeja el bloqueo de la madre). Check
     deshabilitado con tooltip "Faltan subtareas internas por completar". Un-completar
     sigue permitido. Verificado: madre-con-hijas deshabilitada, hojas habilitadas.
  7. **KPIs — un SPI nuevo arranca SIN KPIs seleccionados:** se sacó la auto-herencia de
     `selectedKpiIds` en `createOrOpenCurrentWeek` (`spiStore.ts`). Antes una semana nueva
     heredaba los KPIs de la anterior (venían pre-encendidos); ahora arranca vacía y el
     usuario los enciende a mano cada semana. Verificado: sesión nueva `selectedKpiIds:[]`,
     no hereda de la vieja.

⚠️ **PENDIENTE del usuario — correr 2 migraciones NUEVAS en Supabase** (hasta correrlas, el
push de tareas/subtareas FALLA por columna desconocida y el sync de tareas se corta):
`supabase/migration_subtasks_favorite.sql` y `supabase/migration_tasks_tags.sql`.

- [x] **Recurrentes — mover una serie entre proyectos ya no la parte** (Claude directo, verificado corriendo la app):
  - **Bug:** `moveTask` movía UNA sola tarea (cambiaba `projectId`+`status`). Al mover
    un miembro de una serie recurrente, la serie quedaba **partida entre dos proyectos**;
    como el 🔁 solo se dibuja cuando `groupRecurringSeries` junta 2+ miembros en la lista
    de UN proyecto (una `TaskCard` suelta NO tiene indicador de recurrencia), los miembros
    quedaban en grupos de 1 → **ambos perdían el icono** y la tarea "aparecía duplicada"
    (una por proyecto). En **Recurrentes** seguían juntas porque ahí se agrupa por
    `recurringHeadId` global.
  - **Fix** (`lib/store/tasksStore.ts`, `moveTask`): ahora es *series-aware*. Si la task
    movida participa de una serie (`recurrence` o `recurringHeadId`), mueve **TODA la
    serie** (madre + instancias, incluidas completadas/archivadas) al proyecto destino,
    matcheando miembros con el MISMO criterio que `removeRecurringSeries` (por
    `recurringHeadId`, con fallback legacy `projectId`+título normalizado). Preserva
    `recurringHeadId`/`recurrence`/`subtasks` y la done-ness de cada miembro (no re-abre
    completadas). Saca los ids de los `taskIds` de **cualquier** proyecto (por si ya venía
    splinterado) y los agrega al destino.
  - **Multi-device (BASE nº1):** bumpea `updatedAt` en cada miembro movido (antes NO lo
    hacía → el pull podía pisar el cambio de `projectId` con una copia remota más vieja;
    en el pull `project.taskIds` se recomputa desde `project_id`, así que la verdad es
    `projectId`+`updatedAt`). Sin migración (solo se reescriben campos que ya existían).
  - **Verificado corriendo la app (sin auth):** serie daily de 10 tareas en PROJ →
    mover a DEST desde TaskDetail → los 10 miembros quedan en DEST con `recurringHeadId`
    intacto, PROJ vacío (sin fantasma), DEST muestra UNA fila de serie con 🔁 (no 10
    cards sueltas), la instancia completada mantuvo Done+completedAt. `tsc --noEmit` OK.

- [x] **Ofertas — arrastrar renglones (Notion) + doble-click «convertir a texto»** (Claude directo, verificado corriendo la app):
  - `lib/offers/blocks.ts`: dos funciones PURAS nuevas — `unwrapBlock` (desarma un
    toggle/page: su título pasa a párrafo y sus hijos suben un nivel EN SU LUGAR;
    los hijos conservan su tipo → un desplegable interno sigue siendo desplegable
    pero afuera) y `moveBlock` (mueve un renglón antes/después de otro a cualquier
    nivel, con guarda anti-ciclo). Reverso conceptual de `convertSelection`.
  - `components/offers/OfferDoc.tsx`: DnD estilo Notion — manija de arrastre
    (`GripVertical`, hover, ÚNICO elemento draggable para no romper la selección
    del textarea) + indicador de drop (línea inset arriba/abajo) + estado `dnd`
    en OfferDoc que baja por props a todo el árbol (reordena dentro/fuera de
    desplegables). Doble-click en la barra del desplegable o en la tarjeta de
    página → `unwrapBlock`. La página usa timer 220ms para separar «abrir» (1
    click) de «convertir» (doble). Aplica a las notas del sistema Y al doc de
    cada oferta (mismo componente) y adentro de páginas anidadas.
  - **Sync:** SIN cambios ni migración — solo se reordenan/reacomodan campos que
    ya existían (`type/text/children/collapsed`); `sanitizeOfferBlock` ya los
    preserva recursivo (BASE nº2). Las mutaciones pasan por `setSystemDoc`/
    `setOfferDoc` (ya bumpean `updatedAt`).
  - **Verificado:** 15 asserts puros OK (`npx tsx lib/offers/blocks.test.ts`);
    corriendo la app: 5 grips renderizados, doble-click página→texto (hijos
    preservados, toggle interno queda afuera), doble-click desplegable→texto,
    drag reordena end-to-end, sin errores de consola. `tsc` OK.

- [x] **Subtareas — menú de acciones (⋯)** (Claude directo, verificado): mismo
  tratamiento que la card madre. Los botones sueltos de la fila de subtarea
  (↶/↗ promover/sacar del grupo · «+» · detalle · 🗑) colapsan en un dropdown
  `SubtaskActionsMenu` (portal), dejándole ancho al título. Los chips de
  prioridad/estado/fecha quedan afuera (edición rápida). Ítems según sea
  subtask1 (promover/agregar) o subtask2 (sacar del grupo). Verificado corriendo
  la app: menú abre con los ítems correctos, cierra y ejecuta (abre detalle).

- [x] **Tareas favoritas (⭐) — full-stack + widget en Dashboard** (Claude directo, verificado corriendo la app):
  - Campo `favorite?: boolean` en `Task` (`types/index.ts`). Store `tasksStore`:
    `toggleFavorite(id)` (bumpea `updatedAt` → merge LWW propaga) + `sendTaskToTop(id)`
    (mueve al inicio de `taskIds`, visible solo en orden "manual").
  - **Sync (BASE nº1/2):** `favorite` agregado al **push** (`favorite: t.favorite ?? false`)
    y al **pull/sanitize** (`favorite: (t.favorite as boolean) ?? undefined`) en `sync.ts`.
    Multitab ya cubierto (viaja en el blob `overseer-tasks`). **Requiere
    `migration_tasks_favorite.sql`** (`ALTER TABLE tasks ADD COLUMN favorite`) — la tabla
    `tasks` usa columnas reales, NO payload jsonb, así que sí hace falta migración.
  - **TaskCard — menú de acciones (⋯):** los 6 botones sueltos (que le comían ancho al
    título en Kanban) colapsan en un único dropdown por portal (`TaskActionsMenu`): abrir
    detalle · agregar subtarea · ⭐ favorito · enviar arriba · duplicar · copiar checklist ·
    postergar · **calendarizar con fecha + hora inline** · eliminar. Estrella persistente
    (glanceable, sin hover) cuando la tarea es favorita. Reemplazó a `TaskScheduleButton`.
  - **Dashboard — widget "Favoritas":** `FavoriteTasksPanel` (nuevo, registrado en `WIDGETS`
    de `DashboardPage`, se apila al final → additivo, no rompe cuentas existentes por BASE nº4).
    Lista todas las tareas ⭐ (cualquier proyecto), pendientes primero, con checkbox para
    completar/re-abrir desde ahí y estrella para quitar de favoritas.
  - **Verificado corriendo la app (BASE nº5):** menú abre con todos los ítems + fecha/hora
    inline; toggle favorita persiste (`favorite:true`, `updatedAt` bumpeado) y muestra estrella;
    widget lista la tarea, completar la marca Done (line-through, al fondo), quitar de favoritas
    la saca. `tsc --noEmit` OK + `next build` OK. (Los errores de hidratación en consola son
    pre-existentes — script de tema en `app/layout.tsx`, ajenos a este cambio.)
  - **NO se tocó `ARCHITECTURE.md`** (no es dominio nuevo ni patrón transversal — §1.2).

- [x] **Recurrentes — blindaje del `recurringHeadId` (incidente + fix)** (Claude directo):
      Tras el deploy de subtareas, las series recurrentes del usuario aparecieron
      **separadas** (cada instancia como tarea suelta). Autopsia línea por línea: el
      feature de subtareas NO tocaba recurrentes — fue un **clobber de sync multi-device**
      que borró el `recurringHeadId` de las instancias. El bug latente: `migrateRecurringHeads`
      (auto-heal en cada mount) exigía `recurrence` en la tarea, pero las **instancias no la
      llevan** (agrupan solo por `recurringHeadId`), así que una instancia clobbeada quedaba
      suelta para siempre. **Fix:** ampliado para re-linkear instancias por `proyecto+título`
      a una madre que aún tenga `recurrence`, con guarda anti-absorción (una tarea sin
      recurrence solo se absorbe si tiene `dueDate`). Idempotente. **Verificado corriendo la
      app:** instancia stripped → re-linkeada + serie re-agrupada; one-off sin dueDate NO
      absorbido; heal persiste entre reloads. Repara datos existentes y previene a futuro.
- [x] **Task Manager — subtareas anidadas SIN límite + importar listas** (Codex,
      auditado+verificado por Claude corriendo la app):
  - Árbol de subtareas **recursivo** (antes tope de 2 niveles). `lib/tasks/subtaskTree.ts`
    (build + `collectDescendantSubtaskIds` + `isDescendantSubtask`, cycle-safe) con test.
  - Render recursivo en `TaskCard` con **letra `text-base` (16px) a TODO nivel** (no se
    achica al anidar) e indent 16px/nivel (tope visual depth 6). Verificado en DOM: 4
    niveles, 16px parejo.
  - Drag multinivel con **prevención de ciclos** (no soltar en un descendiente), **delete
    en cascada** del subárbol, y promoción/conversión que **preserva el subárbol** (remapea
    ids manteniendo la cadena de `parentId`).
  - **Importar/pegar lista jerárquica** (`ImportOutlineModal` + `lib/tasks/parseOutline.ts`
    con test): indent primario; si no hay sangría, heurística de emojis (emoji=tarea madre,
    emoji-número=subtask1, sin emoji=subtask2). Limpia `Hacer/Copied/Anotacion` y ruido de
    export (TickTick). Preserva orden. Verificado en DOM con lista real.
  - Sync: `sync.ts` ordena las subtasks **padres-antes-que-hijos** antes del upsert (por el
    FK `subtasks_parent_id_fkey`); pull preserva `parentId`+`order`. **Sin migración nueva**
    (el FK ya es self-referente). Fecha de tarea ahora con día de semana (`EEE d MMM`).
- [x] **ETAPA 6 — Seguimiento de Libros** (Codex): sección `/libros` nueva
      (opcional en el nav, oculta por default para cuentas existentes — migrate
      appStore v6→v7). Estados Quiero leer/Leyendo/Leído, alta rápida, fechas y
      notas. Sync per-fila (tabla `books`) + multitab. Verificado: crear libro
      persiste. **Correr migration_books.sql.**
- [x] **ETAPA 5 — Plantillas de Ofertas** (Codex): guardar el doc de una oferta
      como plantilla global reutilizable y aplicarla a otra. Clona con ids
      frescos (no comparte referencias), aplica appendeando (o reemplaza si el
      doc destino está vacío). Sync per-fila (tabla `offer_templates`) + endurece
      el sanitize del doc de ofertas (recursivo, valida tipos, preserva children/
      collapsed). Verificado end-to-end: guardar→aplicar copia estructura+
      contenido sin tocar el original. **Correr migration_offer_templates.sql.**
- [x] **ETAPA 4 — Mapas Mentales / Content Strategy / Estudio:**
  - Content Strategy → mapa mental: ya estaba (`ensureProfileMindMap`), no se tocó.
  - **Nodo solo-texto** (Codex): shape `'text'` sin borde/fondo/caja, grabbable
    por el texto. Verificado: borde 0px / bg transparente / sin sombra.
  - **Pinch-to-zoom mobile** (Codex): 2 dedos, clamp ZOOM_MIN/MAX, anclaje al
    punto medio, guards que suprimen pan/drag/select/box-select. Gesto real
    multitouch NO probado (necesita device); typecheck/build OK.
  - **Estudio ↔ conceptos** (Codex): `reconcileStudyConceptMap` auto-sync —
    Parcial→Concepto (parcialId), Tema→nota (temaId), agrupadas cerca del
    concepto. Idempotente, borra huérfanos, preserva nodos libres. Verificado
    end-to-end. sanitize del pull preserva parcialId/temaId (BASE nº2).
- [x] **ETAPA 3 — Google Calendar:**
  - Recordatorios: ya estaban implementados (nativos GCal, crear/editar,
    5/10/15/30/1h/1día) → NO se tocaron (evitar duplicar).
  - **Convertir evento en tarea** (nuevo, hecho por Codex): botón en el modal de
    evento GCal real. Flujo seguro: crea la tarea en el proyecto "Calendario"
    (find-or-create), confirma que persistió, y RECIÉN AHÍ borra el evento. Si
    el borrado falla, la tarea queda intacta y muestra banner claro. Timezone
    local para dueDate/dueTime, duración = fin−inicio.
- [x] **ETAPA 2 — Priority Gate global:** una sola fuente de verdad
      (`usePriorityGate()`, hecho por Codex) + un wrapper visual reusable
      (`<PriorityGate>`) que difumina/bloquea el contenido y muestra el overlay
      violeta. Aplicado en Panel (refactor de `DailyAgendaCard`), Task Manager y
      Calendario. El sidebar queda usable para ir al Panel a completar.
- [x] **ETAPA 1 — Estabilidad del core:**
  - [x] Proyectos ocultos ahora sincronizan multi-device (viajan en el blob
        `app_preferences`, antes eran local-only en taskUiStore).
  - [x] Subtareas nuevas caen al FINAL (`order = max+1`, sin colisiones) y los
        procesos respetan el orden de inserción (desempate por `order`, no por
        título, en `sortSubtasks`).
  - [x] Modo claro/mobile: detalle de tarea ya no queda oscuro; X respeta
        safe-area de iOS; dots de hábitos dejan de verse negros; botón de
        selector de proyecto legible.
  - [x] Calendario: matemática de tiempo extraída a `lib/calendar/timeMath.ts`
        con tests que fijan el invariante (delta múltiplo de 15, sin corrimiento
        de minutos). Sin cambio de comportamiento.
- [x] Sync entre pestañas para **todos** los stores (arregla ofertas que
      desaparecían al tener 2 pestañas abiertas) — `f4c5d36`
- [x] Onboarding: el recorrido ya no te saca de la sección donde estás; y
      `onboardingDone` es trinquete en el merge — `66a5d13`
- [x] Sidebar respeta el área segura de iOS en el drawer (notch) — `4a84e4a`
- [x] Billetera: colapsar wallets + ojito para ocultar saldos — `b5e7c79`
- [x] Merge **por campo** de `app_preferences` (arregla el borrado de config
      multi-dispositivo) + registro de BASES — `b853832`, `71a4920`
- [x] Estudio: el mapa de conceptos deja de comerse la pantalla en mobile
- [x] Notificaciones: el cron deja de pasar en verde cuando el dispatcher falla

## 🔜 Próximos pasos

### ⚠️ Pendientes del usuario (Claude no puede hacerlos)

- [ ] **Correr 3 migraciones en Supabase** (SQL Editor), si no las ofertas /
      YouTube / carpetas de mapas no sincronizan entre dispositivos:
  - [ ] `supabase/migration_offers.sql`
  - [ ] `supabase/migration_youtube.sql`
  - [ ] `supabase/migration_mindmap_folders.sql`
- [ ] **Arreglar el `CRON_SECRET`**: el dispatcher de notificaciones devuelve
      401. El valor en la env var de Vercel no coincide con el secret de GitHub
      Actions. El log del próximo run dice de qué lado falta.
- [ ] **Rehacer la config del sidebar** que se había borrado — recién DESPUÉS
      de que los dos dispositivos tengan el build nuevo, si no se puede volver a
      pisar.

### 💤 Abierto / a decidir

- (vacío por ahora — agregar acá lo que vaya surgiendo)

---

## 📝 Notas

- Verificar SIEMPRE corriendo la app sin auth
  (`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npx next dev -p 3099`)
  y **apagar el server al terminar**. Ver BASE nº5.
- Puerto de dev de prueba: **3099**.
