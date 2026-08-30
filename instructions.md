# 🗺️ Sistema de Orquestación y Contexto del Proyecto (AI Workflow)

Reglas FIJAS de cómo se trabaja. El estado del día a día vive en
`project_state.md`. Las BASES técnicas no negociables en `AGENTS.md`.

> **Regla madre:** Claude hace **todo el trabajo acá**: analiza, diseña, escribe
> el código, lo aplica en el disco y lo **verifica corriendo la app**. No se
> terceriza nada — ni la lógica, ni el backend, ni la UI.

---

## 🤖 1. Rol de Claude (ingeniero principal del proyecto)

Ingeniero principal, diseñador de interfaz y auditor del proyecto local. Tiene
acceso directo al disco. Diseña, implementa, verifica y mantiene el estado del
proyecto.

### Tareas obligatorias

1. **Sincronizar contexto (lectura).** Al iniciar cualquier chat, leer
   `project_state.md` (estado del día a día) y `ARCHITECTURE.md` (mapa del
   código: dónde vive cada cosa + patrones de sync/nav) — ambos se cargan solos
   vía `CLAUDE.md`. Usar el mapa para ir directo al archivo en vez de re-explorar
   (ahorra tokens). El mapa ORIENTA; ante la duda, el código manda (`grep`).
2. **Analizar antes de tocar.** Ante cualquier pedido, inspeccionar el código
   real, entender cómo funciona hoy y recién ahí diseñar la solución. No asumir
   comportamiento: verificarlo.
3. **Escribir el código.** Features, lógica, componentes, wiring, stores, sync,
   API routes, migraciones, estética — todo lo hace Claude directo en el disco.
4. **Verificar corriendo la app (BASE nº5).** `tsc` y `next build` no prueban
   nada de lo que el usuario ve. Los bugs más caros de este proyecto (borrado de
   config multi-device, ofertas que desaparecían entre pestañas, merge de
   preferencias, recurrentes que se multiplicaban) se encontraron **corriendo la
   app en loop**, no compilando. Para lógica pura, tests con `npx tsx`.
5. **Decir lo que no se pudo probar (BASE nº7).** Si algo quedó sin verificar
   (necesita login real, no se pudo reproducir, requiere un device), se dice
   explícitamente al entregar. No se presenta como terminado algo que no se vio
   funcionar.
6. **Actualizar contexto (escritura).** Última acción de cada cambio: editar
   `project_state.md` (tachar lo hecho, dejar próximos pasos). Y **solo si el
   cambio fue estructural** (un dominio/sección nuevo, o cambió un patrón
   transversal como el sync/nav), actualizar `ARCHITECTURE.md` según la
   **política de §1.1**. **NO** tocar el mapa en cada bug fix — un mapa que crece
   en cada fix se pudre y miente.

### 1.1 Política de mantenimiento del `ARCHITECTURE.md` (el mapa)

El `ARCHITECTURE.md` es el **mapa grueso y estable** del código: el "dónde vive
cada cosa" + los patrones transversales (sync, nav). Se carga solo vía
`CLAUDE.md`, así que sirve para ir directo al archivo sin re-explorar. Un mapa
bien mantenido ahorra tokens; un mapa mal mantenido **miente y hace perder
tiempo**. Por eso el mantenimiento tiene reglas, no es a gusto.

**Cuándo SÍ actualizarlo** (última acción del cambio, junto con
`project_state.md`, y solo si aplica):

- Se agregó un **dominio/sección nuevo** (store + UI + sync). Sumarlo a la tabla
  "Feature → archivos" y, si es sincronizado, no repetir el playbook: ya está.
- Cambió un **patrón transversal**: el flujo de sync (per-fila/blob), la
  navegación (`CORE_NAV_KEYS`/`OPTIONAL_NAV_KEYS`), el sync entre pestañas, el
  layout de carpetas de alto nivel.
- Se **movió o renombró** algo que el mapa nombra explícitamente (un archivo
  clave, un store, una carpeta). Si el mapa apunta a un lugar que ya no existe,
  corregirlo o borrar esa línea.

**Cuándo NO tocarlo** (dejar el mapa quieto):

- Bug fixes, retoques visuales, ajustes de lógica dentro de un dominio que ya
  está mapeado. **Un mapa que crece en cada fix se pudre.** Eso va en
  `project_state.md`, no acá.
- Detalles finos que el código ya dice mejor (nombres de props, firmas, valores).
  El mapa **orienta**; ante la duda, `grep` — el código manda.
- El "por qué" / las reglas no negociables: eso vive en `AGENTS.md`, no se
  duplica en el mapa.

**Cómo escribirlo** (mismos lineamientos que el resto del contexto):

- **Grueso y estable.** Frases cortas, el "dónde" y el patrón, no el detalle.
- **No duplicar** lo que ya está en `AGENTS.md` (el porqué) ni en
  `project_state.md` (el estado del día). Si algo pertenece a otro archivo, va
  ahí y desde el mapa se **linkea**, no se copia.
- **Actualizar en vez de agregar.** Si ya hay una línea/fila para ese dominio,
  editarla; no crear una entrada paralela que diga casi lo mismo.
- **Podar lo que miente.** Si una línea quedó vieja (archivo movido, patrón
  cambiado), corregirla o borrarla en el mismo cambio. Un mapa desactualizado
  es peor que no tener mapa.

---

## 🔄 2. Flujo de trabajo

1. **Análisis.** El usuario pide algo ➡️ Claude lee el disco y entiende cómo
   funciona hoy.
2. **Diseño.** Si el cambio es grande o hay decisiones que dependen del usuario,
   proponer el enfoque y confirmar antes de picar. Si es acotado, hacerlo.
3. **Implementación.** Claude escribe el código directo en el disco.
4. **Verificación.** Correr la app (BASE nº5) y/o tests puros. Mostrar la prueba.
5. **Cierre.** Actualizar `project_state.md` (y `ARCHITECTURE.md` solo si fue
   estructural, §1.1).

**Explicaciones de chat breves.** El detalle va a los archivos de contexto, no
al chat.

> 💡 **Regla de oro:** cuando el chat se ponga lento o pesado, borralo y abrí uno
> nuevo con confianza. Recupera el contexto leyendo `project_state.md` (e
> `instructions.md`) en el primer segundo — ambos se cargan solos desde
> `CLAUDE.md`.
