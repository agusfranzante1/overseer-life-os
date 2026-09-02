import type { NextConfig } from "next";

/** Sello de build, inyectado en el bundle del cliente.
 *
 *  Existe por un problema concreto y ya vivido dos veces: una pestaña abierta
 *  sigue corriendo el JS del momento en que se cargó, así que puede estar
 *  ejecutando un build viejo —sin los arreglos de sync— mientras el servidor ya
 *  tiene otro. Eso borró la config del sidebar una vez y resucitó tareas
 *  borradas otra. Desde afuera no había forma de saberlo.
 *
 *  Con esto, la versión que corre la pestaña se ve en Configuración, y la que
 *  está deployada se lee en `/api/version`. Si no coinciden, hay que recargar.
 *
 *  `VERCEL_GIT_COMMIT_SHA` lo pone Vercel solo en cada deploy; en local queda
 *  "dev". No hay que configurar nada a mano. */
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
