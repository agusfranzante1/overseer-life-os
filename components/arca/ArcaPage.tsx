'use client'
import { useState, useEffect, useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import { Receipt, Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'

/** ARCA — facturación electrónica propia (monotributo, factura C).
 *
 *  Esta primera etapa es el DIAGNÓSTICO: antes de poder emitir hay que probar
 *  que la cadena completa funciona, y los tres tramos fallan distinto aunque
 *  desde afuera se vean igual ("no puedo facturar"):
 *
 *    config → servidores de ARCA → certificado → puntos de venta
 *
 *  Separarlos es lo que convierte "no anda" en "falta asociar el servicio
 *  wsfe al certificado", que sí se puede arreglar.
 *
 *  El formulario de emisión viene cuando esto dé verde: escribir una pantalla
 *  de facturar contra algo que todavía no autentica es inventar.
 */

const noop = () => () => {}
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false)
}

interface Estado {
  ok: boolean
  etapa?: string
  entorno?: string
  cuit?: string
  faltan?: string[]
  mensaje?: string
  pista?: string
  servidores?: { app: string; db: string; auth: string }
  ticketVenceEn?: string
  puntosDeVenta?: { nro: number; tipo: string; bloqueado: boolean }[]
  error?: string
}

const ETAPAS = [
  { id: 'config', label: 'Credenciales en el servidor' },
  { id: 'servidores', label: 'ARCA responde' },
  { id: 'credencial', label: 'El certificado autentica' },
  { id: 'puntos-de-venta', label: 'Puntos de venta habilitados' },
] as const

export function ArcaPage() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [cargando, setCargando] = useState(false)
  const montado = useHydrated()

  const probar = async () => {
    setCargando(true)
    try {
      const r = await fetch('/api/arca/estado', { cache: 'no-store' })
      const j = await r.json() as Estado
      // Sin `mensaje` la pantalla quedaría muda y el diagnóstico en gris, que
      // es justo el fallo silencioso que no queremos (BASE nº6). El 401 pasa
      // de verdad: con la sesión vencida la ruta no puede ni leer la config.
      if (!j.mensaje) {
        j.mensaje = r.status === 401
          ? 'Tu sesión venció o no estás logueado: volvé a entrar y probá de nuevo.'
          : `El servidor respondió ${r.status} sin explicar por qué.`
      }
      setEstado(j)
    } catch (e) {
      setEstado({ ok: false, mensaje: `No se pudo consultar el estado: ${e instanceof Error ? e.message : 'error de red'}` })
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { probar() }, [])

  if (!montado) {
    return <div className="p-6"><div className="h-10 w-52 bg-white/[0.03] rounded-xl animate-pulse" /></div>
  }

  // Hasta dónde llegó la cadena. `etapa` es donde SE CORTÓ (o 'listo').
  const idxCorte = estado?.etapa === 'listo'
    ? ETAPAS.length
    : ETAPAS.findIndex((e) => e.id === estado?.etapa)

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-none flex items-center gap-3.5">
            <span className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 24%, transparent), color-mix(in srgb, var(--app-accent) 8%, transparent))',
                border: '1px solid color-mix(in srgb, var(--app-accent) 38%, transparent)',
                boxShadow: '0 0 28px -8px color-mix(in srgb, var(--app-accent) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.10)',
              }}>
              <Receipt className="w-6 h-6 md:w-7 md:h-7" style={{ color: 'var(--app-accent)' }} />
            </span>
            <span className="text-hero pb-1">ARCA</span>
          </h1>
          <p className="text-[13px] text-zinc-500">
            Tu facturación, acá adentro. Monotributo · factura C.
          </p>
        </div>
        <button onClick={probar} disabled={cargando}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:border-zinc-600 hover:text-white transition-colors disabled:opacity-50">
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Probar conexión
        </button>
      </div>

      {/* Entorno — que no haya dudas de si lo que se emite vale o no */}
      {estado?.entorno && (
        <div className={`rounded-xl px-4 py-3 border text-sm ${
          estado.entorno === 'produccion'
            ? 'bg-red-500/10 border-red-500/30 text-red-200'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
        }`}>
          {estado.entorno === 'produccion'
            ? <><strong>PRODUCCIÓN</strong> — lo que se emita acá son comprobantes fiscales de verdad.</>
            : <><strong>HOMOLOGACIÓN</strong> (pruebas) — los comprobantes que se emitan NO tienen valor fiscal.</>}
          {estado.cuit && <span className="text-zinc-400"> · CUIT {estado.cuit}</span>}
        </div>
      )}

      {/* La cadena, tramo por tramo */}
      <section className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-white">Diagnóstico</h2>
        <div className="space-y-2">
          {ETAPAS.map((etapa, i) => {
            const paso = idxCorte < 0 ? -1 : idxCorte
            const ok = paso > i || estado?.etapa === 'listo'
            const fallo = paso === i && !!estado && estado.etapa !== 'listo'
            return (
              <div key={etapa.id} className="flex items-center gap-2.5 text-sm">
                {cargando ? <Loader2 className="w-4 h-4 text-zinc-600 animate-spin shrink-0" />
                  : ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  : fallo ? <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  : <span className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />}
                <span className={ok ? 'text-zinc-300' : fallo ? 'text-red-300' : 'text-zinc-600'}>
                  {etapa.label}
                </span>
              </div>
            )
          })}
        </div>

        {estado?.mensaje && (
          <div className={`text-xs rounded-lg px-3 py-2.5 leading-relaxed ${
            estado.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200'
                      : 'bg-red-500/10 border border-red-500/30 text-red-200'
          }`}>
            {estado.mensaje}
            {estado.pista && <p className="mt-1.5 text-zinc-400">{estado.pista}</p>}
          </div>
        )}

        {estado?.servidores && (
          <p className="text-[11px] font-mono text-zinc-600">
            servidores de ARCA · app {estado.servidores.app} · base {estado.servidores.db} · auth {estado.servidores.auth}
          </p>
        )}
        {estado?.puntosDeVenta && estado.puntosDeVenta.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {estado.puntosDeVenta.map((p) => (
              <span key={p.nro}
                className={`text-[11px] px-2 py-0.5 rounded-md border ${
                  p.bloqueado ? 'border-red-500/40 text-red-300' : 'border-emerald-500/30 text-emerald-300'
                }`}>
                PV {String(p.nro).padStart(5, '0')} · {p.tipo}{p.bloqueado ? ' · bloqueado' : ''}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Qué falta hacer del lado del usuario. Se muestra cuando la cadena se
          corta antes de autenticar: es información accionable, no relleno. */}
      {estado && !estado.ok && estado.etapa && (
        <section className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-white">Para que esto funcione</h2>
          <ol className="list-decimal list-inside space-y-3 text-xs text-zinc-400 leading-relaxed">
            <li>
              <strong className="text-zinc-200">Generar la clave privada y el pedido de certificado</strong> en
              tu máquina. El DN tiene el formato que exige ARCA (el CUIT va en <code className="text-zinc-300">serialNumber</code>):
              <code className="block mt-1 text-[11px] text-zinc-300 bg-black/40 rounded px-2 py-1.5 whitespace-pre-wrap break-all">
{`openssl genrsa -out arca-homo.key 2048
openssl req -new -key arca-homo.key -out arca-homo.csr \\
  -subj "/C=AR/O=TU NOMBRE/CN=overseer/serialNumber=CUIT 20XXXXXXXXX"`}
              </code>
              <span className="block mt-1 text-zinc-500">
                El <code className="text-zinc-400">.key</code> no se comparte con nadie, ni con ARCA: solo se sube el <code className="text-zinc-400">.csr</code>.
              </span>
            </li>
            <li>
              En <strong className="text-zinc-200">WSASS</strong> (autogestión de HOMOLOGACIÓN, distinta de
              producción; el servicio se adhiere una vez desde el Administrador de Relaciones), dos pasos
              con esos nombres exactos: <strong className="text-zinc-200">&quot;Nuevo Certificado&quot;</strong> —
              pegar el <code className="text-zinc-300">.csr</code>, poner un alias y bajar el <code className="text-zinc-300">.crt</code> —
              y después <strong className="text-zinc-200">&quot;Crear autorización a servicio&quot;</strong>, eligiendo
              el alias y el servicio <code className="text-zinc-300">wsfe</code>. Sin ese segundo paso el
              certificado autentica pero no puede facturar, y es el error que más cuesta encontrar.
              <a href="https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 ml-1 text-indigo-400 hover:text-indigo-300">
                Abrir WSASS <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>Habilitar al menos un <strong className="text-zinc-200">punto de venta</strong> de tipo webservice.</li>
            <li>
              Cargar en el servidor (Vercel → Settings → Environment Variables) y <strong className="text-zinc-200">redeployar</strong>,
              que si no las variables nuevas no se toman:
              <code className="block mt-1 text-[11px] text-zinc-300 bg-black/40 rounded px-2 py-1.5">
                ARCA_CUIT · ARCA_CERT · ARCA_KEY · ARCA_ENTORNO=homologacion
              </code>
            </li>
          </ol>
          <p className="text-[11px] text-amber-300/80 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            La clave privada no se pega nunca en un chat ni se sube al repositorio: va solo como
            variable de entorno.
          </p>
        </section>
      )}

      {estado?.ok && (
        <section className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-1">Lo que sigue</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            La conexión está probada. El próximo paso es el formulario para emitir la factura C y
            el listado de comprobantes con &quot;repetir esta factura&quot;.
          </p>
        </section>
      )}
    </motion.div>
  )
}
