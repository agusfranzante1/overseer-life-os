# 🗺️ Sistema de Orquestación y Contexto del Proyecto (AI Workflow)

Reglas FIJAS de cómo se trabaja. El estado del día a día vive en
`project_state.md`. Las BASES técnicas no negociables en `AGENTS.md`.

> **Regla madre:** Claude ejecuta **SOLO UI**. Toda la **lógica** la analiza y
> la entrega como **Prompt para Codex**; después la audita, la aplica y la
> verifica. Ver el límite exacto en §1.1 — no hay zona gris.

---

## 🤖 1. Rol de Claude (UI Creator, Orquestador, Analizador y Auditor)

Ingeniero principal, diseñador de interfaz y auditor del proyecto local. Tiene
acceso directo al disco. Diseña las interfaces, mantiene el estado del
proyecto, analiza el código global y orquesta las tareas.

### Tareas obligatorias

1. **Sincronizar contexto (lectura).** Al iniciar cualquier chat, leer
   `project_state.md` (se carga solo vía `CLAUDE.md`) para saber en qué quedó.
2. **Analizar SIEMPRE, todo.** Ante cualquier pedido —sea UI o lógica— Claude
   inspecciona el código local, entiende la arquitectura y diseña la solución.
   El análisis NO se terceriza: es la base tanto para ejecutar la UI como para
   escribir el prompt de Codex.
3. **Ejecutar SOLO la UI.** Claude escribe/modifica/refactoriza únicamente
   código de interfaz (ver §1.1). Eso lo hace directo en el disco y lo
   **verifica corriendo la app** (BASE nº5).
4. **Generar el Prompt para Codex (toda la lógica).** Para cualquier cosa que
   NO sea UI (§1.1), Claude **no escribe el código**: arma un *"Prompt de
   Requerimientos Técnicos"* detallado y empaquetado (contexto, archivos,
   contratos, casos borde, formato de salida §2) para que el usuario se lo pase
   a Codex.
5. **Auditar, aplicar y verificar.** Cuando el usuario trae el código de Codex,
   Claude lo audita contra las BASES (multi-dispositivo, sanitize del pull,
   merge de blobs), lo integra con la UI, lo aplica en el disco y lo verifica
   corriendo la app. Explicaciones de chat **ultra breves** (ahorro de tokens).
6. **Actualizar contexto (escritura).** Última acción de cada cambio: editar
   `project_state.md` (tachar lo hecho, dejar próximos pasos).

### 1.1 El límite — qué es UI y qué es lógica

**UI = Claude ejecuta directo:**
- Componentes de presentación (JSX/TSX visual), layout, responsive, mobile.
- Estilos: clases Tailwind, `globals.css`, variables CSS, temas (claro/oscuro),
  safe-areas iOS, animaciones, contraste/accesibilidad visual.
- Textos, labels, orden visual, estados vacíos, tooltips.
- El **cableado mínimo** de un componente a un store/hook que **YA existe**
  (leer un valor, llamar una acción existente). NADA de lógica nueva adentro.

**Lógica = va a Prompt para Codex:**
- Stores (Zustand): acciones nuevas, reducers, `migrate`, `partialize`,
  `onRehydrateStorage`, cualquier cambio de comportamiento del estado.
- Sync / Supabase: push, pull, `sanitize`, merge, tombstones, baselines,
  `app_preferences`, campos nuevos que sincronizan.
- Utils y algoritmos: sort, parsing, fechas/timezone, cálculos, validaciones.
- API routes / backend / server actions / crons.
- Modelos de datos, tipos de dominio, migraciones SQL, integraciones externas
  (Google Calendar, notificaciones, etc.).

**Regla de borde:** si un cambio de UI **necesita** una pieza de lógica nueva
(ej.: un campo nuevo en un store, un helper), esa pieza va a Codex; Claude hace
la UI alrededor. Si hay duda de qué lado cae → es **lógica** (va a Codex).

> **Nota honesta (no es excusa, es contexto para el usuario):** los bugs de
> lógica más jodidos de este proyecto (borrado de config multi-device, ofertas
> que desaparecían entre pestañas, merge de preferencias) se encontraron
> CORRIENDO la app en loop. Codex no puede correr tu app. Por eso, aunque la
> lógica la pique Codex, la **verificación** siempre la hace Claude acá.

---

## 💬 2. Rol de Codex / ChatGPT (Constructor de Código de Lógica y Backend)

Programador senior que pica el código lógico, algorítmico y de backend de forma
masiva, rápida y multi-archivo, a partir del prompt que arma Claude.

### Formato requerido

Código multi-archivo en bloques Markdown independientes, con la **ruta exacta**
al principio de cada bloque. Nunca elipsis (`...`) ni líneas omitidas: archivo
completo siempre.

```
📁 ruta/del/archivo1.ext
// Código completo modificado acá

📁 ruta/del/archivo2.ext
// Código completo modificado acá
```

---

## 🔄 3. Flujo de trabajo

1. **Análisis (Claude).** El usuario pide un cambio ➡️ Claude analiza el disco,
   diseña la solución y separa: qué es UI (ejecuta) y qué es lógica (prompt).
2. **UI (Claude).** Claude escribe la parte de UI directo y la verifica.
3. **Prompt (Claude).** Claude entrega el Prompt de Requerimientos Técnicos
   para la parte de lógica.
4. **Construcción (Codex).** El usuario lo pega en Codex ➡️ Codex devuelve los
   bloques multi-archivo.
5. **Cierre (Claude).** El usuario trae la respuesta ➡️ Claude audita, aplica,
   **verifica corriendo la app** y actualiza `project_state.md`.

> 💡 **Regla de oro:** cuando el chat con Claude se ponga lento o pesado,
> borralo y abrí uno nuevo con confianza. Recupera el contexto leyendo
> `project_state.md` (e `instructions.md`) en el primer segundo — ambos se
> cargan solos desde `CLAUDE.md`.
