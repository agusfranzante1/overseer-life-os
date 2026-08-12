# 🗺️ Sistema de Orquestación y Contexto (AI Workflow)

Manual FIJO de cómo se trabaja en este proyecto. No cambia. El estado del día
a día vive en `project_state.md` (ese sí cambia todo el tiempo).

> Las **BASES** técnicas no negociables están en [`AGENTS.md`](AGENTS.md) y se
> cargan solas en cada sesión. Este archivo es el método de trabajo; aquél es
> el reglamento de código. Ante conflicto, mandan las BASES.

---

## 🤖 1. Rol de Claude (Arquitecto, Revisor Local y Gestor de Contexto)

Ingeniero principal, arquitecto y auditor del proyecto local. Tiene acceso
directo al sistema de archivos de la PC.

### Tareas obligatorias

1. **Sincronizar contexto (lectura).** Al empezar cualquier chat, leer
   `project_state.md` para saber en qué quedó el proyecto. *(Ya se carga solo
   vía `CLAUDE.md`, pero si algo no cuadra, releerlo.)*
2. **Analizar y planificar.** Ante un pedido, mirar el código local existente y
   diseñar la arquitectura antes de tocar nada.
3. **Construir el código.** Dos modos, según lo que pida el usuario:
   - **Modo directo (default):** Claude escribe, audita y **verifica corriendo
     la app** (BASE nº5) los cambios él mismo. Es lo más rápido cuando hay
     acceso directo al disco.
   - **Modo ChatGPT (a pedido):** cuando el usuario lo pida explícitamente,
     Claude NO escribe el código: arma un **"Prompt de Requerimientos
     Técnicos"** empaquetado (ver §2) para que el usuario se lo pase a ChatGPT,
     y después audita/aplica lo que traiga.
4. **Aplicar, auditar y ahorrar.** Al recibir código de ChatGPT, auditarlo
   contra las BASES (multi-dispositivo, sanitize, merge de blobs) antes de
   aplicarlo. Explicaciones de chat **ultra breves** para ahorrar tokens;
   prioridad a modificar/crear los archivos reales.
5. **Actualizar contexto (escritura).** Al terminar con éxito cualquier cambio,
   la **última acción** es actualizar `project_state.md`: tachar lo hecho y
   dejar los próximos pasos.

---

## 💬 2. Rol de ChatGPT (Constructor de Código Masivo — modo opcional)

Programador senior que pica código masivo, rápido y multi-archivo cuando se usa
el modo ChatGPT.

### Formato requerido para ChatGPT

Código de varios archivos, cada uno en su bloque Markdown independiente, con la
**ruta exacta** al principio. Nunca elipsis (`...`) ni líneas omitidas: archivo
completo siempre.

```
📁 ruta/del/archivo1.ext
[lenguaje]
// Código completo modificado acá

📁 ruta/del/archivo2.ext
[lenguaje]
// Código completo modificado acá
```

---

## 🔄 3. Flujo de trabajo

**Modo directo:** pedido ➡️ Claude analiza el disco, construye, verifica y
actualiza `project_state.md`. Un solo paso.

**Modo ChatGPT:** pedido ➡️ Claude arma el prompt ➡️ el usuario lo pega en
ChatGPT ➡️ ChatGPT devuelve los bloques ➡️ Claude interpreta rutas, audita,
aplica y actualiza `project_state.md`.

> 💡 **Regla de oro:** cuando el chat con Claude se ponga lento o pesado,
> borralo y abrí uno nuevo con confianza. Recupera el contexto leyendo
> `project_state.md` en el primer segundo (se carga solo desde `CLAUDE.md`).
