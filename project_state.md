# 📔 Estado del Proyecto — Overseer Life OS

> Bitácora viva. Cambia todo el tiempo. Claude la lee al empezar cada chat
> (se carga sola vía `CLAUDE.md`) y la actualiza al terminar cada cambio.
> El método de trabajo está en [`instructions.md`](instructions.md); las reglas
> técnicas no negociables en [`AGENTS.md`](AGENTS.md).

**Última actualización:** 2026-08-29 · **Roadmap:** 7 etapas. **Etapas 1–6 COMPLETAS.** **Etapa 7 (Dashboard) DESCARTADA por decisión del usuario** (no quiso cambios). Roadmap cerrado. Extra post-roadmap: **Tareas favoritas** (⭐).

✅ **Bridge con Claude EN FUNCIONAMIENTO** (2026-08-29): migraciones corridas, deployado y
verificado contra la cuenta real — token "pc franzix" resuelve, `list_projects` devuelve los 6
proyectos y `get_agenda` trae los eventos de Google Calendar con los huecos libres bien calculados.

✅ **Migraciones de tareas:** el usuario confirmó (2026-08-28) que ya corrió
`migration_tasks_favorite.sql`, `migration_subtasks_favorite.sql` y `migration_tasks_tags.sql`.
Quedan sin confirmar `migration_offer_templates.sql` (Etapa 5) y `migration_books.sql` (Etapa 6).
Igual, desde el fix del 2026-08-28 una migración sin correr **ya no corta el push** del dominio
(se descarta esa columna y se sincroniza el resto, con toast avisando cuál falta).

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

- [x] **El token vencido rompía el push ("Sync push failed: JWT expired · PGRST303")** (Claude directo):
  Reporte: toast rojo con ese texto crudo. El access token de Supabase dura **una hora**: con la app
  abierta de fondo (o el cel en el bolsillo) caduca, y el primer push que sale después rebota.
  - **Lo que hacía mal:** el error se trataba como un fallo real → toast crudo de PostgREST (que no
    le dice nada al usuario) **y el push se perdía**. El cambio quedaba marcado unsynced y no se
    reintentaba hasta el próximo foco de la app (`tryAutoPull`, throttle de 30s), que puede ser
    mucho después. Lo irónico: `reportSyncError` YA validaba la sesión y `getSession()` renueva el
    token — o sea que el mismo push, corrido un milisegundo después, funcionaba. Solo faltaba
    volver a correrlo.
  - **Fix:** `lib/supabase/authRetry.ts` (puro, con test) + `runPush()` en sync.ts. Si el push falla
    por token vencido: renueva la sesión y **reintenta UNA vez**. Aplicado al push debounceado
    (`schedule`) y al flush de `visibilitychange`/`pagehide`.
  - **Acotado a propósito:** solo `PGRST303`/`PGRST301` y los mensajes de JWT vencido/inválido. Una
    migración que falta, una policy de RLS, un 401 pelado o un corte de red se comportan igual que
    antes. Y si el reintento VUELVE a fallar, se avisa (BASE nº6): sesión muerta → toast con CTA
    "Volver a entrar"; token rechazado con sesión viva → mensaje en castellano en vez del PGRST.
  - Si `refresh()` explota (red caída) **no** se desloguea al usuario: se devuelve el error original
    y se reintenta en el próximo ciclo. Desloguear por un problema de conexión sería peor.
  - También se silencia el toast en los call sites internos (`tasks upsert failed: JWT expired`, que
    reportan ANTES de tirar el error): si no, el cartel salía igual aunque el reintento anduviera.
  - **Sin migración.**
  - **Verificado:** `lib/supabase/authRetry.test.ts` 30/30 (el caso reportado, los errores que NO se
    reintentan, sesión muerta, doble fallo, refresh que explota). `upsertTolerant` 13/13,
    `tombstonePush` 7/7, `staleGuard` 17/17 sin romperse. Corriendo la app, las dos salidas visibles:
    el toast del token rechazado renderiza el texto nuevo, y el de sesión muerta muestra el botón
    "Volver a entrar →" apuntando a `/login`. `tsc` + `next build` OK.
  - **NO verificado:** el round-trip real (esperar a que caduque un token contra Supabase). El modo
    sin auth no tiene backend, así que la lógica está cubierta por tests puros y el cableado por
    tipos. Se confirma en uso: el toast de `JWT expired` no debería volver a aparecer.

- [x] **Calendario: los eventos solapados ya no se tapan** (Claude directo, verificado corriendo la app):
  Reporte: dos eventos de Google Calendar a la misma hora se superponían y no se veía nada.
  Causa: cada bloque se dibujaba con `absolute left-1 right-1` — ancho COMPLETO de la columna
  del día — así que el último dibujado tapaba a los de abajo.
  - **`lib/calendar/overlapLayout.ts`** (puro, con test): agrupa los bloques que se pisan en
    clusters, asigna a cada uno la primera columna libre y reparte el ancho (1/columnas). Trabaja
    sobre la geometría YA calculada (top/height en px), no sobre horas, porque la vista clipea
    los eventos que caen en horas ocultas y esa es la posición real.
  - Reusar la columna libre importa: con A(9-10), B(9:30-10:30) y C(10:15-11), A y C no se tocan
    → comparten columna y el cluster usa 2 anchos, no 3.
  - Los eventos que no comparten franja con nadie **siguen a ancho completo** (no se achica todo
    el calendario por un solape suelto).
  - Mientras se ARRASTRA un bloque vuelve a ancho completo: se lee mejor y, sobre todo, el
    `translateX(dayShift * 100%)` del drag horizontal vuelve a valer un día exacto (con un bloque
    al 50% habría movido medio día).
  - **Sin migración.**
  - **Verificado:** `lib/calendar/overlapLayout.test.ts` 21/21. En la app, con 3 tareas a las
    14:00/14:30 y una suelta a las 17:00, medido en el DOM: las tres solapadas quedan en
    left 357 / 389 / 422 con 28px cada una, y la suelta conserva los 89px de la columna.
    `tsc` + `next build` OK.

- [x] **El push resucitaba lo borrado desde el bridge (subtareas que "vuelven solas")** (Claude directo):
  Reporte desde el otro chat: Claude borró por MCP la subtarea "Comprar las cuentas de fondeo"
  (borrado OK, con tombstone) y volvió a aparecer.
  - **Causa (verificada leyendo el ciclo de sync):** `pushTasks` hacía un upsert CIEGO de todo el
    store — no consultaba `deleted_rows`. Con la app abierta, el cliente no pullea (el pull corre
    al iniciar, al volver el foco/visibilidad o al recuperar red), así que sigue teniendo la fila
    en memoria: cualquier edición dispara un push que la **re-inserta en Supabase**. El
    tombstone protegía el PULL (lo que ves) pero nada protegía el UPSERT (lo que se escribe), y
    el bridge lee la BD → la ve viva otra vez.
  - **Fix:** el push ahora aplica los tombstones antes de subir (`isTombstoned` en syncMerge, el
    mismo criterio del merge): descarta esas filas del upsert, las saca de los ids que van a
    `syncDeletes` (si contaran como locales, el borrado no se propagaría) y las **limpia del
    store local** para no arrastrar el fantasma hasta el próximo pull.
  - Criterio: subtareas (sin `updatedAt` propio) → cualquier tombstone las mata, igual que en el
    pull; tareas → solo si el borrado es POSTERIOR a la última edición local (si la editaste
    después, la revivís a propósito).
  - **Sin migración.**
  - **Verificado:** `lib/supabase/tombstonePush.test.ts` 7/7 (incluye el caso real del bridge),
    `promoteSubtask` 14/14 y `recurringSeries` 23/23 sin romperse. `tsc` + `next build` OK.
  - **NO verificado:** el round-trip real contra Supabase (no hay backend en el modo sin auth).
    Se confirma en uso: borrar por el bridge con la app abierta ya no debería rebotar.

- [x] **Notificaciones: no llegaban porque el cron NO corre cada 5 minutos** (Claude directo, medido contra la API de GitHub):
  El `CRON_SECRET` ya estaba bien — todos los runs del workflow salen en **success**. El problema
  era otro: GitHub Actions **no cumple el `*/5 * * * *`**. Medido sobre los últimos 20 runs
  reales: intervalos de **111 a 700 minutos** (≈5 corridas por día en vez de 288). Con
  `WINDOW_MIN = 5` ("¿estamos dentro de los 5 min del horario target?"), casi ninguna corrida
  caía en la ventana → no se mandaba prácticamente nada, y en verde (BASE nº6).
  - **Fix (catch-up):** el criterio pasa a ser *"¿ya pasó la hora y todavía no se mandó?"*
    (`shouldFireDaily`, catch-up de 6 h, sin cruzar medianoche porque la dedupe key es por día
    local). Lo que evita duplicados es la idempotencia (`notification_log` + dedupe key), que
    ya existía — no la ventana. Aplicado a los 5 canales de hora fija.
  - **`task_due`:** vale desde `fireAt` hasta el vencimiento real (`shouldFireUntil`) en vez de
    5 min, y el texto usa los **minutos reales** que faltan (`minutesUntil`), no el lead
    configurado — si no, un aviso atrasado decía "vence en 60 min" siendo mentira.
  - **Puntualidad:** `vercel.json` ahora tiene un cron DIARIO (00:10 UTC = 21:10 ART) como piso
    garantizado (Hobby permite 1/día) que cubre el recordatorio de las 21:00. Para que lleguen
    puntuales hace falta un cron externo real cada 5 min (cron-job.org, gratis) — pasos exactos
    documentados en `.github/workflows/notifications-cron.yml`. Los tres pueden convivir: la
    idempotencia impide duplicados.
  - **`/api/notifications/diagnose`** quedó alineado con el nuevo criterio (antes explicaba una
    ventana de ±5 min que ya no existe).
  - **Sin migración.**
  - **Verificado:** `lib/notifications/timeWindow.test.ts` 20/20, incluido el escenario real con
    las horas de corrida medidas del workflow. `tsc` + `next build` OK.
  - **NO verificado:** el envío real end-to-end (necesita el backend con VAPID + suscripción del
    celu). Se comprueba solo cuando esté deployado: la próxima corrida del cron debería mandar
    lo pendiente del día.

- [x] **Bridge verificado end-to-end + zona horaria que ya no falla callada** (Claude directo):
  Conectado contra la cuenta real por primera vez. `list_projects` devolvió los 6 proyectos con sus
  estados (que resultaron estar en INGLÉS: "To Do"/"In Progress" — bien que `resolveStatus` los lea
  del proyecto en vez de asumir) y `get_agenda` trajo Google Calendar con los huecos correctos:
  sábado 29/08 → 375 min libres en 6 tramos, con "Almorzar" 12:30 y "Entrenamiento" 18:00–19:30
  descontados junto con las anclas de `idealSchedule`.
  - **Detalle que confunde al leer los datos:** los eventos de Google vuelven con offset `+02:00`
    (la zona del calendario del usuario está en Europa), no en hora de Buenos Aires. Los instantes
    absolutos son correctos y todo el cálculo trabaja sobre epoch, así que no afecta nada — pero al
    inspeccionar a mano hay que convertir bien, no restarle 3 horas al string.
  - **Fix real encontrado ahí:** `tzOffsetMinutes` hacía `catch { return 0 }`. Si la zona no
    resolvía, el planificador entero se corría 3 horas **sin decir nada** y el plan parecía
    simplemente mal pensado (BASE nº6). Ahora es `tzOffset()` en `freeSlots.ts` (puro y testeado),
    devuelve `{ minutes, resolved }`, y `get_agenda` agrega `timezoneError` cuando no resuelve.
    Importa porque la zona guardada del usuario es `America/Buenos_Aires`, un alias DEPRECADO de
    IANA: hoy resuelve, pero es exactamente el valor que un día puede dejar de hacerlo.
  - **Verificado:** `freeSlots.test.ts` 37/37 (7 nuevos de `tzOffset`: canónico, alias deprecado,
    UTC, Madrid, zona inventada, string vacío). `taskInput` 45/45. `tsc` y `next build` OK.

- [x] **Bridge: crear tareas, tareas con horario en el calendario, y recurrentes completas** (Claude directo, verificado corriendo la app):
  Pedido: "desde el chat poder agregar tareas por proyecto, tareas con horario para que se vean
  en el calendario **de Overseer** (no GCal), y revisar / crear / hacer recurrentes, todo completo".
  4 herramientas nuevas: `list_projects`, `get_recurring_series`, `create_task`, `set_task_recurrence`.
  - **`create_task`** — proyecto, título, prioridad, importancia, fecha, hora, duración, energía,
    etiquetas, ⭐, subtareas y recurrencia, todo en una llamada. Es seguro por un motivo puntual y
    verificado: el pull **recomputa `project.taskIds` desde `project_id`**, así que la fila insertada
    del lado server aparece sola en su tablero.
  - **Estado inicial resuelto contra el proyecto real.** `tasks.status` es NOT NULL SIN default y
    cada tablero tiene sus propios estados (los del usuario están en español). Hardcodear "To Do"
    metía la tarea en una columna inexistente → `resolveStatus` usa los del proyecto destino y
    avisa si el pedido no existía.
  - **Calendario de Overseer:** una tarea se dibuja como bloque solo con `dueDate` **Y** `dueTime`
    (`CalendarPage`). La respuesta devuelve `showsInCalendar` para decirlo en vez de que el usuario
    se pregunte por qué no la ve.
  - **Recurrentes — el reparto que evita el bug histórico:** *el server escribe la REGLA, el cliente
    genera las INSTANCIAS*. Los ids de spawn son deterministas y los calcula el cliente; si el
    server inventara filas, dos dispositivos generarían copias distintas y el merge las sumaría.
    Al CAMBIAR una regla con instancias ya generadas, el server deja `recurrence.rebuildAt` y
    `TasksPage` al montar corre `rebuildRecurringChain` y limpia la marca. **Detener** saca la regla
    de la madre Y de sus instancias (si queda en una, vuelve a sembrar la serie). Cambiar la regla
    de una INSTANCIA se rechaza con el id de la madre en el mensaje.
  - **Sin migración** (`recurrence` es jsonb, así que `rebuildAt` viaja sin tocar el esquema; el
    pull copia `recurrence` entero, no campo por campo, así que la marca sobrevive — BASE nº2).
  - **Verificado:** `lib/mcp/taskInput.test.ts` 45/45 (estados en español, recurrencia inválida que
    FALLA en vez de arreglarse sola, fecha+hora → calendario, ids sin `__` para no chocar con el
    spawn de subtareas recurrentes). Corriendo la app, el handshake completo: sembré una madre con
    regla nueva `weekly[lunes]` + `rebuildAt` y 4 instancias viejas `daily` → al abrir Tareas las 4
    se nukearon, quedó **una instancia el lunes correcto**, el marcador se limpió, `updatedAt` se
    bumpeó y la UI muestra **una sola fila "Backtesting sesh · 0/2 hechas"**. `tsc` y `next build` OK.
  - **NO verificado:** `create_task` contra Supabase real (el modo sin auth no tiene backend); su
    validación está cubierta por los tests puros.

- [x] **Bridge con Claude + Plan del día ("second brain")** (Claude directo, verificado corriendo la app):
  Pedido: "vincular Claude con mi cuenta de Overseer para que analice todas mis tareas y me arme
  un orden de acción día por día". Decisión clave del usuario: **NO usar la API key de Anthropic**
  (facturada por uso) sino su **suscripción ya paga**. Consecuencia de diseño: la app **no llama a
  ningún LLM** para esto — el razonamiento lo pone Claude desde afuera y la app solo expone los
  datos y recibe el plan.
  - **Servidor MCP propio** (`app/api/mcp/route.ts`, JSON-RPC 2.0 sobre HTTP, sin SDK nuevo) con 7
    herramientas: `get_agenda` (huecos libres YA calculados), `get_tasks`, `get_planner_profile`,
    `get_plan_history`, `save_day_plan`, `schedule_task`, `update_planner_profile`.
  - **Token personal** (`mcp_tokens`, se guarda solo el sha256, revocable) + UI en Configuración →
    **Conexión con Claude**, que muestra el token una vez y el comando `claude mcp add` listo.
  - **Export read-only** (`/api/export/brief?token=`) con el mismo contenido en un GET, como puente
    sin configurar MCP.
  - **Dominio nuevo `dayPlan`** (playbook completo: store + push/pull/sanitize/merge + tombstones +
    baseline + multitab + migración) con id **determinista** `plan_<fecha>` — un plan por día, así
    dos dispositivos convergen en vez de sumar copias. Widget **"Plan de hoy"** en el Panel
    (apilado AL FINAL por BASE nº4), con el `reason` de cada bloque desplegable.
  - **`plannerProfile`** (lo que aprende) en el blob `app_preferences`, sellando `_t.plannerProfile`
    del lado server para que el push del cliente no lo pise. Editable a mano en Configuración.
  - **Escritura acotada a propósito:** el bridge NO borra nada, no toca recurrentes, subtareas,
    `archivedAt`, `completedAt`, `status` ni `projectId`. Solo `day_plans`, 4 campos escalares de
    tarea y el perfil. Todo write bumpea `updated_at`.
  - **Requiere 2 migraciones:** `migration_mcp_tokens.sql` y `migration_day_plans.sql`.
  - **Verificado:** `lib/mcp/freeSlots.test.ts` 30/30 (solapados, desordenados, recortes a la
    ventana, día lleno, huecos < 15min, offsets de zona). Corriendo la app sin auth: la sección
    de Configuración renderiza y falla ruidoso sin backend, el widget muestra 4 bloques con
    contador 1/4 → tildar lo lleva a 2/4 y **bumpea `updatedAt`**, el ⓘ despliega el porqué.
    `/api/mcp` sin token = **401**; con token y sin base = **503** (no se confunde token inválido
    con backend caído). `tsc --noEmit` y `next build` OK.
  - **NO verificado:** el round-trip real contra Supabase y el handshake MCP con un cliente real
    — el modo sin auth no tiene backend y las migraciones todavía no están corridas.

- [x] **Kanban: agregar tareas desde el tablero** (Claude directo, verificado corriendo la app):
  Reporte: "no puedo agregar tareas en kanban". Reproducido: en **Todos los proyectos + kanban**
  el botón "New Task" no hacía NADA — el form pedía `activeProject` (null en esa vista), así que
  no se renderizaba nunca. En kanban de un proyecto sí abría, pero arriba de todo.
  - **Fix del bug:** el form ya no exige `activeProject`; en Todos los proyectos aparece con un
    `<select>` de proyecto destino (los visibles) para saber dónde cae la tarea.
  - **Alta por columna (`KanbanQuickAdd`):** al pie de CADA columna hay un "+ Nueva tarea" que
    abre un input inline y crea con el status de esa columna (Enter crea y queda abierto para
    encadenar varias; Esc cierra). Es lo que uno espera de un tablero.
  - **Verificado:** en Todos los proyectos + kanban el botón ahora abre form + selector y la
    tarea se crea; en el kanban de un proyecto, "Nueva tarea" en la 2da columna creó la tarea
    con status "Haciendo". `tsc` + `next build` OK.

- [x] **Mapas mentales: el doble-click crea nodo SOLO TEXTO** (Claude directo, verificado):
  Pedido: al hacer doble click que nazca como texto suelto y poder ponerle bordes después.
  `onCanvasDoubleClick` ahora aplica `setNodeShape(..., 'text')` al nodo recién creado. El
  camino de vuelta ya existía: seleccionás el nodo y en la barra elegís Rectángulo / Círculo /
  Corchete / Solo texto. El "+ Nodo" de la barra sigue creando caja.
  - **Verificado corriendo la app:** doble-click en el lienzo → nodo con `shape: 'text'`; click
    en "Rectángulo" → `shape: 'rect'`. Texto de ayuda del lienzo vacío actualizado (decía "para
    crear una caja").

- [x] **Promover subtarea → las hijas quedaban DUPLICADAS en las dos tareas** (Claude directo, verificado con la función real del pull):
  Reporte: "promuevo una subtarea1 con hijas y quedan en ambas". La promoción en sí estaba
  bien (`promoteSubtaskToTask` se lleva el subárbol y remapea `parentId`); el que las
  resucitaba era **el pull**.
  - **Causa:** `mergeById` tiene un auto-heal — "local vacío = el store no rehidrató → resucito
    todo de la nube ignorando tombstones y baseline". Correcto para una COLECCIÓN de dominio,
    pero el merge de subtareas lo aplicaba a la lista anidada de UNA tarea: si la tarea original
    quedaba con CERO subtareas (promoviste la única rama, o borraste la última), el pull revivía
    todas las subtareas borradas dentro de ella. Reproducido: tras promover, la original volvía
    con `[Subtarea 1, Hija A, Hija B, Nieta]` mientras la nueva tarea también las tenía.
  - **Fix:** flag `isNestedCollection` en `mergeById` (apaga los dos heurísticos de wipe:
    `localEmpty` y `remoteWiped`), activado en el merge de subtareas. El auto-heal real (store
    entero vacío) queda intacto — hay test que lo fija.
  - **Refactor mínimo:** el `mergeItem` de tareas salió de `pullTasks` a
    `mergeTaskWithSubtasks` (syncMerge.ts) para poder testear LA función que corre en el pull,
    no una copia.
  - **Alcance:** no era solo promover — **borrar la última subtarea de una tarea** tenía el
    mismo problema.
  - **Sin migración.**
  - **Verificado:** `lib/tasks/promoteSubtask.test.ts` 14/14 (promoción con nietas, pull tras
    promover con y sin otras subtareas, borrar la última, y auto-heal con store vacío).
    `tsc` + `next build` OK.
  - **No verificado:** no ejecuté el botón "convertir en tarea" con clicks reales en la UI (el
    panel del navegador no estaba desplegado); sí la acción del store que ese botón llama.

- [x] **Auditoría del sistema recurrente — 2 bugs latentes de duplicación + robustez** (Claude directo, verificado corriendo la app + tests):
  Repaso completo del dominio (buffer, rollover, dedupe, heal, borrado, restore, subtareas,
  agrupación, multipestaña). Lo que estaba bien y quedó FIJADO en tests: mensual, semanal con
  días elegidos, `until`, cambio de regla, ausencia larga (no genera goteo), instancia borrada
  que no revive, y dos dispositivos que spawnean en paralelo (mismos ids). Lo que estaba mal:
  1. **Subtareas duplicadas en cada instancia.** La instancia tenía id determinista pero sus
     SUBTAREAS se copiaban con `genId()`: dos dispositivos generaban la misma tarea con
     subtareas de ids distintos y el merge del pull las sumaba (2 → 4 pasos, y creciendo).
     Fix: `spawnSubtasksFor` con ids deterministas `<instancia>__<subtarea>`.
  2. **Subárbol colgado de la madre.** Al copiar subtareas anidadas, el `parentId` seguía
     apuntando a la subtarea de la MADRE → jerarquía rota en la instancia y `parent_id` cruzado
     entre tareas distintas en Supabase. Ahora se remapea a la copia (y no se arrastran
     subtareas archivadas ni hijas huérfanas).
  3. **Hermana de subtarea recurrente duplicada.** Completar una subtarea recurrente en dos
     dispositivos creaba dos hermanas (`genId()` de nuevo). Ahora id determinista
     `recsub_<subtarea>_<fecha>` + guarda por (título, fecha).
  - **Robustez:** el heal (`migrateRecurringHeads`) ahora corre también en las pasadas
    periódicas del AppShell (medianoche / cada 30 min), no solo en el mount + 10s — si el pull
    trae datos rotos más tarde, se reparan igual. Y borrar la madre ya no marca sus instancias
    como "hechas" (ensuciaba el historial): se archivan a secas, y **restaurar la madre desde la
    papelera devuelve la serie completa**.
  - **Sin migración** (solo cambian ids de filas nuevas y campos que ya existían).
  - **Verificado:** `lib/tasks/recurringSeries.test.ts` 23/23. En la app: una serie diaria con
    subtarea anidada spawnea 10 instancias en UNA serie, subtareas `rec_M_<fecha>__sub_a` con la
    anidada colgando de la copia, 0 parentIds rotos, 0 duplicados, y la UI muestra una sola fila
    "Backtesting sesh · Todos los días · 0/11 hechas". `tsc` y `next build` OK.

- [x] **Recurrentes — se multiplicaban solas y no había forma de detenerlas (fix de raíz)** (Claude directo, verificado corriendo la app + tests):
  Reporte: "se me pone Backtesting sesh, intento detenerla/borrarla y no hay forma; se siguen
  separando; me aparecen 10 recurrencias de una misma instancia". Reproducido y medido, tres
  bugs encadenados:
  1. **La bomba — serie sin madre.** `ensureRecurringBuffer` tomaba `mother.id` como identidad
     de la serie; si la fila de la MADRE no existía (borrada, o todavía no llegó a ese device
     por sync), cada instancia se tomaba a sí misma como madre → su `dupeExists` no reconocía a
     las hermanas y spawneaba copias de fechas que ya existían, cada una en una serie propia.
     Medido: **6 instancias huérfanas → 39 tareas y 7 series en UNA apertura de /tasks**, con 6
     copias del mismo día. Y no se volvían a unir nunca: el heal solo miraba tareas SIN
     `recurringHeadId` y el dedupe agrupa POR `recurringHeadId`.
     **Fix:** `recurringHeadId` es la ETIQUETA de la serie y se conserva exista o no la fila de
     la madre (el `head` pasa a ser solo el template). Ids deterministas `rec_<madre>_<fecha>`
     otra vez → converge multi-device. Mismo criterio en `ensureRecurringSpawns` (rollover).
  2. **La madre en la papelera no detenía nada.** Verificado: madre archivada → seguía
     spawneando (7 → 10 tareas al reabrir). **Fix:** madre archivada = serie detenida (buffer y
     rollover cortan), y `deleteTask` sobre una madre se lleva a la papelera sus instancias
     futuras no completadas (recuperables; el historial queda intacto).
  3. **Los datos ya rotos no se reparaban.** `migrateRecurringHeads` ahora elige la madre
     canónica de forma DETERMINISTA (dueDate → createdAt → id, igual en todos los devices) y
     re-ancla los fragmentos (huérfanos o auto-anclados), bumpeando `updatedAt` — sin ese bump
     el merge LWW del pull pisaba el heal y la serie se volvía a partir en cada sync (BASE nº1).
     `dedupeRecurringInstances` suma una segunda pasada por (proyecto, título, fecha) que caza
     las copias que la pasada por serie no veía.
  - **Sync — blindaje (NO era la causa acá: el usuario ya tenía las migraciones corridas):** el
    push de un dominio moría entero si la tabla no tenía una columna nueva (migración sin correr)
    y `syncDeletes` está DESPUÉS del upsert → los borrados no se propagaban y el pull siguiente
    resucitaba todo. Nuevo `lib/supabase/upsertTolerant.ts`:
    descarta la columna que falta, reintenta y sincroniza el resto (los borrados sí viajan);
    avisa por toast qué migración correr. Cualquier otro error corta como antes.
  - **Sin migración nueva** (no hay campos nuevos; solo se reescriben `recurringHeadId`/`archivedAt`).
  - **Verificado:** `lib/tasks/recurringSeries.test.ts` 15/15 (incluye el caso exacto: 6
    huérfanas ya no explotan, datos fragmentados se re-unifican, madre a la papelera detiene la
    cadena, y "detener"/"borrar serie" siguen andando) y `lib/supabase/upsertTolerant.test.ts`
    13/13. Corriendo la app con el escenario roto sembrado: **1 fila "Backtesting sesh · Todos
    los días · 0/6 hechas"** donde antes había 39 tareas en 7 series, y estable entre reloads.
    `tsc --noEmit` OK.
  - **No verificado:** el round-trip real contra Supabase (el modo sin auth no tiene backend).

- [x] **Tareas — el prompt de "dividir en tareas / todo junto" al pegar una lista** (Claude directo, verificado):
  Reporte: pegué una lista larga y no me preguntó si separarla en tareas. Diagnóstico
  corriendo la app: el prompt (NewTaskForm, `pendingPaste`) SÍ funciona con saltos `\n`,
  pero el split usaba `/\r?\n/` y no detectaba los separadores **U+2028/U+2029** (LINE/
  PARAGRAPH SEPARATOR) que usan PDFs, Google Docs, Word — una lista copiada de ahí quedaba
  como UN renglón y no disparaba la pregunta.
  - **Fix:** helper `lib/tasks/pasteLines.ts` (`splitPastedLines`) que separa por
    `\r\n | \r | \n |   |  ` (NO por espacios). Aplicado en TODOS los pegados del
    task manager: NewTaskForm (`TasksPage`), subtareas (`TaskCard` ×3), `TaskDetail`,
    `SubtaskDetailModal`.
  - **Verificado:** test puro 8/8 (divide por U+2028/U+2029/`\r`, NO por espacios, filtra
    vacías). En la app: pegar una lista separada por U+2028 (sin `\n`) ahora muestra
    "Pegaste un texto de 3 renglones → Dividir / Todo junto". `tsc` OK.

- [x] **Ofertas — borrado por INTENCIÓN (fix de raíz de la pérdida de datos)** (Claude directo):
  El sync de ofertas ya no infiere borrados por ausencia (`baseline − local`, que con una
  lista local parcial destruía filas en la nube). Ahora borra SOLO lo que el usuario quitó
  a propósito:
  - **`offersStore`:** outbox local `pendingDeletes {systems, offers, templates}` (persistido,
    NO viaja como fila). `removeOffer`/`removeSystem`/`removeTemplate` registran el id ahí
    (removeSystem suma también los ids de SUS ofertas). Acción `clearPendingDeletes` que
    consume el sync.
  - **`pushOffers`:** reemplazado `syncDeletes` (baseline-diff) por `pushExplicitDeletes` →
    borra del cloud SOLO los ids del outbox + escribe sus tombstones + recién ahí los limpia
    (si el delete falla, no limpia → reintenta). Guarda: si un id del outbox volvió a existir
    local, no se borra.
  - **`pullOffers`:** los 3 merges usan `baseline: new Set()` → las eliminaciones se propagan
    SOLO por tombstones; una lista parcial nunca dropea filas (a lo sumo se re-pushean).
  - **Sin migración** (usa las tablas y tombstones existentes).
  - **Verificado:** test puro 10/10 (incl. garantía: outbox vacío + local parcial → borra 0).
    `tsc` OK. El round-trip multi-device real NO se pudo correr local (sin Supabase en modo
    no-auth) — queda validado por lógica pura + tipos.
  - Convive con el blindaje anti-borrado-masivo (backstop para los demás dominios per-fila).

- [x] **Sync — blindaje anti-borrado-masivo (previene pérdida de datos)** (Claude directo, verificado):
  Incidente: se perdieron 12 ofertas en la nube. Autopsia con Supabase: los tombstones
  mostraban borrados EN LOTE con timestamp idéntico (3 en el mismo ms, 4 en otro) → no eran
  borrados del usuario sino de `reconcileDeletes` (`syncMerge.ts`), que borra de la nube
  todo lo que está en el `baseline` y ya no está local, asumiendo intención del usuario.
  Tenía blindaje solo para "local COMPLETAMENTE vacío", no para "local PARCIAL"
  (rehidratación incompleta / merge que dropeó filas / tombstone viejo) → un device con la
  lista parcial empujaba y se llevaba puestas las que le faltaban.
  - **Fix:** guarda en `reconcileDeletes` — si habría que borrar **>= 4 filas Y >= 40% del
    baseline**, NO propaga el borrado (log de warning). Solo EVITA borrados, nunca puede
    causar pérdida. Borrar de a una/pocas sigue igual. Transversal → protege TODOS los
    dominios per-fila (tasks, offers, journal, etc.), no solo ofertas.
  - **Verificado:** test puro 6/6 (atrapa 12/17 y 4/8; deja pasar 1/2/3 y 4/20). `tsc` OK.
  - Pendiente opcional (a decidir con el usuario): borrado por-intención explícita
    (registrar removeX en vez de inferir por ausencia) y/o snapshots de ofertas para
    recuperar. La data perdida esta vez el usuario decidió darla por perdida.

- [x] **Ofertas — sync del documento robusto al reloj (docRev)** (Claude directo, verificado):
  Bug reportado: el doc "general" del sistema no sincronizaba multi-device (la notebook
  mostraba una versión vieja/parcial y no se actualizaba), aunque las ofertas sí. Causa:
  el doc es UNA fila que se resolvía por `updatedAt` (LWW por reloj de pared) → una copia
  vieja con timestamp más alto (diferencia de reloj entre PC y notebook) le ganaba a lo
  nuevo. Las ofertas no lo sufrían porque se editaban en un solo dispositivo.
  - **Fix (Opción B):** contador monotónico `docRev?: number` en `OfferSystem` y `Offer`,
    que sube +1 en cada edición del doc (`setSystemDoc`/`setOfferDoc`/`applyTemplate`). El
    merge (`mergeOfferEntity` en `sync.ts`, pasado como `mergeItem` a `mergeById` de
    systems+offers) resuelve **campo a campo**: metadata (nombre/etapa/orden) por
    `updatedAt` como siempre, pero el **doc por `docRev`** → inmune a diferencias de reloj.
    `docRev` resultante = max de ambos (no retrocede). Sanitize del pull preserva `docRev`
    (BASE nº2). **Sin migración** (viaja en el payload jsonb).
  - **Verificado:** test puro 6/6 (incluye el caso exacto: doc con docRev alto gana aunque
    su updatedAt sea más viejo; metadata sigue al updatedAt; rev-tie → LWW compat). En la
    app: editar el doc del sistema incrementa `docRev` (0→1→2) y persiste. `tsc` OK.
  - **Recuperar los datos actuales:** una vez deployado en AMBOS dispositivos, editar el
    doc en el dispositivo que tiene la versión BUENA (la PC) → su `docRev` sube y pisa la
    copia vieja de la notebook.

- [x] **Proyección mensual — mini-calendario** (Claude directo, verificado): el nivel
      **Mensual** ahora muestra un mini-calendario del mes (con hoy resaltado), igual que
      el Trimestral. Nuevo componente `MonthMiniCalendar` en `ProjectionPage.tsx` (reusa
      `buildMonthGrid` + `MONTH_NAMES`), renderizado en los 2 sitios donde el trimestral
      muestra el suyo (`level === 'month'`). Verificado: "agosto 2026" con círculo de hoy.

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

- [ ] **Correr las 2 migraciones del bridge** (sin esto no se puede generar el token ni
      guardar planes): `supabase/migration_mcp_tokens.sql` y `supabase/migration_day_plans.sql`.
- [ ] **Generar el token** en Configuración → Conexión con Claude y conectar el MCP.
- [ ] **Correr 3 migraciones en Supabase** (SQL Editor), si no las ofertas /
      YouTube / carpetas de mapas no sincronizan entre dispositivos:
  - [ ] `supabase/migration_offers.sql`
  - [ ] `supabase/migration_youtube.sql`
  - [ ] `supabase/migration_mindmap_folders.sql`
- [ ] **(opcional, para que lleguen PUNTUALES) Cron externo cada 5 min** en
      cron-job.org apuntando a `/api/notifications/dispatch` con el header
      `Authorization: Bearer <CRON_SECRET>`. Pasos en el workflow. Sin esto las
      notificaciones llegan igual, pero tarde (hasta 6 h después del horario).
      *El `CRON_SECRET` YA está bien: los runs del workflow salen en success.*
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
