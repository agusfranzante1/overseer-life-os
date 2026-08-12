# 📔 Estado del Proyecto — Overseer Life OS

> Bitácora viva. Cambia todo el tiempo. Claude la lee al empezar cada chat
> (se carga sola vía `CLAUDE.md`) y la actualiza al terminar cada cambio.
> El método de trabajo está en [`instructions.md`](instructions.md); las reglas
> técnicas no negociables en [`AGENTS.md`](AGENTS.md).

**Última actualización:** 2026-08-12 · **Roadmap en curso:** 7 etapas, una por vez. **Etapas 1 y 2 COMPLETAS.** Próxima: Etapa 3 (Google Calendar: recordatorios + convertir evento en tarea) — NO empezada.

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
