# Health Auto Export → Overseer

Setup para que la app iOS **Health Auto Export** sincronice tus métricas de Apple Health
(que vienen del Xiaomi Smart Band 10 vía Mi Fitness) directo a Overseer **sin** necesidad
de Docker, Postgres, ni Grafana — el receptor ya está en Overseer.

## Cómo funciona

```
Xiaomi Band 10 → Mi Fitness → Apple Health (HealthKit)
                                    ↓
                    Health Auto Export app (iPhone)
                                    ↓
                  POST http://<PC-LAN-IP>:3001/api/health/auto-export
                                    ↓
                  Next.js route → data/health/<fecha>.json
                                    ↓
                       MetricsPanel + /health page
```

Health Auto Export te ahorra el laburo de armar el Shortcut a mano. La app empaqueta
tus métricas en un JSON estándar y lo postea según el cron que configures.

## 1. Pre-requisitos

1. **Health Auto Export** instalada en iPhone (App Store, $5 USD aprox).
   Funciona sin el Premium para REST básico, pero el envío automático en background
   requiere la suscripción "Premium" (~$3/mes).
2. **Mi Fitness** permitiendo escribir en Apple Health (Ajustes iOS → Salud → Acceso y
   dispositivos → Mi Fitness → todo activado).
3. **iPhone y PC en la misma WiFi**.
4. **IP local de tu PC**: `ipconfig` en Windows, buscar "IPv4 Address" (ej. `192.168.1.42`).
5. **Firewall**: Windows Defender suele pedir permiso la primera vez que entra una
   conexión al puerto 3001. Aceptá. Si no aparece, agregá manualmente una regla de
   entrada para Node.js en el puerto 3001.

## 2. (Opcional) Activar auth por header

Si no querés que cualquiera en tu red pueda postear basura al endpoint, agregá esto
en tu `.env.local`:

```bash
OVERSEER_HEALTH_KEY=mi-secreto-cualquiera-largo-y-random
```

Después reiniciá `npm run dev`.

## 3. Configurar la automatización en Health Auto Export

Abrí la app → **Automations** → **+ New Automation**.

```
Automation Type:    REST API
Name:               Overseer Sync
URL:                http://<PC-LAN-IP>:3001/api/health/auto-export
                    (ej. http://192.168.1.42:3001/api/health/auto-export)
Method:             POST
Headers (si activaste auth):
    api-key:        mi-secreto-cualquiera-largo-y-random

Data Type:          Health Metrics
Export Format:      JSON
Aggregate Data:     Enabled (ON)
Aggregate Interval: Days
Batch Requests:     Enabled (ON)
```

### Métricas a habilitar dentro del automation

En la sección **Metrics** del automation, asegurate de tildar AL MENOS estas:

- ✅ **Step Count** → `steps`
- ✅ **Sleep Analysis** → `sleepMinutes`, `sleepStart`, `sleepEnd`
- ✅ **Resting Heart Rate** → `restingHR`
- ✅ **Heart Rate Variability** → `hrv`

Las demás (Active Energy, Distance, etc.) las podés agregar más tarde; por ahora el
endpoint las ignora.

### Schedule

- **Manual** para probar primero.
- **Automated** cada 1 hora o "After workout" cuando funcione el flujo end-to-end.

## 4. Probar el flujo

1. En la app: tocá **Export Now** en el automation. Debería decir "Success".
2. En la PC, mirá si apareció un archivo en:
   ```
   C:\Users\agusf\overseer-life-os\data\health\YYYY-MM-DD.json
   ```
3. Refrescá `http://localhost:3001/` → el MetricsPanel debería mostrar los nuevos
   valores (Steps, Sleep, HR).
4. Andá a `http://localhost:3001/health` → ver el día en el heatmap + ring de Energy.

### Healthcheck rápido sin iPhone

Abrí en el navegador de la PC:
```
http://localhost:3001/api/health/auto-export
```
Tiene que responder:
```json
{ "ok": true, "hint": "POST Health Auto Export JSON here" }
```

Y desde el iPhone, abrí en Safari:
```
http://<PC-LAN-IP>:3001/api/health/auto-export
```
Si ves el mismo JSON, la conexión funciona. Si ves un error de timeout → es el
firewall de la PC bloqueando el puerto.

## 5. Troubleshooting

**"Could not connect" desde la app**:
- Confirmá la IP con `ipconfig`. La IP cambia si te reconectás a otra red.
- iPhone y PC tienen que estar en la misma WiFi (no datos móviles).
- Probá deshabilitar Windows Firewall temporal para descartar.

**El JSON llega pero el dashboard no muestra nada**:
- El cliente hace polling cada 5 min. Forzá refresh con `Ctrl+Shift+R` o
  usá el botón "Sync ahora" en `/health`.

**Sleep aparece en 0**:
- Health Auto Export sincroniza el sueño **después** de que termine el período.
  Configurá el automation para correr a la mañana (8–10am).

**Quiero exponer el endpoint fuera de mi red local**:
- Usá ngrok: `ngrok http 3001` → te da una URL pública tipo `https://abc123.ngrok.io`
  → poné `https://abc123.ngrok.io/api/health/auto-export` como URL en la app.
- ACTIVÁ `OVERSEER_HEALTH_KEY` en este caso (la URL queda pública).

## Comparación con el Shortcut manual

| | iOS Shortcut | Health Auto Export |
|---|---|---|
| Costo | Gratis | $5 USD + opcional $3/mes premium |
| Setup | 30 min armado a mano | 5 min |
| Métricas | Las que escribís | 150+ disponibles, tildás las que querés |
| Background sync | Limitado a iOS Automations | Sí (con premium) |
| Mantenimiento | Si Apple cambia algo, lo arreglás vos | La app se actualiza sola |

Si ya te funciona el Shortcut, no necesitás esto. Si querés algo más robusto y menos
manual, esta es la vía.
