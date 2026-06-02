# Deploy del Notifications Dispatcher — checklist

Esto se hace UNA SOLA VEZ, después del merge a main. Marcá los pasos a medida que los hacés.

## 1. Migraciones SQL en Supabase

Abrí Supabase → SQL Editor → New query y pegá CADA uno de estos archivos por separado, en este orden:

- [ ] `supabase/migration_notification_log.sql`
- [ ] `supabase/migration_user_settings.sql`

Después de cada uno, click Run. Verificá que no haya errores rojos (los `if not exists` hacen que sea seguro re-correr).

## 2. Generar CRON_SECRET

En tu terminal local:
```bash
openssl rand -hex 32
```
Copiá el output (64 chars hex). Lo vas a usar en el próximo paso.

## 3. Variables de entorno en Vercel

Vercel Dashboard → tu proyecto → **Settings → Environment Variables**. Verificá que existan estas (agregá las que falten en Production y Preview):

| Variable | Source | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✓ (ya debería estar) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✓ (ya debería estar) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (secreto) | ✓ (nuevo si no estaba) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public | ✓ (ya está) |
| `VAPID_PRIVATE_KEY` | VAPID private | ✓ (ya está) |
| `VAPID_SUBJECT` | `mailto:tu@email.com` | ✓ (ya está) |
| `CRON_SECRET` | Output del paso 2 | ✓ **nuevo** |

- [ ] Variables verificadas

## 4. Confirmar `vercel.json` en el repo

El archivo `vercel.json` (raíz del repo) ya tiene el cron definido:
```json
{
  "crons": [
    { "path": "/api/notifications/dispatch", "schedule": "*/5 * * * *" }
  ]
}
```

- [ ] Archivo confirmado en main

**Nota Vercel cron:**
- Vercel Hobby plan: cron limitado (1-2 jobs, frecuencia mínima alta). Si te tira error de plan, sube a Pro o usá **GitHub Actions** como alternativa:
  ```yaml
  # .github/workflows/notifications-cron.yml
  on:
    schedule:
      - cron: '*/5 * * * *'
  jobs:
    dispatch:
      runs-on: ubuntu-latest
      steps:
        - run: |
            curl -X POST "${{ secrets.APP_URL }}/api/notifications/dispatch" \
              -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
  ```

## 5. Deploy

Push a main → Vercel auto-deploya.

- [ ] Build verde
- [ ] Cron schedule visible en Vercel Dashboard → Crons tab (puede tardar 5-10 min en aparecer la primera vez)

## 6. Smoke test

Hacelo TODO en este orden:

### 6.1 Suscribir el dispositivo
- [ ] Abrí la app deployada en tu celular (iOS: instalá la PWA en home screen).
- [ ] Settings → Notificaciones push → "Suscribir este dispositivo" → permitir.
- [ ] Verificá que aparece "✓ Suscripción activa".

### 6.2 Activar el canal habitReminder
- [ ] Settings → Notificaciones → toggle ON en "Recordatorio diario de hábitos".
- [ ] Configurá la hora (ej. 21:00).
- [ ] Apretá "🔔 probar ahora".
- [ ] Te debería llegar el push EN SEGUNDOS al celular.

### 6.3 Verificar el cron real
- [ ] Esperá al siguiente tick del cron (espías en Vercel → Crons → invocations).
- [ ] Cuando llegue la hora target (ej. 21:00), te debería llegar el push automático.
- [ ] En Supabase → Table Editor → `notification_log`, verificá que aparezca una fila con tu user_id, type='habit_reminder', sent_at del momento.

### 6.4 Tareas con dueDate
- [ ] Creá una tarea con dueDate=hoy y dueTime= dentro de 5 min.
- [ ] Settings → "Vencimiento de tareas" → Cuánto antes → "En el momento".
- [ ] Esperá 5 min — el cron va a disparar el aviso.

## 7. Troubleshooting

### "401 unauthorized" en /api/notifications/dispatch
- `CRON_SECRET` no está en Vercel env vars, o el header no matchea.

### El cron corre pero stats.habit=0 siempre
- El usuario no está en `user_settings` (no guardó preferencias). Volvé a Settings y togglea cualquier prefs para forzar el upsert.
- O `notification_prefs.habitReminder !== true`.
- O la hora local del usuario NO está dentro de la ventana de 5 min del target.

### Push subscriptions desaparecen solas
- Es esperado: el dispatcher borra las `gone` (404/410 del push service). Suelen morir cuando borrás la PWA o re-instalás iOS. Te volvés a suscribir desde el dispositivo.

### El service worker no muestra la notificación
- Devtools → Application → Service workers → confirmá que está activo y registrado.
- iOS: la PWA TIENE que estar instalada en home screen, las notifs no llegan en Safari normal.

### Multiple devices reciben duplicado
- Es CORRECTO. Cada device tiene su propia subscription; el dispatcher manda a TODOS los devices del usuario. El `tag` del payload colapsa el push si ambos devices están abiertos simultáneamente.

## 8. Operación normal

A partir de acá:
- El cron corre cada 5 min, 24/7.
- Cada usuario recibe sus notifs en su hora local configurable.
- El log queda en `notification_log` para debug (las últimas 90 días — podés agregar un cleanup cron después).
- Los cambios de prefs en Settings se reflejan en el siguiente tick del cron (≤5 min).
