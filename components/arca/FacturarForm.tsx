'use client'
import { useState, useEffect, useMemo } from 'react'
import { Loader2, Send, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'
import { useArcaStore, descripcionesUsadas, puntoVentaSugerido, type ComprobanteArca } from '@/lib/store/arcaStore'
import {
  CBTE, CONCEPTO, DOC, CONDICIONES_IVA_C, condicionIvaPorDefecto, cuitValido, validarFacturaC,
  type BorradorFacturaC,
} from '@/lib/arca/facturaC'
import { numeroVisible, nombreTipo, type BorradorRepetido, type EntornoArca } from '@/lib/arca/comprobante'

/** El formulario de emisión.
 *
 *  Valida ANTES de mandar con la misma función que usa el servidor
 *  (`validarFacturaC`), así los errores se ven mientras se escribe y no
 *  después de un viaje a ARCA. No es una validación "de adorno" duplicada:
 *  es literalmente el mismo módulo puro corriendo en los dos lados.
 *
 *  En PRODUCCIÓN hay un paso de confirmación; en homologación no. La razón es
 *  proporcional: en homologación nada de esto tiene valor fiscal y el objetivo
 *  es que facturar sea rápido. En producción, un click de más vale menos que
 *  una nota de crédito.
 */

/** `YYYY-MM-DD` de hoy en la zona del usuario. Nunca `toISOString()`: después
 *  de las 21 en Argentina ya es el día siguiente en UTC. */
function hoyLocal(timezone: string): string {
  const f = (tz: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  try { return f(timezone) } catch { return f('America/Argentina/Buenos_Aires') }
}

/** Primero y último día del mes de una fecha. El caso típico del monotributo
 *  es el abono del mes, así que es el default que ahorra dos clicks. */
function mesDe(ymd: string): { desde: string; hasta: string } {
  const [y, m] = ymd.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

interface Props {
  entorno: EntornoArca
  puntosDeVenta: { nro: number; bloqueado: boolean }[]
  /** Las condiciones de IVA que ARCA dijo que acepta. Vacio = usar la tabla
   *  de respaldo: no poder leer el catalogo no puede impedir facturar. */
  condicionesIva?: { id: number; desc: string }[]
  /** Un comprobante para repetir: llena el formulario y se limpia al emitir. */
  repetir?: BorradorRepetido | null
  onRepetirConsumido?: () => void
  onEmitido?: (c: ComprobanteArca) => void
}

export function FacturarForm({ entorno, puntosDeVenta, condicionesIva, repetir, onRepetirConsumido, onEmitido }: Props) {
  const timezone = useAppStore((s) => s.timezone)
  const comprobantes = useArcaStore((s) => s.comprobantes)
  const upsertComprobante = useArcaStore((s) => s.upsertComprobante)

  const hoy = hoyLocal(timezone)
  const mes = mesDe(hoy)
  // Ordenados por número: ARCA no garantiza el orden, y el desplegable no puede
  // cambiar de un día para el otro.
  const habilitados = puntosDeVenta.filter((p) => !p.bloqueado).sort((a, b) => a.nro - b.nro)
  const sugerido = puntoVentaSugerido(comprobantes, entorno, habilitados.map((p) => p.nro))

  const [puntoVenta, setPuntoVenta] = useState<number>(sugerido ?? 1)
  const [tipo, setTipo] = useState<number>(CBTE.facturaC)
  const [concepto, setConcepto] = useState<number>(CONCEPTO.servicios)
  const [docTipo, setDocTipo] = useState<number>(DOC.cuit)
  const [docNro, setDocNro] = useState('')
  const [condIva, setCondIva] = useState<number>(condicionIvaPorDefecto(DOC.cuit))
  const [receptorNombre, setReceptorNombre] = useState('')
  // Solo para el PDF: ARCA no los recibe, pero el comprobante impreso los exige.
  const [receptorDomicilio, setReceptorDomicilio] = useState('')
  const [condicionVenta, setCondicionVenta] = useState('Contado')
  const [descripcion, setDescripcion] = useState('')
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [servicioDesde, setServicioDesde] = useState(mes.desde)
  const [servicioHasta, setServicioHasta] = useState(mes.hasta)
  const [vencimientoPago, setVencimientoPago] = useState(mes.hasta)

  const [enviando, setEnviando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<{ numero: number; cae: string; observaciones: string[] } | null>(null)

  // Cuando llega un punto de venta real del diagnóstico, adoptarlo: hacerle
  // escribir un número que ARCA va a rechazar no tiene sentido.
  useEffect(() => {
    if (sugerido !== undefined && !habilitados.some((p) => p.nro === puntoVenta)) {
      setPuntoVenta(sugerido)
    }
  }, [habilitados.map((p) => p.nro).join(','), puntoVenta]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Repetir esta factura": el borrador ya viene con las fechas al día (ver
  // `repetirBorrador`). Acá solo se vuelca al formulario.
  useEffect(() => {
    if (!repetir) return
    setPuntoVenta(repetir.puntoVenta)
    setTipo(repetir.tipo)
    // Las importadas del CSV de Mis Comprobantes no traen el concepto (va en 0
    // = "no se sabe"). Pisar el formulario con 0 mandaría un concepto inválido
    // a ARCA: se deja el que ya estaba elegido.
    if ([CONCEPTO.productos, CONCEPTO.servicios, CONCEPTO.ambos].includes(repetir.concepto as 1 | 2 | 3)) {
      setConcepto(repetir.concepto)
    }
    setDocTipo(repetir.docTipo)
    setDocNro(repetir.docNro === '0' ? '' : repetir.docNro)
    if (repetir.condicionIvaReceptor) setCondIva(repetir.condicionIvaReceptor)
    setImporte(String(repetir.importe))
    setFecha(repetir.fecha)
    if (repetir.descripcion) setDescripcion(repetir.descripcion)
    if (repetir.receptorNombre) setReceptorNombre(repetir.receptorNombre)
    if (repetir.receptorDomicilio) setReceptorDomicilio(repetir.receptorDomicilio)
    if (repetir.condicionVenta) setCondicionVenta(repetir.condicionVenta)
    if (repetir.servicioDesde) setServicioDesde(repetir.servicioDesde)
    if (repetir.servicioHasta) setServicioHasta(repetir.servicioHasta)
    if (repetir.vencimientoPago) setVencimientoPago(repetir.vencimientoPago)
    setExito(null)
    setError(null)
    onRepetirConsumido?.()
  }, [repetir]) // eslint-disable-line react-hooks/exhaustive-deps

  const hayServicios = concepto === CONCEPTO.servicios || concepto === CONCEPTO.ambos
  const importeNum = Number(importe.replace(',', '.'))

  const borrador: BorradorFacturaC = useMemo(() => ({
    puntoVenta,
    tipo: tipo as BorradorFacturaC['tipo'],
    concepto: concepto as BorradorFacturaC['concepto'],
    docTipo: docTipo as BorradorFacturaC['docTipo'],
    docNro: docTipo === DOC.consumidorFinal ? '0' : docNro,
    condicionIvaReceptor: condIva,
    importe: Number.isFinite(importeNum) ? importeNum : 0,
    fecha,
    servicioDesde: hayServicios ? servicioDesde : undefined,
    servicioHasta: hayServicios ? servicioHasta : undefined,
    vencimientoPago: hayServicios ? vencimientoPago : undefined,
  }), [puntoVenta, tipo, concepto, docTipo, docNro, condIva, importeNum, fecha, hayServicios, servicioDesde, servicioHasta, vencimientoPago])

  // Los problemas de lo que YA se llenó. Un formulario recién abierto que te
  // grita "falta el importe" y "el CUIT no cierra" es ruido: todavía no
  // escribiste nada. El botón sí queda deshabilitado — la queja se calla, la
  // guarda no.
  const problemasReales = useMemo(() => validarFacturaC(borrador, hoy), [borrador, hoy])
  const problemas = useMemo(() => problemasReales.filter((p) => {
    if (importe.trim() === '' && p.includes('importe')) return false
    if (docNro.trim() === '' && /CUIT|CUIL|DNI|documento/.test(p)) return false
    return true
  }), [problemasReales, importe, docNro])
  const listo = problemasReales.length === 0 && importe.trim() !== ''

  const sugerencias = useMemo(() => descripcionesUsadas(comprobantes, entorno), [comprobantes, entorno])

  const emitir = async () => {
    setEnviando(true)
    setError(null)
    setExito(null)
    try {
      const r = await fetch('/api/arca/facturar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...borrador, descripcion, receptorNombre,
          receptorDomicilio, condicionVenta, timezone,
        }),
      })
      const j = await r.json() as {
        ok: boolean; error?: string; aviso?: string
        comprobante?: ComprobanteArca
      }
      if (!j.ok || !j.comprobante) {
        setError(j.error ?? `El servidor respondió ${r.status} sin explicar por qué.`)
        return
      }
      // El servidor ya la guardó; esto es para verla al instante. El id es
      // determinista, así que no puede duplicarse con el pull.
      upsertComprobante(j.comprobante)
      onEmitido?.(j.comprobante)
      setExito({
        numero: j.comprobante.numero,
        cae: j.comprobante.cae ?? '',
        observaciones: [...(j.comprobante.observaciones ?? []), ...(j.aviso ? [j.aviso] : [])],
      })
      setImporte('')
      setConfirmando(false)
    } catch (e) {
      setError(`No se pudo emitir: ${e instanceof Error ? e.message : 'error de red'}`)
    } finally {
      setEnviando(false)
    }
  }

  const campo = 'w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:outline-none'
  const label = 'block text-[11px] font-medium text-zinc-500 mb-1'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Punto de venta</label>
          {habilitados.length > 0 ? (
            <select className={campo} value={puntoVenta} onChange={(e) => setPuntoVenta(Number(e.target.value))}>
              {habilitados.map((p) => (
                <option key={p.nro} value={p.nro}>{String(p.nro).padStart(5, '0')}</option>
              ))}
            </select>
          ) : (
            <input type="number" min={1} className={campo} value={puntoVenta}
              onChange={(e) => setPuntoVenta(Number(e.target.value))} />
          )}
        </div>
        <div>
          <label className={label}>Tipo</label>
          <select className={campo} value={tipo} onChange={(e) => setTipo(Number(e.target.value))}>
            <option value={CBTE.facturaC}>{nombreTipo(CBTE.facturaC)}</option>
            <option value={CBTE.notaDebitoC}>{nombreTipo(CBTE.notaDebitoC)}</option>
            <option value={CBTE.notaCreditoC}>{nombreTipo(CBTE.notaCreditoC)}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>A quién le facturás</label>
          <select className={campo} value={docTipo}
            onChange={(e) => {
              const d = Number(e.target.value)
              setDocTipo(d)
              // La condición de IVA sigue al tipo de documento, porque es la
              // que acierta casi siempre y porque con "consumidor final" ARCA
              // no acepta otra. Se puede cambiar después.
              setCondIva(condicionIvaPorDefecto(d))
            }}>
            <option value={DOC.cuit}>CUIT</option>
            <option value={DOC.cuil}>CUIL</option>
            <option value={DOC.dni}>DNI</option>
            <option value={DOC.consumidorFinal}>Consumidor final</option>
          </select>
        </div>
        <div>
          <label className={label}>
            {docTipo === DOC.consumidorFinal ? 'Sin documento' : 'Número (sin guiones)'}
          </label>
          <input className={campo} inputMode="numeric" disabled={docTipo === DOC.consumidorFinal}
            placeholder={docTipo === DOC.consumidorFinal ? '—' : '20123456789'}
            value={docTipo === DOC.consumidorFinal ? '' : docNro}
            onChange={(e) => setDocNro(e.target.value.replace(/[^\d-]/g, ''))} />
          {docNro.length >= 11 && (docTipo === DOC.cuit || docTipo === DOC.cuil) && (
            <p className={`text-[11px] mt-1 ${cuitValido(docNro) ? 'text-emerald-400' : 'text-red-400'}`}>
              {cuitValido(docNro) ? 'El CUIT cierra bien' : 'El dígito verificador no cierra'}
            </p>
          )}
        </div>
      </div>

      {/* RG 5616: obligatorio desde 2025. Sin esto ARCA rechaza entero con el
          error 10246. La lista sale de ARCA cuando se pudo leer; si no, de la
          tabla de respaldo. */}
      <div>
        <label className={label}>Condición del receptor frente al IVA</label>
        <select className={campo} value={condIva} onChange={(e) => setCondIva(Number(e.target.value))}
          disabled={docTipo === DOC.consumidorFinal}>
          {(condicionesIva && condicionesIva.length > 0 ? condicionesIva : CONDICIONES_IVA_C)
            .map((c) => <option key={c.id} value={c.id}>{c.desc}</option>)}
        </select>
        {docTipo === DOC.consumidorFinal && (
          <p className="text-[11px] text-zinc-600 mt-1">
            Sin identificar al receptor, ARCA solo acepta &quot;Consumidor Final&quot;.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Nombre del cliente</label>
          <input className={campo} placeholder="Estudio Pérez" value={receptorNombre}
            onChange={(e) => setReceptorNombre(e.target.value)} />
        </div>
        <div>
          <label className={label}>Concepto <span className="text-zinc-700">(qué estás facturando)</span></label>
          <input className={campo} list="arca-descripciones"
            placeholder="Servicio de asesoramiento prestado en el mes de…"
            value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <datalist id="arca-descripciones">
            {sugerencias.map((d) => <option key={d} value={d} />)}
          </datalist>
        </div>
      </div>
      {/* Esto confundía: "(solo acá)" sonaba a que nos lo guardábamos por
          capricho. La verdad es que el webservice de ARCA NO tiene ningún campo
          para el detalle de lo que vendés — solo recibe importes totales. Por
          la web de ARCA ese texto tampoco se registraba: se imprimía en el PDF
          que ARCA te generaba. Por webservice ese PDF lo emitimos nosotros. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Domicilio del cliente</label>
          <input className={campo} placeholder="Av. Argentina 1200 - Neuquén"
            value={receptorDomicilio} onChange={(e) => setReceptorDomicilio(e.target.value)} />
        </div>
        <div>
          <label className={label}>Condición de venta</label>
          <input className={campo} list="arca-condiciones-venta" placeholder="Contado"
            value={condicionVenta} onChange={(e) => setCondicionVenta(e.target.value)} />
          <datalist id="arca-condiciones-venta">
            <option value="Contado" /><option value="Cuenta corriente" />
            <option value="Transferencia bancaria" /><option value="Tarjeta de crédito" />
          </datalist>
        </div>
      </div>

      <p className="text-[11px] text-zinc-600 -mt-2 leading-relaxed">
        Estos cuatro datos <strong className="text-zinc-500">no se le mandan a ARCA</strong>:
        el webservice solo recibe importes, nunca el detalle de lo que vendés (por la web de ARCA
        tampoco se registraba — se imprimía en el PDF). Van a la factura que recibe tu cliente.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={label}>Importe total</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
            <input className={`${campo} pl-7`} inputMode="decimal" placeholder="0,00"
              value={importe} onChange={(e) => setImporte(e.target.value.replace(/[^\d.,]/g, ''))} />
          </div>
        </div>
        <div>
          <label className={label}>Fecha</label>
          <input type="date" className={campo} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          {/* Se llama como en la web de ARCA justamente para NO confundirlo
              con el concepto de arriba (el texto que lee el cliente). Este es
              el campo fiscal: decide si hacen falta las fechas de servicio. */}
          <label className={label}>Conceptos a incluir</label>
          <select className={campo} value={concepto} onChange={(e) => setConcepto(Number(e.target.value))}>
            <option value={CONCEPTO.productos}>Productos</option>
            <option value={CONCEPTO.servicios}>Servicios</option>
            <option value={CONCEPTO.ambos}>Productos y servicios</option>
          </select>
        </div>
      </div>

      {/* Las fechas de servicio son OBLIGATORIAS para ARCA cuando hay
          servicios, y no tiene sentido mostrarlas cuando no. */}
      {hayServicios && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5">
          <div>
            <label className={label}>Servicio desde</label>
            <input type="date" className={campo} value={servicioDesde}
              onChange={(e) => setServicioDesde(e.target.value)} />
          </div>
          <div>
            <label className={label}>Servicio hasta</label>
            <input type="date" className={campo} value={servicioHasta}
              onChange={(e) => setServicioHasta(e.target.value)} />
          </div>
          <div>
            <label className={label}>Vencimiento de pago</label>
            <input type="date" className={campo} value={vencimientoPago}
              onChange={(e) => setVencimientoPago(e.target.value)} />
          </div>
        </div>
      )}

      {problemas.length > 0 && (
        <ul className="text-xs text-amber-300/90 space-y-1">
          {problemas.map((p) => (
            <li key={p} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{p}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="text-xs bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg px-3 py-2.5 leading-relaxed">
          {error}
        </div>
      )}

      {exito && (
        <div className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-lg px-3 py-2.5 leading-relaxed space-y-1">
          <p className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Emitida: {nombreTipo(tipo)} {numeroVisible(puntoVenta, exito.numero)}
          </p>
          <p className="font-mono text-[11px] text-emerald-300/80">CAE {exito.cae}</p>
          {exito.observaciones.map((o) => <p key={o} className="text-amber-300/90">{o}</p>)}
        </div>
      )}

      {/* En producción, un paso de confirmación con el resumen. En
          homologación va directo: nada de lo que se emita tiene valor fiscal
          y el objetivo es que facturar sea rápido. */}
      {confirmando ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
          <p className="text-sm text-red-100">
            Vas a emitir una <strong>{nombreTipo(tipo)} real</strong> por{' '}
            <strong>${importeNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>
            {docTipo !== DOC.consumidorFinal && <> a <strong>{receptorNombre || docNro}</strong></>}.
            Una vez con CAE solo se deshace con una nota de crédito.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={emitir} disabled={enviando}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-400 text-white transition-colors disabled:opacity-50">
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Sí, emitir
            </button>
            <button onClick={() => setConfirmando(false)} disabled={enviando}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/[0.08] text-zinc-300 hover:border-zinc-600">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => entorno === 'produccion' ? setConfirmando(true) : emitir()}
          disabled={!listo || enviando}
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'color-mix(in srgb, var(--app-accent) 85%, transparent)',
            color: 'white',
          }}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {enviando ? 'Emitiendo…'
            : listo ? `Emitir ${nombreTipo(tipo)} por $${importeNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
            : 'Emitir'}
        </button>
      )}
    </div>
  )
}
