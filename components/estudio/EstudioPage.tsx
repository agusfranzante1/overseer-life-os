'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Plus, ChevronLeft, ChevronDown, ChevronRight,
  Pencil, Trash2, Calendar, X, BookOpen, Layers,
} from 'lucide-react'
import { useStudyStore } from '@/lib/store/studyStore'
import { useConceptStore } from '@/lib/store/conceptStore'
import { cleanupLegacySubjectProjects } from '@/lib/study/legacyCleanup'
import { temaProgress, parcialProgress, aggregate } from '@/lib/study/progress'
import type { Carrera, Materia, Parcial, Tema, StudyProgress } from '@/lib/study/types'
import { ConceptMapCanvas } from './ConceptMapCanvas'

// ─── Paletas ─────────────────────────────────────────────────────────────────

const PALETTE = [
  '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#a855f7',
  '#06b6d4', '#f97316', '#84cc16', '#ef4444', '#6366f1',
]
const CARRERA_ICONS = ['🎓', '🏛️', '⚖️', '💻', '🧬', '🩺', '📐', '🎨', '🏗️', '💼', '🔬', '🧠']
const MATERIA_ICONS = ['📚', '📖', '🧮', '🔬', '🧪', '🧬', '⚖️', '🎨', '🎭', '🎼', '💻', '📐', '🗺️', '🏛️', '🧠']

const DEFAULT_CARRERA_COLOR = '#a855f7'

// ─── Helpers de progreso ───────────────────────────────────────────────────────

function useMateriaProgress(materiaId: string): StudyProgress {
  const parciales = useStudyStore((s) => s.parciales)
  const temas = useStudyStore((s) => s.temas)
  return useMemo(() => {
    const ps = parciales.filter((p) => p.materiaId === materiaId)
    return aggregate(ps.map((p) => parcialProgress(temas.filter((t) => t.parcialId === p.id))))
  }, [materiaId, parciales, temas])
}

function useCarreraProgress(carreraId: string): StudyProgress {
  const materias = useStudyStore((s) => s.materias)
  const parciales = useStudyStore((s) => s.parciales)
  const temas = useStudyStore((s) => s.temas)
  return useMemo(() => {
    const ms = materias.filter((m) => m.carreraId === carreraId)
    return aggregate(ms.map((m) => {
      const ps = parciales.filter((p) => p.materiaId === m.id)
      return aggregate(ps.map((p) => parcialProgress(temas.filter((t) => t.parcialId === p.id))))
    }))
  }, [carreraId, materias, parciales, temas])
}

// ─── Shared UI ─────────────────────────────────────────────────────────────────

function ProgressBar({ pct, color, height = 1.5 }: { pct: number; color: string; height?: number }) {
  return (
    <div className="rounded-full overflow-hidden" style={{ height, background: 'var(--surface-fill)' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}cc)`, boxShadow: `0 0 8px ${color}77` }}
      />
    </div>
  )
}

function ModalShell({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: `radial-gradient(circle at 0% 0%, rgba(217, 70, 239, 0.10), transparent 50%), linear-gradient(180deg, rgba(20, 23, 30, 0.98), rgba(15, 17, 23, 0.99))`,
          border: '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow: '0 30px 80px -10px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">{children}</div>
        <div className="flex items-center gap-2 mt-6">{footer}</div>
      </motion.div>
    </motion.div>
  )
}

function fieldClass() {
  return 'w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-fuchsia-500/40'
}
function labelClass() {
  return 'block text-[11px] font-medium text-zinc-400 mb-1.5'
}

function IconPicker({ icons, value, onChange }: { icons: string[]; value: string; onChange: (i: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {icons.map((ic) => (
        <button key={ic} onClick={() => onChange(ic)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${value === ic ? 'ring-2 ring-fuchsia-400' : ''}`}
          style={{
            background: value === ic ? 'rgba(217, 70, 239, 0.18)' : 'var(--card-bg)',
            border: `1px solid ${value === ic ? 'rgba(217, 70, 239, 0.40)' : 'rgba(255, 255, 255, 0.10)'}`,
          }}>{ic}</button>
      ))}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button key={c} onClick={() => onChange(c)}
          className={`w-8 h-8 rounded-full transition-all ${value === c ? 'ring-2 ring-white' : ''}`}
          style={{ background: c, boxShadow: value === c ? `0 0 12px ${c}` : 'none' }} title={c} />
      ))}
    </div>
  )
}

function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: 'linear-gradient(135deg, #d946ef, #a855f7)',
        boxShadow: '0 0 20px -6px rgba(217, 70, 239, 0.55), inset 0 1px 0 rgba(255,255,255,0.15)',
      }}>{children}</button>
  )
}
function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-300 transition-colors"
      style={{ background: 'var(--card-bg)', border: '1px solid rgba(255, 255, 255, 0.10)' }}>{children}</button>
  )
}

// ─── Root: navegación por niveles ──────────────────────────────────────────────

export function EstudioPage() {
  const carreras = useStudyStore((s) => s.carreras)
  const [selectedCarreraId, setSelectedCarreraId] = useState<string | null>(null)
  const [selectedMateriaId, setSelectedMateriaId] = useState<string | null>(null)

  // Limpieza one-time de las materias viejas que vivían en el task manager.
  useEffect(() => { cleanupLegacySubjectProjects() }, [])

  const sortedCarreras = useMemo(
    () => [...carreras].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [carreras],
  )

  const selectedCarrera = selectedCarreraId ? carreras.find((c) => c.id === selectedCarreraId) ?? null : null
  const selectedMateria = useStudyStore((s) => selectedMateriaId ? s.materias.find((m) => m.id === selectedMateriaId) ?? null : null)

  // Si la materia abierta vive en otra carrera (no debería), o se borró, reset.
  if (selectedMateria) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6">
        <MateriaDetail materia={selectedMateria} onBack={() => setSelectedMateriaId(null)} />
      </motion.div>
    )
  }
  if (selectedCarrera) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6">
        <CarreraDetail
          carrera={selectedCarrera}
          onBack={() => setSelectedCarreraId(null)}
          onOpenMateria={(id) => setSelectedMateriaId(id)}
        />
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6">
      <CarrerasList carreras={sortedCarreras} onOpen={(id) => setSelectedCarreraId(id)} />
    </motion.div>
  )
}

// ─── Nivel 0: Carreras ─────────────────────────────────────────────────────────

function CarrerasList({ carreras, onOpen }: { carreras: Carrera[]; onOpen: (id: string) => void }) {
  const deleteCarrera = useStudyStore((s) => s.deleteCarrera)
  const [showCreate, setShowCreate] = useState(false)

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-none flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-fuchsia-400" /> Estudio
          </h1>
          <p className="text-[13px] text-zinc-500">Carreras → materias → parciales → temas. Independiente del task manager.</p>
        </div>
        <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #d946ef, #a855f7)', boxShadow: '0 0 24px -8px rgba(217, 70, 239, 0.6), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
          <Plus className="w-4 h-4" /> Nueva carrera
        </motion.button>
      </div>

      {carreras.length === 0 ? (
        <EmptyState title="Sin carreras todavía" hint="Creá tu primera carrera para empezar a organizar materias, parciales y temas." onCreate={() => setShowCreate(true)} cta="Crear carrera" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {carreras.map((c) => (
            <CarreraCard key={c.id} carrera={c} onClick={() => onOpen(c.id)} onDelete={() => {
              if (confirm(`¿Eliminar la carrera "${c.name}"?\nEsto borra sus materias, parciales y temas.\n\nNo se puede deshacer.`)) deleteCarrera(c.id)
            }} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateCarreraModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); onOpen(id) }} />}
      </AnimatePresence>
    </>
  )
}

function CarreraCard({ carrera, onClick, onDelete }: { carrera: Carrera; onClick: () => void; onDelete: () => void }) {
  const prog = useCarreraProgress(carrera.id)
  const materiaCount = useStudyStore((s) => s.materias.filter((m) => m.carreraId === carrera.id).length)
  const color = carrera.color ?? DEFAULT_CARRERA_COLOR
  return (
    <EntityCard color={color} icon={carrera.icon ?? '🎓'} title={carrera.name}
      subtitle={carrera.institucion || 'Sin institución'} prog={prog} progLabel="temas"
      footer={<span className="flex items-center gap-1.5"><Layers className="w-3 h-3" />{materiaCount} {materiaCount === 1 ? 'materia' : 'materias'}</span>}
      onClick={onClick} onDelete={onDelete} />
  )
}

// ─── Nivel 1: Materias de una carrera ──────────────────────────────────────────

function CarreraDetail({ carrera, onBack, onOpenMateria }: { carrera: Carrera; onBack: () => void; onOpenMateria: (id: string) => void }) {
  const materias = useStudyStore((s) => s.materias)
  const deleteCarrera = useStudyStore((s) => s.deleteCarrera)
  const deleteMateria = useStudyStore((s) => s.deleteMateria)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const prog = useCarreraProgress(carrera.id)
  const color = carrera.color ?? DEFAULT_CARRERA_COLOR

  const carreraMaterias = useMemo(
    () => materias.filter((m) => m.carreraId === carrera.id).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [materias, carrera.id],
  )

  return (
    <>
      <DetailHeader
        onBack={onBack} icon={carrera.icon ?? '🎓'} color={color} title={carrera.name}
        subtitle={carrera.institucion || 'Sin institución'} prog={prog} progLabel="temas de la carrera"
        onEdit={() => setShowEdit(true)}
        onDelete={() => { if (confirm(`¿Eliminar la carrera "${carrera.name}"?\nBorra todas sus materias, parciales y temas.`)) { deleteCarrera(carrera.id); onBack() } }}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Materias</h2>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 transition-all">
          <Plus className="w-4 h-4" /> Nueva materia
        </button>
      </div>

      {carreraMaterias.length === 0 ? (
        <EmptyState title="Sin materias" hint="Agregá la primera materia de esta carrera." onCreate={() => setShowCreate(true)} cta="Crear materia" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {carreraMaterias.map((m) => (
            <MateriaCard key={m.id} materia={m} fallbackColor={color} onClick={() => onOpenMateria(m.id)}
              onDelete={() => { if (confirm(`¿Eliminar la materia "${m.name}"?\nBorra sus parciales y temas.`)) deleteMateria(m.id) }} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateMateriaModal carreraId={carrera.id} onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); onOpenMateria(id) }} />}
        {showEdit && <EditCarreraModal carrera={carrera} onClose={() => setShowEdit(false)} />}
      </AnimatePresence>
    </>
  )
}

function MateriaCard({ materia, fallbackColor, onClick, onDelete }: { materia: Materia; fallbackColor: string; onClick: () => void; onDelete: () => void }) {
  const prog = useMateriaProgress(materia.id)
  const parcialCount = useStudyStore((s) => s.parciales.filter((p) => p.materiaId === materia.id).length)
  const color = materia.color ?? fallbackColor
  const sub = [materia.codigo, materia.cuatrimestre, materia.profesor].filter(Boolean).join(' · ') || 'Sin info'
  return (
    <EntityCard color={color} icon={materia.icon ?? '📚'} title={materia.name} subtitle={sub}
      prog={prog} progLabel="temas"
      footer={parcialCount > 0 ? <span className="flex items-center gap-1.5"><Layers className="w-3 h-3" />{parcialCount} {parcialCount === 1 ? 'parcial' : 'parciales'}</span> : null}
      onClick={onClick} onDelete={onDelete} />
  )
}

// ─── Nivel 2 + 3: Materia → Parciales → Temas → ítems ──────────────────────────

function MateriaDetail({ materia, onBack }: { materia: Materia; onBack: () => void }) {
  const parciales = useStudyStore((s) => s.parciales)
  const addParcial = useStudyStore((s) => s.addParcial)
  const deleteMateria = useStudyStore((s) => s.deleteMateria)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddParcial, setShowAddParcial] = useState(false)
  const [newParcial, setNewParcial] = useState('')
  const [openParcialId, setOpenParcialId] = useState<string | null>(null)
  const prog = useMateriaProgress(materia.id)
  const color = materia.color ?? DEFAULT_CARRERA_COLOR

  const list = useMemo(
    () => parciales.filter((p) => p.materiaId === materia.id).sort((a, b) => a.sortOrder - b.sortOrder),
    [parciales, materia.id],
  )
  // Abrir el primero por default cuando carga.
  useEffect(() => { setOpenParcialId((prev) => prev ?? list[0]?.id ?? null) }, [list])

  const submitParcial = () => {
    const label = newParcial.trim()
    if (!label) return
    const id = addParcial({ materiaId: materia.id, label })
    setNewParcial(''); setShowAddParcial(false); setOpenParcialId(id)
  }

  const sub = [materia.codigo, materia.profesor, materia.cuatrimestre].filter(Boolean).join(' · ')
  const isConceptos = materia.mode === 'conceptos'

  // Modo conceptos: header + lienzo de conceptos (no parciales/temas).
  if (isConceptos) {
    return (
      <div className="space-y-6">
        <DetailHeader
          onBack={onBack} icon={materia.icon ?? '🧠'} color={color} title={materia.name}
          subtitle={sub || 'Base de conceptos — arrastrá, desplegá y agrupá por área.'}
          onEdit={() => setShowEdit(true)}
          onDelete={() => { if (confirm(`¿Eliminar la materia "${materia.name}"?\nBorra su mapa de conceptos.`)) { useConceptStore.getState().removeMap(materia.id); deleteMateria(materia.id); onBack() } }}
        />
        <ConceptMapCanvas materiaId={materia.id} accent={color} />
        <AnimatePresence>
          {showEdit && <EditMateriaModal materia={materia} onClose={() => setShowEdit(false)} />}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DetailHeader
        onBack={onBack} icon={materia.icon ?? '📚'} color={color} title={materia.name}
        subtitle={sub || 'Sin info — editá para agregar profesor, código, cuatrimestre.'}
        prog={prog} progLabel="temas de la materia"
        onEdit={() => setShowEdit(true)}
        onDelete={() => { if (confirm(`¿Eliminar la materia "${materia.name}"?\nBorra sus parciales y temas.`)) { deleteMateria(materia.id); onBack() } }}
      />

      <div className="space-y-3">
        {list.map((p) => (
          <ParcialBlock key={p.id} parcial={p} fallbackColor={color}
            isOpen={openParcialId === p.id} onToggle={() => setOpenParcialId(openParcialId === p.id ? null : p.id)} />
        ))}

        {showAddParcial ? (
          <div className="rounded-2xl p-4 flex items-center gap-2" style={{ background: 'var(--card-bg)', border: '1px solid rgba(255, 255, 255, 0.10)' }}>
            <input autoFocus value={newParcial} onChange={(e) => setNewParcial(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitParcial(); if (e.key === 'Escape') { setShowAddParcial(false); setNewParcial('') } }}
              placeholder='Ej. "Parcial 1", "Unidad 2 — Integrales", "Final"'
              className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-zinc-600" />
            <button onClick={submitParcial} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 transition-all">Agregar</button>
            <button onClick={() => { setShowAddParcial(false); setNewParcial('') }} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <button onClick={() => setShowAddParcial(true)}
            className="w-full rounded-2xl py-3 text-[13px] font-medium text-zinc-400 hover:text-white transition-all flex items-center justify-center gap-2"
            style={{ background: 'var(--card-bg)', border: '1px dashed rgba(255, 255, 255, 0.10)' }}>
            <Plus className="w-4 h-4" /> Agregar parcial
          </button>
        )}
      </div>

      <AnimatePresence>
        {showEdit && <EditMateriaModal materia={materia} onClose={() => setShowEdit(false)} />}
      </AnimatePresence>
    </div>
  )
}

function ParcialBlock({ parcial, fallbackColor, isOpen, onToggle }: { parcial: Parcial; fallbackColor: string; isOpen: boolean; onToggle: () => void }) {
  const temas = useStudyStore((s) => s.temas)
  const addTema = useStudyStore((s) => s.addTema)
  const deleteParcial = useStudyStore((s) => s.deleteParcial)
  const updateParcial = useStudyStore((s) => s.updateParcial)
  const [newTema, setNewTema] = useState('')
  const color = fallbackColor

  // Selector de fecha nativo (calendario) en lugar del viejo prompt() de
  // texto. El input type=date vive oculto solapado sobre el botón; al
  // clickear el botón abrimos el picker nativo con showPicker() (fallback a
  // .click() en browsers que no lo soporten).
  const examDateRef = useRef<HTMLInputElement>(null)
  const openExamDatePicker = () => {
    const input = examDateRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return } catch { /* showPicker puede tirar en contextos sin foco */ }
    }
    input.click()
  }

  const parcialTemas = useMemo(
    () => temas.filter((t) => t.parcialId === parcial.id).sort((a, b) => a.sortOrder - b.sortOrder),
    [temas, parcial.id],
  )
  const prog = parcialProgress(parcialTemas)

  const submitTema = () => {
    const title = newTema.trim()
    if (!title) return
    addTema({ parcialId: parcial.id, title })
    setNewTema('')
  }

  return (
    <div className="rounded-2xl overflow-hidden transition-all" style={{
      background: `radial-gradient(circle at 0% 0%, ${color}1a, transparent 50%), rgba(255, 255, 255, 0.025)`,
      borderLeft: `3px solid ${color}`, borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      borderRight: '1px solid rgba(255, 255, 255, 0.08)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      opacity: parcial.closed ? 0.7 : 1,
    }}>
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={onToggle} className="shrink-0 text-zinc-500 hover:text-zinc-200">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <p className="text-[14px] font-semibold text-white truncate">{parcial.label}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-3">
            <span>{prog.done}/{prog.total} unidades</span>
            {parcial.examDate && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {parcial.examDate}</span>}
          </p>
        </button>
        <span className="font-mono font-semibold tabular-nums text-[12px]" style={{ color }}>{prog.pct}%</span>
        <div className="relative shrink-0 inline-flex">
          <button onClick={(e) => { e.stopPropagation(); openExamDatePicker() }}
            className={`transition-colors ${parcial.examDate ? 'text-indigo-300 hover:text-indigo-200' : 'text-zinc-600 hover:text-zinc-300'}`}
            title={parcial.examDate ? `Examen: ${parcial.examDate} — click para cambiar` : 'Fecha de examen'}><Calendar className="w-3.5 h-3.5" /></button>
          <input
            ref={examDateRef}
            type="date"
            value={parcial.examDate ?? ''}
            onChange={(e) => updateParcial(parcial.id, { examDate: e.target.value || undefined })}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
            tabIndex={-1}
          />
        </div>
        {parcial.examDate && (
          <button onClick={(e) => { e.stopPropagation(); updateParcial(parcial.id, { examDate: undefined }) }}
            className="shrink-0 text-zinc-700 hover:text-red-400 transition-colors" title="Quitar fecha de examen"><X className="w-3 h-3" /></button>
        )}
        <button onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar el parcial "${parcial.label}"? Borra sus temas.`)) deleteParcial(parcial.id) }}
          className="text-zinc-600 hover:text-red-400 transition-colors" title="Eliminar parcial"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>

      <div className="px-5 pb-3"><ProgressBar pct={prog.pct} color={color} height={4} /></div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-5 pb-4 space-y-1.5">
              {parcialTemas.length === 0 ? (
                <p className="text-[11px] text-zinc-600 italic py-2">Sin temas. Agregá el primero ↓</p>
              ) : (
                parcialTemas.map((t) => <TemaRow key={t.id} tema={t} color={color} />)
              )}
              <div className="flex items-center gap-2 pt-1">
                <input value={newTema} onChange={(e) => setNewTema(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitTema() }}
                  placeholder="Nuevo tema (área de estudio que entra al parcial)…"
                  className="flex-1 bg-white/[0.03] border border-dashed border-white/[0.10] rounded-lg px-3 py-2 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-fuchsia-500/40" />
                <button onClick={submitTema}
                  className="shrink-0 px-3 py-2 rounded-lg text-[12px] font-semibold text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 transition-all flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Tema
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TemaRow({ tema, color }: { tema: Tema; color: string }) {
  const toggleTema = useStudyStore((s) => s.toggleTema)
  const deleteTema = useStudyStore((s) => s.deleteTema)
  const updateTema = useStudyStore((s) => s.updateTema)
  const addTemaItem = useStudyStore((s) => s.addTemaItem)
  const toggleTemaItem = useStudyStore((s) => s.toggleTemaItem)
  const deleteTemaItem = useStudyStore((s) => s.deleteTemaItem)
  const [open, setOpen] = useState(false)
  const [newItem, setNewItem] = useState('')

  const prog = temaProgress(tema)
  const hasItems = (tema.items?.length ?? 0) > 0
  const complete = prog.total > 0 && prog.done === prog.total

  const submitItem = () => {
    const text = newItem.trim()
    if (!text) return
    addTemaItem(tema.id, text)
    setNewItem('')
  }

  return (
    <div className="rounded-lg" style={{ background: complete ? 'rgba(16, 185, 129, 0.06)' : 'var(--card-bg)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        {/* Check: si no tiene ítems, marca el tema entero. Si tiene, muestra el % (no toggle directo). */}
        {hasItems ? (
          <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-mono font-bold tabular-nums"
            style={{ color, border: `1.5px solid ${color}66` }}>{prog.pct}</div>
        ) : (
          <button onClick={() => toggleTema(tema.id)}
            className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all ${complete ? 'text-emerald-400' : 'text-zinc-600 hover:text-emerald-400'}`}
            title={complete ? 'Desmarcar' : 'Marcar como estudiado'}>
            <div className="w-3 h-3 rounded-full" style={complete ? { background: '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.6)' } : { border: `1.5px solid ${color}88` }} />
          </button>
        )}
        <button onClick={() => setOpen(!open)} className="flex-1 min-w-0 text-left">
          <p className={`text-[13px] truncate ${complete ? 'text-zinc-400 line-through' : 'text-zinc-200'}`}>{tema.title}</p>
          {hasItems && <p className="text-[10px] text-zinc-600 mt-0.5">{prog.done}/{prog.total} ítems</p>}
        </button>
        <button onClick={() => setOpen(!open)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors" title="Áreas / ítems del tema">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => { if (confirm(`¿Eliminar el tema "${tema.title}"?`)) deleteTema(tema.id) }}
          className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors" title="Eliminar tema"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 pl-10 space-y-1.5">
              {/* Nota opcional */}
              <input value={tema.notes ?? ''} onChange={(e) => updateTema(tema.id, { notes: e.target.value || undefined })}
                placeholder="Nota / resumen del tema (opcional)…"
                className="w-full bg-transparent text-[11px] text-zinc-400 placeholder:text-zinc-700 focus:outline-none border-b border-white/[0.06] pb-1" />

              {/* Sub-checklist de ítems */}
              {(tema.items ?? []).map((it) => (
                <div key={it.id} className="flex items-center gap-2 group">
                  <button onClick={() => toggleTemaItem(tema.id, it.id)}
                    className={`shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all ${it.done ? 'text-emerald-400' : 'text-zinc-600 hover:text-emerald-400'}`}>
                    <div className="w-2.5 h-2.5 rounded-sm" style={it.done ? { background: '#10b981' } : { border: `1.5px solid ${color}88` }} />
                  </button>
                  <span className={`flex-1 text-[12px] ${it.done ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>{it.text}</span>
                  <button onClick={() => deleteTemaItem(tema.id, it.id)} className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"><X className="w-3 h-3" /></button>
                </div>
              ))}

              <div className="flex items-center gap-2 pt-0.5">
                <input value={newItem} onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitItem() }}
                  placeholder="Agregar ítem / sub-tema…"
                  className="flex-1 bg-white/[0.03] border border-dashed border-white/[0.08] rounded px-2.5 py-1.5 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-fuchsia-500/40" />
                <button onClick={submitItem} className="shrink-0 text-fuchsia-300 hover:text-fuchsia-200"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Componentes visuales compartidos (card + header) ──────────────────────────

function EntityCard({ color, icon, title, subtitle, prog, progLabel, footer, onClick, onDelete }: {
  color: string; icon: string; title: string; subtitle: string; prog: StudyProgress; progLabel: string
  footer: React.ReactNode; onClick: () => void; onDelete: () => void
}) {
  return (
    <motion.div whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.99 }} onClick={onClick}
      className="relative group text-left rounded-2xl p-5 transition-all cursor-pointer"
      style={{
        background: `radial-gradient(circle at 0% 0%, ${color}1f, transparent 50%), rgba(255, 255, 255, 0.025)`,
        borderTop: `2px solid ${color}`, borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}>
      <button onClick={(e) => { e.stopPropagation(); onDelete() }} title="Eliminar"
        className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 hover:bg-red-500/10 z-10">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-start gap-3 mb-4">
        <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: `${color}22`, border: `1px solid ${color}40` }}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-white truncate">{title}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">{prog.done}/{prog.total} {progLabel}</span>
          <span className="font-mono font-semibold tabular-nums" style={{ color }}>{prog.pct}%</span>
        </div>
        <ProgressBar pct={prog.pct} color={color} />
      </div>
      {footer && <div className="flex items-center gap-1.5 mt-3 text-[10px] text-zinc-500">{footer}</div>}
    </motion.div>
  )
}

function DetailHeader({ onBack, icon, color, title, subtitle, prog, progLabel, onEdit, onDelete }: {
  onBack: () => void; icon: string; color: string; title: string; subtitle: string
  /** Progreso opcional — el modo conceptos no tiene barra de temas. */
  prog?: StudyProgress; progLabel?: string; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <button onClick={onBack} className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-colors" style={{ background: 'var(--card-bg)', border: '1px solid rgba(255, 255, 255, 0.10)' }} title="Volver">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${color}22`, border: `1px solid ${color}40` }}>{icon}</div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-none truncate">{title}</h1>
            <p className="text-[13px] text-zinc-500 truncate">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium text-zinc-300 hover:text-white transition-colors" style={{ background: 'var(--card-bg)', border: '1px solid rgba(255, 255, 255, 0.10)' }}>
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
          <button onClick={onDelete} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium text-zinc-400 hover:text-red-300 transition-colors" style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.20)' }} title="Eliminar">
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        </div>
      </div>
      {/* Barra de progreso del nivel — solo si hay progreso (modo checklist). */}
      {prog && (
        <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--card-bg)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-zinc-400">Progreso · {prog.done}/{prog.total} {progLabel}</span>
            <span className="font-mono font-bold tabular-nums text-base" style={{ color }}>{prog.pct}%</span>
          </div>
          <ProgressBar pct={prog.pct} color={color} height={6} />
        </div>
      )}
    </div>
  )
}

function EmptyState({ title, hint, onCreate, cta }: { title: string; hint: string; onCreate: () => void; cta: string }) {
  return (
    <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--card-bg)', border: '1px dashed rgba(255, 255, 255, 0.10)' }}>
      <GraduationCap className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
      <p className="text-sm font-semibold text-zinc-200 mb-1">{title}</p>
      <p className="text-xs text-zinc-500 max-w-md mx-auto mb-4">{hint}</p>
      <button onClick={onCreate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 transition-all">
        <Plus className="w-4 h-4" /> {cta}
      </button>
    </div>
  )
}

// ─── Modales ───────────────────────────────────────────────────────────────────

function CreateCarreraModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const addCarrera = useStudyStore((s) => s.addCarrera)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(CARRERA_ICONS[0])
  const [color, setColor] = useState(DEFAULT_CARRERA_COLOR)
  const [institucion, setInstitucion] = useState('')
  const create = () => { if (!name.trim()) return; onCreated(addCarrera({ name, icon, color, institucion: institucion.trim() || undefined })) }
  return (
    <ModalShell title="Nueva carrera" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancelar</GhostBtn><PrimaryBtn onClick={create} disabled={!name.trim()}>Crear carrera</PrimaryBtn></>}>
      <div><label className={labelClass()}>Nombre de la carrera *</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ingeniería Informática" className={fieldClass()} /></div>
      <div><label className={labelClass()}>Icono</label><IconPicker icons={CARRERA_ICONS} value={icon} onChange={setIcon} /></div>
      <div><label className={labelClass()}>Color</label><ColorPicker value={color} onChange={setColor} /></div>
      <div><label className={labelClass()}>Institución</label>
        <input value={institucion} onChange={(e) => setInstitucion(e.target.value)} placeholder="Ej. UBA — FIUBA" className={fieldClass()} /></div>
    </ModalShell>
  )
}

function EditCarreraModal({ carrera, onClose }: { carrera: Carrera; onClose: () => void }) {
  const updateCarrera = useStudyStore((s) => s.updateCarrera)
  const [name, setName] = useState(carrera.name)
  const [icon, setIcon] = useState(carrera.icon ?? CARRERA_ICONS[0])
  const [color, setColor] = useState(carrera.color ?? DEFAULT_CARRERA_COLOR)
  const [institucion, setInstitucion] = useState(carrera.institucion ?? '')
  const save = () => { updateCarrera(carrera.id, { name: name.trim() || carrera.name, icon, color, institucion: institucion.trim() || undefined }); onClose() }
  return (
    <ModalShell title="Editar carrera" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancelar</GhostBtn><PrimaryBtn onClick={save}>Guardar</PrimaryBtn></>}>
      <div><label className={labelClass()}>Nombre</label><input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass()} /></div>
      <div><label className={labelClass()}>Icono</label><IconPicker icons={CARRERA_ICONS} value={icon} onChange={setIcon} /></div>
      <div><label className={labelClass()}>Color</label><ColorPicker value={color} onChange={setColor} /></div>
      <div><label className={labelClass()}>Institución</label><input value={institucion} onChange={(e) => setInstitucion(e.target.value)} className={fieldClass()} /></div>
    </ModalShell>
  )
}

function CreateMateriaModal({ carreraId, onClose, onCreated }: { carreraId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const addMateria = useStudyStore((s) => s.addMateria)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(MATERIA_ICONS[0])
  const [color, setColor] = useState(PALETTE[1])
  const [profesor, setProfesor] = useState('')
  const [codigo, setCodigo] = useState('')
  const [cuatrimestre, setCuatrimestre] = useState('')
  const [mode, setMode] = useState<'checklist' | 'conceptos'>('checklist')
  const create = () => {
    if (!name.trim()) return
    onCreated(addMateria({ carreraId, name, icon, color, mode, profesor: profesor.trim() || undefined, codigo: codigo.trim() || undefined, cuatrimestre: cuatrimestre.trim() || undefined }))
  }
  return (
    <ModalShell title="Nueva materia" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancelar</GhostBtn><PrimaryBtn onClick={create} disabled={!name.trim()}>Crear materia</PrimaryBtn></>}>
      <div><label className={labelClass()}>Nombre de la materia *</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Análisis Matemático II" className={fieldClass()} /></div>
      {/* Modo de la materia */}
      <div>
        <label className={labelClass()}>Tipo de materia</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { v: 'checklist' as const, t: 'Checklist', d: 'Parciales, temas y progreso' },
            { v: 'conceptos' as const, t: 'Mapa de conceptos', d: 'Base visual por autor y área' },
          ]).map((opt) => (
            <button key={opt.v} type="button" onClick={() => setMode(opt.v)}
              className="text-left rounded-xl p-3 transition-all"
              style={{
                background: mode === opt.v ? `${color}18` : 'var(--card-bg)',
                border: `1px solid ${mode === opt.v ? color : 'rgba(255,255,255,0.10)'}`,
              }}>
              <p className="text-[13px] font-semibold" style={{ color: mode === opt.v ? '#fff' : '#d4d4d8' }}>{opt.t}</p>
              <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">{opt.d}</p>
            </button>
          ))}
        </div>
      </div>
      <div><label className={labelClass()}>Icono</label><IconPicker icons={MATERIA_ICONS} value={icon} onChange={setIcon} /></div>
      <div><label className={labelClass()}>Color</label><ColorPicker value={color} onChange={setColor} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelClass()}>Profesor</label><input value={profesor} onChange={(e) => setProfesor(e.target.value)} placeholder="Opcional" className={fieldClass()} /></div>
        <div><label className={labelClass()}>Código</label><input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Opcional" className={fieldClass()} /></div>
        <div className="col-span-2"><label className={labelClass()}>Cuatrimestre</label><input value={cuatrimestre} onChange={(e) => setCuatrimestre(e.target.value)} placeholder="Ej. 1C 2026" className={fieldClass()} /></div>
      </div>
    </ModalShell>
  )
}

function EditMateriaModal({ materia, onClose }: { materia: Materia; onClose: () => void }) {
  const updateMateria = useStudyStore((s) => s.updateMateria)
  const [name, setName] = useState(materia.name)
  const [icon, setIcon] = useState(materia.icon ?? MATERIA_ICONS[0])
  const [color, setColor] = useState(materia.color ?? PALETTE[1])
  const [profesor, setProfesor] = useState(materia.profesor ?? '')
  const [codigo, setCodigo] = useState(materia.codigo ?? '')
  const [cuatrimestre, setCuatrimestre] = useState(materia.cuatrimestre ?? '')
  const save = () => {
    updateMateria(materia.id, { name: name.trim() || materia.name, icon, color, profesor: profesor.trim() || undefined, codigo: codigo.trim() || undefined, cuatrimestre: cuatrimestre.trim() || undefined })
    onClose()
  }
  return (
    <ModalShell title="Editar materia" onClose={onClose}
      footer={<><GhostBtn onClick={onClose}>Cancelar</GhostBtn><PrimaryBtn onClick={save}>Guardar</PrimaryBtn></>}>
      <div><label className={labelClass()}>Nombre</label><input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass()} /></div>
      <div><label className={labelClass()}>Icono</label><IconPicker icons={MATERIA_ICONS} value={icon} onChange={setIcon} /></div>
      <div><label className={labelClass()}>Color</label><ColorPicker value={color} onChange={setColor} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelClass()}>Profesor</label><input value={profesor} onChange={(e) => setProfesor(e.target.value)} className={fieldClass()} /></div>
        <div><label className={labelClass()}>Código</label><input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={fieldClass()} /></div>
        <div className="col-span-2"><label className={labelClass()}>Cuatrimestre</label><input value={cuatrimestre} onChange={(e) => setCuatrimestre(e.target.value)} className={fieldClass()} /></div>
      </div>
    </ModalShell>
  )
}
