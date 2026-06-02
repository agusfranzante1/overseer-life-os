# Plan de implementación: Notifications Dispatcher

Estado: **diseñado, NO implementado**.
Owner: nosotros mañana.
Goal: hacer que las notificaciones que ya tienen toggle en Settings realmente lleguen al celular del usuario en los horarios correspondientes — incluso con la app cerrada.

---

## Resumen ejecutivo

Hoy tenemos:
- ✅ Toggle ON/OFF por canal en Settings (`notificationPrefs`).
- ✅ Lead time configurable para `taskDueSoon` y `spiNewSession`.
- ✅ Suscripción push por dispositivo en Supabase (`push_subscriptions`).
- ✅ Endpoint `/api/push/test` que dispara un push manual.
- ✅ Lógica `web-push` server-side en `lib/push/server.ts`.

No tenemos:
- ❌ Un cron / scheduled job que CORRA cada X min, recorra usuarios, decida qué mandar y dispare.
- ❌ Una tabla `notification_log` para idempotencia (no mandar 2× por día el mismo aviso).
- ❌ El "user_settings" sincronizado al server-side (hoy `notificationPrefs` vive en zustand → si el server no puede leerlo, no decide).
- ❌ Habits / tasks / SPI sessions accesibles desde el cron (depende del estado de sync).

---

## Arquitectura objetivo

```
Vercel Cron (every 5 min)
        │
        ▼
POST /api/notifications/dispatch
  Header: Authorization: Bearer ${CRON_SECRET}
        │
        ▼
1) Validar secret → si no, 401.
2) Listar todos los user_id con push_subscriptions activos.
3) Por cada usuario en paralelo (capped concurrency):
     a) Leer user_settings (timezone, notificationPrefs, habit_reminder_hour).
     b) Leer habits, tasks, latest SPI session del usuario.
     c) Para cada canal habilitado:
         - Calcular si HOY/AHORA corresponde disparar.
         - Chequear notification_log (idempotencia).
         - Si toca disparar: armar payload, sendPushToMany().
         - Insertar fila en notification_log.
4) Responder 200 con stats: { dispatched, skipped, errors }.
```

**Ventana de cron** = 5 min. Si la hora target es 21:00 y el cron corre a las 21:02, está dentro de la ventana → dispara. Si corre a las 21:08 (siguiente tick), está fuera → no dispara (porque ya lo mandó en el tick anterior, idempotencia confirma).

---

## ETAPAS

### ETAPA 1 — Migraciones SQL en Supabase

**1.1 Tabla `notification_log`**

```sql
-- supabase/migration_notification_log.sql
create table if not exists notification_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,   -- 'habit_reminder' | 'task_due' | 'task_overdue' | 'spi_new'
  dedupe_key    text not null,       -- ej. 'habit:2026-06-01' o 'task:abc123:due'
  sent_at       timestamptz not null default now(),
  payload       jsonb,               -- copia del body que mandamos, para debug
  result        jsonb,               -- { sent: n, gone: [], failed: [] }
  constraint notification_log_unique unique (user_id, notification_type, dedupe_key)
);

create index if not exists notification_log_recent_idx
  on notification_log (user_id, sent_at desc);

alter table notification_log enable row level security;

-- Solo el service-role lee/escribe. El usuario nunca lee esta tabla
-- directamente; si quisiéramos mostrar "última notificación enviada"
-- en Settings, sería via función RPC, no SELECT directo.
create policy "service role only"
  on notification_log
  for all
  to service_role
  using (true) with check (true);
```

**1.2 Asegurar `user_settings` server-readable**

Hoy `notificationPrefs` vive en `useAppStore` (zustand). Necesitamos que el server las lea.

Opciones:
- **A (simple)**: agregamos sync de `notificationPrefs` a una tabla `user_settings` en Supabase. El cliente la escribe en cada cambio; el server la lee.
- **B (más complejo)**: usar Supabase Edge Function que importa el cliente browser... no, descartado.

Vamos con A:

```sql
-- supabase/migration_user_settings.sql
create table if not exists user_settings (
  user_id                    uuid primary key references auth.users(id) on delete cascade,
  timezone                   text not null default 'UTC',
  notification_prefs         jsonb not null default '{}'::jsonb,
  habit_reminder_hour        integer,                                  -- 0-23, ej. 21 para 21:00
  habit_reminder_minute      integer default 0,                        -- 0-59
  spi_new_lead_minutes       integer default 0,
  updated_at                 timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy "user manages own settings"
  on user_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "service role reads all"
  on user_settings
  for select
  to service_role
  using (true);
```

**1.3 Sync de hábitos / tasks / SPI a Supabase**

Asunción: `lib/supabase/sync.ts` ya sincroniza esto. **Verificar mañana** que:
- `habits` (con completedDates, skippedDates).
- `tasks` (con dueDate, dueTime, notifyBeforeMinutes).
- `sessions` SPI (con weekStartDate, closedAt).

Si algo no está sincronizado, agregar el sync. Si ya está, seguimos.

---

### ETAPA 2 — Cliente: escribir `user_settings` desde appStore

**2.1 Helper en `lib/supabase/sync.ts`**

```ts
export async function syncUserSettingsToSupabase(prefs: NotificationPrefs, timezone: string, habitHour: number, habitMinute: number, spiLead: number) {
  if (!hasSupabaseConfig()) return
  const sb = getSupabaseBrowser()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return
  await sb.from('user_settings').upsert({
    user_id: user.id,
    timezone,
    notification_prefs: prefs,
    habit_reminder_hour: habitHour,
    habit_reminder_minute: habitMinute,
    spi_new_lead_minutes: spiLead,
    updated_at: new Date().toISOString(),
  })
}
```

**2.2 Llamar desde `appStore.setNotificationPref`** (debounced si hace falta).

**2.3 Nuevo campo en `notificationPrefs`**:
```ts
habitReminderHour?: number    // default 21
habitReminderMinute?: number  // default 0
```

**2.4 UI en SettingsPage → NotificationPrefsSection**: campo "Hora del recordatorio diario" con un `<input type="time">`.

---

### ETAPA 3 — Endpoint `/api/notifications/dispatch`

**3.1 Archivo**: `app/api/notifications/dispatch/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase/admin'   // <- a crear
import { sendPushToMany } from '@/lib/push/server'
import { buildHabitReminderPayload, buildTaskDuePayload, buildSpiNewPayload } from '@/lib/notifications/builders' // <- a crear

export const runtime = 'nodejs'   // web-push necesita node, no edge.

const WINDOW_MIN = 5

export async function POST(req: NextRequest) {
  // 1) Auth via cron secret
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (auth !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const sb = getServiceRoleClient()
  const now = new Date()

  // 2) Listar usuarios con suscripciones activas y settings cargados.
  const { data: users } = await sb.rpc('list_active_notif_users')   // o un select simple si no querés rpc

  let stats = { habit: 0, task_due: 0, task_overdue: 0, spi_new: 0, skipped: 0 }

  // 3) En paralelo (cap 10)
  await pAll(users ?? [], 10, async (user) => {
    const prefs = user.notification_prefs ?? {}
    const tz = user.timezone ?? 'UTC'

    // Hora local del usuario
    const localHour = getLocalHour(now, tz)
    const localMinute = getLocalMinute(now, tz)
    const localDate = getLocalDateYmd(now, tz)

    // ── CANAL 1: habit reminder ──
    if (prefs.habitReminder === true) {
      const targetH = user.habit_reminder_hour ?? 21
      const targetM = user.habit_reminder_minute ?? 0
      if (withinWindow(localHour, localMinute, targetH, targetM, WINDOW_MIN)) {
        const dedupe = `habit:${localDate}`
        const already = await wasSent(sb, user.user_id, 'habit_reminder', dedupe)
        if (!already) {
          const habits = await fetchUserHabits(sb, user.user_id)
          const pending = computePendingHabits(habits, localDate)
          if (pending.length > 0) {
            const payload = buildHabitReminderPayload(pending)
            const subs = await fetchUserSubs(sb, user.user_id)
            const result = await sendPushToMany(subs, payload)
            await logSent(sb, user.user_id, 'habit_reminder', dedupe, payload, result)
            stats.habit++
          } else {
            stats.skipped++
          }
        }
      }
    }

    // ── CANAL 2: task due soon ──
    if (prefs.taskDueSoon !== false) {
      const leadGlobal = prefs.taskDueLeadMinutes ?? 60
      const tasks = await fetchUserUpcomingTasks(sb, user.user_id)
      for (const t of tasks) {
        const lead = t.notifyBeforeMinutes ?? leadGlobal
        const dueAt = computeDueDateTime(t.dueDate, t.dueTime ?? '09:00', tz)
        const fireAt = new Date(dueAt.getTime() - lead * 60_000)
        if (withinWindowAt(now, fireAt, WINDOW_MIN)) {
          const dedupe = `task:${t.id}:due`
          const already = await wasSent(sb, user.user_id, 'task_due', dedupe)
          if (!already) {
            const payload = buildTaskDuePayload(t, lead)
            const subs = await fetchUserSubs(sb, user.user_id)
            const result = await sendPushToMany(subs, payload)
            await logSent(sb, user.user_id, 'task_due', dedupe, payload, result)
            stats.task_due++
          }
        }
      }
    }

    // ── CANAL 3: task overdue ──
    // Igual que taskDueSoon pero detecta overdue. Idempotencia 1× por día.

    // ── CANAL 4: SPI new session ──
    if (prefs.spiNewSession !== false) {
      // Si hoy es sábado a la hora target y la sesión de esta semana no existe → avisar.
      // Dedupe key: `spi:${weekSat}`.
    }
  })

  return NextResponse.json({ ok: true, ...stats, ts: now.toISOString() })
}
```

**3.2 Helpers a crear** en `lib/notifications/`:
- `builders.ts` — arma el `PushPayload` por canal.
- `timeWindow.ts` — `withinWindow(localH, localM, targetH, targetM, win)`.
- `tz.ts` — convertir `now` a hora local en tz IANA.
- `idempotency.ts` — `wasSent()`, `logSent()`.

**3.3 Helper `lib/supabase/admin.ts`**:
```ts
import { createClient } from '@supabase/supabase-js'

export function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}
```

---

### ETAPA 4 — Vercel cron setup

**4.1 `vercel.json` en la raíz** (si ya existe, sumar la entry):

```json
{
  "crons": [
    {
      "path": "/api/notifications/dispatch",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**4.2 Variables de entorno en Vercel**:
- `CRON_SECRET` — string aleatorio largo (32+ chars). Vercel cron lo manda automáticamente como `Bearer ${CRON_SECRET}` cuando lo configuras así. Ver docs Vercel.
- `SUPABASE_SERVICE_ROLE_KEY` — ya existe seguramente.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` — ya existen.

**Nota crítica**: Vercel cron requiere proyecto en Pro plan O Hobby con tier limitado. Si el plan Hobby no alcanza, opción B: GitHub Actions con `schedule:` cron → llama al endpoint con el secret.

---

### ETAPA 5 — Builders de payload por canal

**`lib/notifications/builders.ts`**

```ts
import type { PushPayload } from '@/lib/push/server'

export function buildHabitReminderPayload(pending: Habit[]): PushPayload {
  const names = pending.slice(0, 3).map(h => `${h.icon} ${h.name}`).join(', ')
  const extra = pending.length > 3 ? ` +${pending.length - 3} más` : ''
  return {
    title: '🟢 Te faltan hábitos hoy',
    body: pending.length === 1
      ? `Marcaste casi todo. Falta: ${names}.`
      : `Te quedan ${pending.length}: ${names}${extra}.`,
    url: '/habits',
    tag: 'habit-reminder',
  }
}

export function buildTaskDuePayload(t: Task, leadMin: number): PushPayload {
  const when = leadMin === 0 ? 'AHORA'
    : leadMin < 60 ? `en ${leadMin} min`
    : leadMin < 1440 ? `en ${Math.round(leadMin / 60)} h`
    : 'mañana'
  return {
    title: `📋 Vence ${when}: ${t.title}`,
    body: t.description ?? 'Tocá para abrir la tarea.',
    url: `/tasks?id=${t.id}`,
    tag: `task-due-${t.id}`,
  }
}

export function buildTaskOverduePayload(tasks: Task[]): PushPayload {
  return {
    title: `⚠️ ${tasks.length} tarea${tasks.length === 1 ? '' : 's'} vencida${tasks.length === 1 ? '' : 's'}`,
    body: tasks.slice(0, 3).map(t => `· ${t.title}`).join('\n'),
    url: '/tasks',
    tag: 'task-overdue',
  }
}

export function buildSpiNewPayload(weekSatLabel: string): PushPayload {
  return {
    title: '📐 Nuevo SPI semanal habilitado',
    body: `La sesión del ${weekSatLabel} está lista. Abrila cuando puedas.`,
    url: '/proyeccion',
    tag: 'spi-new',
  }
}
```

---

### ETAPA 6 — Service worker: manejar el push entrante

Asunción: ya hay un service worker registrado para push (si no, ver `public/sw.js`).

Verificar que el SW responda a `push` con:
```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: data.tag,
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(clients.openWindow(url))
})
```

Si ya existe, verificar que respete `data.tag` (para que iOS no haga stack feo) y `data.url`.

---

### ETAPA 7 — Testing y debug

**7.1 Forzar dispatch manual desde Settings**

Botón nuevo en `PushNotificationsSection`: "Probar notificación nocturna ahora" → llama un endpoint `/api/notifications/test-dispatch?type=habit` que reusa la lógica del dispatcher PERO ignora la ventana de tiempo y la idempotencia (para que mande sí o sí).

**7.2 Visor de notification_log en Settings (opcional)**

Mini panel "Últimas notificaciones enviadas a este usuario" (últimas 20 filas).

**7.3 Logs en consola del cron**

Estructurar como JSON line-per-log: `{ts, user_id, type, action: 'sent'|'skipped'|'error', reason}` para que en Vercel logs filtrés fácil.

---

### ETAPA 8 — Edge cases

- **Usuario sin push_subscriptions**: skip silencioso, no error.
- **Push subscription "gone" (404/410)**: el `sendPushToMany` ya devuelve `gone[]`. El dispatcher debe **borrar esas filas** de `push_subscriptions` para no reintentar.
- **Usuario en otra TZ**: cada usuario tiene su `timezone`; el cron corre en UTC pero las comparaciones de hora local se hacen con la TZ del user.
- **App offline durante días**: cuando vuelve, el cron sigue mandando solo dentro de la ventana (no se acumulan 7 días de hábitos pendientes; lo de ayer es de ayer).
- **DST (cambio de hora)**: usar `Intl.DateTimeFormat` con tz IANA — maneja DST solo.
- **Múltiples dispositivos**: el `sendPushToMany` ya lo cubre.

---

## Resumen de archivos a tocar

**Nuevos**:
- `supabase/migration_notification_log.sql`
- `supabase/migration_user_settings.sql`
- `app/api/notifications/dispatch/route.ts`
- `app/api/notifications/test-dispatch/route.ts` (opcional)
- `lib/notifications/builders.ts`
- `lib/notifications/timeWindow.ts`
- `lib/notifications/tz.ts`
- `lib/notifications/idempotency.ts`
- `lib/supabase/admin.ts`
- `vercel.json` (si no existe)

**Modificados**:
- `lib/store/appStore.ts` — agregar `habitReminderHour`, `habitReminderMinute` a `notificationPrefs`.
- `components/settings/SettingsPage.tsx → NotificationPrefsSection` — agregar input "Hora del recordatorio" + botón "Probar ahora".
- `lib/supabase/sync.ts` — agregar `syncUserSettingsToSupabase`. Verificar habits/tasks/sessions sync.
- `public/sw.js` — verificar handler de `push` y `notificationclick`.

---

## Orden de ejecución mañana

| # | Etapa | Tiempo estimado |
|---|---|---|
| 1 | Migraciones SQL en Supabase (correr en SQL Editor) | 10 min |
| 2 | `lib/supabase/admin.ts` + verificar service-role en env | 5 min |
| 3 | Agregar `habitReminderHour/Minute` a appStore + UI Settings | 15 min |
| 4 | `syncUserSettingsToSupabase` + hookear en setNotificationPref | 10 min |
| 5 | Builders + helpers (`tz`, `timeWindow`, `idempotency`) | 30 min |
| 6 | `/api/notifications/dispatch` con los 4 canales | 60 min |
| 7 | Service worker handler (verificar/ajustar) | 15 min |
| 8 | Botón "Probar ahora" en Settings + endpoint test-dispatch | 20 min |
| 9 | `vercel.json` + setear CRON_SECRET en Vercel | 5 min |
| 10 | Deploy + smoke test en producción | 20 min |

**Total estimado: ~3 horas.** Hacelo de un tirón cuando tengas créditos.

---

## Decisiones ya tomadas

- **Hora del recordatorio de hábitos**: 21:00 default, configurable por usuario.
- **Ventana del cron**: cada 5 min, ventana de match 5 min.
- **Idempotencia**: tabla `notification_log` con unique constraint en `(user_id, type, dedupe_key)`.
- **Auth del cron**: bearer token via `CRON_SECRET` en header. Vercel cron lo manda automático.
- **Stack**: web-push (ya está) + Supabase service role + Vercel cron.
- **TZ-aware**: cada usuario tiene su `timezone` en `user_settings`.
- **Service worker**: ya debería existir; verificar.

---

## Cuando arranquemos mañana

Decime "vamos con el dispatcher" y arrancamos por la **etapa 1** (migraciones SQL). Te paso el SQL para copiar/pegar en el editor de Supabase, y vamos a confirmarlo paso a paso.
