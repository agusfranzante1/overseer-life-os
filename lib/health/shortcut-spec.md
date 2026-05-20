# iOS Shortcut → Overseer Health

Guía paso a paso para crear el Shortcut que sincroniza tus métricas de Apple Health
(que vienen del Xiaomi Smart Band 10 vía Mi Fitness) al dashboard.

---

## Pre-requisitos

1. **iPhone y Mac en la misma red WiFi** (la app corre en `localhost:3001` en tu Mac).
2. **Mi Fitness app instalada en iPhone**, vinculada con tu Xiaomi Smart Band 10.
3. **Permitir que Mi Fitness escriba en Apple Health**:
   - Ajustes iOS → Salud → Acceso y dispositivos → Mi Fitness → activar TODO.
4. **Averiguar la IP local de tu Mac**:
   - Windows: `ipconfig` → buscar "IPv4 Address" (ej. `192.168.1.42`).
   - macOS: `ifconfig en0` o Preferencias → Red.
5. **Firewall**: permitir conexiones entrantes al puerto 3001 (Windows Defender suele pedirlo la primera vez automáticamente al correr `npm run dev`).

---

## Construcción del Shortcut

Abrí la app **Shortcuts (Atajos)** en iPhone → **+** para crear uno nuevo.
Nombralo `Sync Overseer Health`.

### Acciones (en este orden):

#### 1. Pasos de hoy
- Add Action → **Find Health Samples**
- Type: `Steps`
- Date: `Today` (Start of Day → End of Day)
- Sort by: `End Date` Order: `Latest First`
- Limit: `All`

- Add Action → **Calculate Statistics**
- Input: Health Samples (output anterior)
- Operation: `Sum`
- → Renombrar variable: **StepsTotal**

#### 2. Sueño de la última noche
- Add Action → **Find Health Samples**
- Type: `Sleep Analysis`
- Filter: `Value` is `Asleep` (cualquier sub-categoría asleep)
- Date: `Last 24 hours`
- → Renombrar la salida: **SleepSamples**

- Add Action → **Calculate Statistics**
- Input: SleepSamples
- Operation: `Sum of Duration` (en minutos)
- → **SleepMinutes**

- Add Action → **Get start date** of first SleepSample → **SleepStart**
- Add Action → **Get end date** of last SleepSample → **SleepEnd**
- (Opcional: usar Format Date → ISO 8601 en ambos)

#### 3. Frecuencia cardíaca en reposo
- Add Action → **Find Health Samples**
- Type: `Resting Heart Rate`
- Date: `Today`
- Sort: latest first
- Limit: 1
- Get item 1 → **RestingHR**

#### 4. HRV (variabilidad)
- Add Action → **Find Health Samples**
- Type: `Heart Rate Variability`
- Date: `Last 24 hours`
- Average → **HRV**

#### 5. Construir el JSON
- Add Action → **Dictionary**
  ```
  date         → (Current Date formatted "yyyy-MM-dd")
  steps        → StepsTotal
  sleepMinutes → SleepMinutes
  sleepStart   → SleepStart (ISO 8601)
  sleepEnd     → SleepEnd (ISO 8601)
  restingHR    → RestingHR
  hrv          → HRV
  ```

#### 6. POST al servidor
- Add Action → **Get Contents of URL**
- URL: `http://<TU-IP-LOCAL>:3001/api/health`
  - Ej. `http://192.168.1.42:3001/api/health`
- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - *(opcional)* `x-overseer-key: <tu-secreto>` si configuraste `OVERSEER_HEALTH_KEY` en `.env.local`
- Request Body: `JSON` → seleccioná el Dictionary del paso 5

#### 7. Confirmación (opcional)
- Add Action → **Show Notification** → "Synced: [StepsTotal] steps · [SleepMinutes]m sleep"

---

## Automation diaria

Para que se ejecute solo cada mañana:

1. Shortcuts app → tab **Automation** → **+** → Personal Automation
2. Trigger: **Time of Day** → 07:30 (después de que te despertás)
3. Run Shortcut → seleccioná `Sync Overseer Health`
4. **Ask Before Running: OFF** (importante, así corre silencioso)

Alternativa: trigger **Sleep Tracking** → "When I wake up" (requiere usar el Sleep Schedule de iOS).

---

## Verificación

1. Correr el Shortcut manualmente desde el iPhone.
2. En la Mac, verificar que apareció el archivo:
   ```
   C:\Users\agusf\overseer-life-os\data\health\YYYY-MM-DD.json
   ```
3. Refrescar `http://localhost:3001/` → MetricsPanel debería mostrar los nuevos valores.
4. Abrir `http://localhost:3001/health` → ver el día en el heatmap.

---

## Troubleshooting

- **"Could not connect" desde el Shortcut**:
  - Verificá que `npm run dev` esté corriendo.
  - Verificá la IP de la Mac con `ipconfig`.
  - Asegurate de que el firewall acepta el puerto 3001 (probá deshabilitarlo temporalmente).
  - iPhone y Mac TIENEN que estar en la misma red.

- **JSON llega pero el dashboard no se actualiza**:
  - El cliente hace polling cada 5min. Forzá refresh con `Ctrl+F5` o usá el botón "Sync ahora" en `/health`.

- **Sleep aparece en 0**:
  - Mi Fitness sólo sincroniza sueño después de que termine el período. Probá correr el Shortcut al despertarte (no antes).
  - Verificá en Apple Health → Sleep que haya samples del Band.

- **HRV / RHR vacíos**:
  - El Band 10 mide HRV nocturna; puede tardar 1-2 días en aparecer en Apple Health.
  - Mi Fitness tiene granularidad horaria, no minuto-a-minuto.
