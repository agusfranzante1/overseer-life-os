# 📔 Estado del Proyecto — Overseer Life OS

> Bitácora viva. Cambia todo el tiempo. Claude la lee al empezar cada chat
> (se carga sola vía `CLAUDE.md`) y la actualiza al terminar cada cambio.
> El método de trabajo está en [`instructions.md`](instructions.md); las reglas
> técnicas no negociables en [`AGENTS.md`](AGENTS.md).

**Última actualización:** 2026-08-12 · **Roadmap:** 7 etapas. **Etapas 1–6 COMPLETAS.** **Etapa 7 (Dashboard) DESCARTADA por decisión del usuario** (no quiso cambios). Roadmap cerrado.

⚠️ **PENDIENTE del usuario:** correr en Supabase `supabase/migration_offer_templates.sql` (Etapa 5) y `supabase/migration_books.sql` (Etapa 6), si no plantillas y libros no sincronizan.

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
