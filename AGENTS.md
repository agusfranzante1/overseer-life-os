<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BASES del proyecto

Reglas no negociables. Cada una está acá porque YA se rompió algo por no
seguirla — no son buenas intenciones, son cicatrices.

## 1. TODO es multi-dispositivo. Sin excepción.

El usuario trabaja en la compu, en la notebook y en el celu. Una feature que
solo funciona en el dispositivo donde la creaste está INCOMPLETA, no "lista
para una segunda etapa".

Antes de dar por terminada cualquier feature que guarde algo, responder:

- ¿El campo nuevo está en el **push**?
- ¿Está en el **pull**?
- ¿Está en el **sanitize** del pull? *(ver regla 2)*
- Si vive en `app_preferences`, ¿está en el **fingerprint** de `onAppPrefsChange`?
  Si no, tocarlo no ensucia el dominio y no se sube nunca.
- ¿Hace falta una **migración**? Si sí, crear el `.sql` y AVISARLE al usuario
  explícitamente que la tiene que correr.

## 2. El `sanitize` del pull borra todo lo que no listes

Los pull reconstruyen cada objeto campo por campo. Un campo que no esté ahí
**se borra al sincronizar**, aunque el push lo mande bien.

Ya pasó tres veces: las formas de los mapas mentales, el `folderId` de los
mapas, y el documento de cada oferta. Las tres se detectaron leyendo el pull
ANTES de dar la feature por hecha, no después.

## 3. Las filas-blob se MERGEAN, nunca se pisan

`app_preferences` (y cualquier fila única con un payload JSON) se guarda
entera. Un `upsert` con el payload armado por un cliente **borra las claves
que ese cliente no conoce**.

Esto le borró al usuario toda la configuración del sidebar: la notebook corría
un build viejo, armó el payload sin `navGroups`, y se lo llevó puesto en todos
los dispositivos.

Siempre: leer lo que hay, mergear encima, y recién ahí escribir. Así un
cliente solo pisa las claves que conoce.

## 4. Los defaults nuevos no le pueden cambiar la app a una cuenta que ya existe

Si una feature cambia un default (secciones ocultas, un onboarding, un flag),
el `migrate` del store tiene que dejar a las cuentas existentes como estaban.
Si no, al actualizar les desaparece media app de golpe.

## 5. Verificar corriendo la app, no solo compilando

`tsc` y `next build` no prueban nada de lo que el usuario ve. Para eso está
el modo sin auth:

```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npx next dev -p 3099
```

Con las env vars de Supabase vacías el middleware deja pasar todo
(`middleware.ts` → "legacy local-only mode"), así que se puede entrar a
cualquier sección y medir el DOM de verdad. **Apagar el server al terminar.**

Así se encontraron, entre otros: la sangría de las carpetas que no se veía, el
menú de carpeta que se abría adentro de la tarjeta, el `w-screen` que se salía
por la derecha, y el mapa de conceptos que en mobile dejaba 103px de lienzo.

## 6. Un fallo silencioso es peor que un fallo ruidoso

Nada de "devolver 200 igual" ni de chequeos que dejan pasar el caso de error.
El cron de notificaciones pasó en verde durante quién sabe cuánto tiempo
mientras el dispatcher devolvía 401 y no se mandaba ni una notificación.

## 7. Lo que no se pudo probar, se dice

Si una parte quedó sin verificar (necesita login, no se pudo reproducir), hay
que decirlo explícitamente al entregar. No se presenta como terminado algo que
no se vio funcionar.
