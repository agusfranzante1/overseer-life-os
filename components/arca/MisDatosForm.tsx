'use client'
import { useState, useEffect } from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'
import { camposFaltantesEmisor, EMISOR_VACIO, type DatosEmisor } from '@/lib/arca/emisor'

/** Tus datos como emisor: lo que la factura impresa tiene que mostrar de vos.
 *
 *  Se cargan una vez. No viajan a ARCA — ARCA ya sabe quién sos por el CUIT
 *  del certificado. Existen porque facturando por webservice **el PDF lo
 *  emitimos nosotros**, y el comprobante los lleva por obligación.
 *
 *  Viven en el blob `app_preferences`, así que se cargan en un dispositivo y
 *  aparecen en los otros.
 */
export function MisDatosForm({ cuit }: { cuit?: string }) {
  const guardado = useAppStore((s) => s.arcaEmisor)
  const setArcaEmisor = useAppStore((s) => s.setArcaEmisor)
  const [draft, setDraft] = useState<DatosEmisor>(guardado ?? EMISOR_VACIO)
  const [guardadoOk, setGuardadoOk] = useState(false)

  useEffect(() => { setDraft(guardado ?? EMISOR_VACIO) }, [guardado])

  const faltan = camposFaltantesEmisor(draft)
  const campo = 'w-full bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:outline-none'
  const label = 'block text-[11px] font-medium text-zinc-500 mb-1'
  const set = (k: keyof DatosEmisor) => (v: string) => {
    setDraft((d) => ({ ...d, [k]: v }))
    setGuardadoOk(false)
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Estos datos salen impresos en cada factura. No se le mandan a ARCA (ya sabe quién sos por
        el certificado): hacen falta porque, facturando por webservice, el comprobante en PDF lo
        genera Overseer y no ARCA. Se cargan una vez.
      </p>

      {cuit && (
        <div className="text-xs bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2.5 text-zinc-400">
          <strong className="text-zinc-200">CUIT {cuit}</strong> — sale del certificado, no se
          escribe acá.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={label}>Razón social</label>
          <input className={campo} placeholder="APELLIDO NOMBRE" value={draft.razonSocial}
            onChange={(e) => set('razonSocial')(e.target.value)} />
          <p className="text-[11px] text-zinc-600 mt-1">Como figura en ARCA, no un nombre de fantasía.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Domicilio comercial</label>
          <input className={campo} placeholder="Calle 1234 - Localidad, Provincia"
            value={draft.domicilioComercial} onChange={(e) => set('domicilioComercial')(e.target.value)} />
        </div>
        <div>
          <label className={label}>Condición frente al IVA</label>
          <input className={campo} list="arca-cond-emisor" value={draft.condicionIva}
            onChange={(e) => set('condicionIva')(e.target.value)} />
          <datalist id="arca-cond-emisor">
            <option value="Responsable Monotributo" />
            <option value="IVA Responsable Inscripto" />
            <option value="IVA Sujeto Exento" />
          </datalist>
        </div>
        <div>
          <label className={label}>Ingresos brutos</label>
          <input className={campo} placeholder="20XXXXXXXXX" value={draft.ingresosBrutos}
            onChange={(e) => set('ingresosBrutos')(e.target.value)} />
          <p className="text-[11px] text-zinc-600 mt-1">Suele ser el mismo número que el CUIT.</p>
        </div>
        <div>
          <label className={label}>Fecha de inicio de actividades</label>
          <input type="date" className={campo} value={draft.inicioActividades}
            onChange={(e) => set('inicioActividades')(e.target.value)} />
        </div>
      </div>

      {faltan.length > 0 && (
        <p className="text-xs text-amber-300/90 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Sin esto no se puede imprimir la factura. Falta: {faltan.join(', ')}.
        </p>
      )}

      <button
        onClick={() => { setArcaEmisor(draft); setGuardadoOk(true) }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
        style={{ background: 'color-mix(in srgb, var(--app-accent) 85%, transparent)' }}>
        {guardadoOk ? <Check className="w-4 h-4" /> : null}
        {guardadoOk ? 'Guardado' : 'Guardar mis datos'}
      </button>
    </div>
  )
}
