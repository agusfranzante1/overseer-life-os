'use client'
import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import { ChevronRight, ChevronDown, FileText, Plus, Trash2, ListTree, CornerDownRight, List } from 'lucide-react'
import {
  type Block, type BlockType, emptyBlock, convertSelection, findBlock, setText, insertAfter,
  appendChild, removeBlock, toggleCollapsed, blockLabel, countChildren, isLeaf,
} from '@/lib/offers/blocks'

/**
 * Editor de bloques tipo Notion.
 *
 * Cada párrafo es un <textarea> transparente que crece solo. Se usa textarea y
 * no contentEditable a propósito: da los offsets exactos de la selección
 * (selectionStart/End), que es justo lo que necesita `convertSelection` para
 * partir el párrafo. Con contentEditable habría que mapear rangos del DOM a
 * offsets de texto, que es donde estos editores se vuelven frágiles.
 *
 * Al seleccionar texto aparece una barrita flotante para convertirlo en
 * desplegable o en página.
 */
export function OfferDoc({ doc, onChange }: { doc: Block[]; onChange: (next: Block[]) => void }) {
  // Ruta de páginas abiertas (breadcrumb). Vacía = raíz del documento.
  const [path, setPath] = useState<string[]>([])
  const [sel, setSel] = useState<{ blockId: string; start: number; end: number; x: number; y: number } | null>(null)
  const focusRef = useRef<string | null>(null)

  // Bloques que se están mostrando: la raíz, o los hijos de la página abierta.
  const openId = path[path.length - 1] ?? null
  const openBlock = openId ? findBlock(doc, openId) : null
  const visible = openBlock ? (openBlock.children ?? []) : doc

  const apply = useCallback((next: Block[]) => { setSel(null); onChange(next) }, [onChange])

  const convert = (type: Exclude<BlockType, 'text'>) => {
    if (!sel) return
    const r = convertSelection(doc, sel.blockId, sel.start, sel.end, type)
    apply(r.blocks)
  }

  const crumbs = path.map((id) => ({ id, label: blockLabel(findBlock(doc, id) ?? emptyBlock()) }))

  return (
    <div className="relative">
      {/* Breadcrumb — solo cuando entraste a una página */}
      {crumbs.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-3 text-xs">
          <button onClick={() => setPath([])} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            Documento
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-zinc-700" />
              <button
                onClick={() => setPath(path.slice(0, i + 1))}
                className={i === crumbs.length - 1 ? 'text-zinc-200 font-semibold' : 'text-zinc-500 hover:text-zinc-200 transition-colors'}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>
      )}

      <BlockList
        blocks={visible}
        doc={doc}
        depth={0}
        focusRef={focusRef}
        onChange={onChange}
        onSelect={setSel}
        onOpenPage={(id) => { setSel(null); setPath([...path, id]) }}
        containerId={openId}
      />

      {/* Barra flotante de conversión */}
      {sel && (
        <div
          style={{ position: 'fixed', left: sel.x, top: sel.y }}
          className="z-[80] -translate-x-1/2 -translate-y-full mb-2 flex items-center gap-0.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-1"
        >
          <button
            onMouseDown={(e) => { e.preventDefault(); convert('bullet') }}
            className="text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <List className="w-3.5 h-3.5 text-emerald-400" /> Viñeta
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); convert('toggle') }}
            className="text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <ListTree className="w-3.5 h-3.5 text-indigo-400" /> Desplegable
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); convert('page') }}
            className="text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" /> Página
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function BlockList({ blocks, doc, depth, focusRef, onChange, onSelect, onOpenPage, containerId }: {
  blocks: Block[]
  doc: Block[]
  depth: number
  focusRef: React.RefObject<string | null>
  onChange: (next: Block[]) => void
  onSelect: (s: { blockId: string; start: number; end: number; x: number; y: number } | null) => void
  onOpenPage: (id: string) => void
  containerId: string | null
}) {
  const addAtEnd = () => {
    const nb = emptyBlock('text')
    focusRef.current = nb.id
    if (blocks.length > 0) onChange(insertAfter(doc, blocks[blocks.length - 1].id, nb))
    else if (containerId) onChange(appendChild(doc, containerId, nb))
    else onChange([...doc, nb])
  }

  return (
    <div className={depth > 0 ? 'pl-4 border-l border-zinc-800/80 ml-1.5' : ''}>
      {blocks.map((b) => (
        <BlockRow
          key={b.id}
          block={b}
          doc={doc}
          depth={depth}
          focusRef={focusRef}
          onChange={onChange}
          onSelect={onSelect}
          onOpenPage={onOpenPage}
        />
      ))}
      <button
        onClick={addAtEnd}
        className="group/add w-full text-left text-xs text-zinc-700 hover:text-zinc-400 py-1.5 px-1 rounded transition-colors flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5 opacity-0 group-hover/add:opacity-100 transition-opacity" />
        <span className="opacity-0 group-hover/add:opacity-100 transition-opacity">Escribí algo…</span>
      </button>
    </div>
  )
}

function BlockRow({ block, doc, depth, focusRef, onChange, onSelect, onOpenPage }: {
  block: Block
  doc: Block[]
  depth: number
  focusRef: React.RefObject<string | null>
  onChange: (next: Block[]) => void
  onSelect: (s: { blockId: string; start: number; end: number; x: number; y: number } | null) => void
  onOpenPage: (id: string) => void
}) {
  const ta = useRef<HTMLTextAreaElement>(null)

  // Auto-grow + foco del bloque recién creado. useLayoutEffect para que no se
  // vea el textarea de una línea antes de estirarse.
  useLayoutEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
    if (focusRef.current === block.id) {
      el.focus()
      focusRef.current = null
    }
  }, [block.text, block.id, focusRef])

  const reportSelection = () => {
    const el = ta.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    if (s === e || el.value.slice(s, e).trim() === '') { onSelect(null); return }
    const r = el.getBoundingClientRect()
    // La barra va arriba del bloque, centrada horizontalmente sobre él. Sin
    // medir glifos: es predecible y no se desalinea con texto proporcional.
    onSelect({ blockId: block.id, start: s, end: e, x: r.left + r.width / 2, y: r.top - 6 })
  }

  const onKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = ev.currentTarget
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault()
      // Enter en una viñeta crea otra viñeta; en un párrafo, otro párrafo.
      const nb = emptyBlock(block.type === 'bullet' ? 'bullet' : 'text')
      focusRef.current = nb.id
      onChange(insertAfter(doc, block.id, nb))
      return
    }
    // Backspace en un bloque vacío lo borra (comportamiento estándar).
    if (ev.key === 'Backspace' && el.value === '' && el.selectionStart === 0) {
      ev.preventDefault()
      onChange(removeBlock(doc, block.id))
    }
  }

  // ── Párrafo y viñeta ──
  // Comparten todo salvo el puntito: son el mismo textarea, así Enter,
  // Backspace y la selección se comportan igual en los dos.
  if (isLeaf(block.type)) {
    const bullet = block.type === 'bullet'
    return (
      <div className={`group/row relative flex items-start gap-1 ${bullet ? 'pl-3' : ''}`}>
        {bullet && (
          <span className="text-zinc-500 text-sm leading-relaxed pt-1 select-none shrink-0">•</span>
        )}
        <textarea
          ref={ta}
          value={block.text}
          rows={1}
          placeholder="Escribí algo…"
          onChange={(e) => onChange(setText(doc, block.id, e.target.value))}
          onSelect={reportSelection}
          onMouseUp={reportSelection}
          onKeyUp={reportSelection}
          onBlur={() => window.setTimeout(() => onSelect(null), 150)}
          onKeyDown={onKeyDown}
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-700 resize-none outline-none py-1 px-1 rounded hover:bg-white/[0.02] focus:bg-white/[0.03] transition-colors leading-relaxed"
        />
        <RowDelete onDelete={() => onChange(removeBlock(doc, block.id))} />
      </div>
    )
  }

  // ── Desplegable ──
  if (block.type === 'toggle') {
    return (
      <div className="group/row my-1">
        <div className="flex items-center gap-1 rounded-lg bg-indigo-500/[0.07] border border-indigo-500/25 px-2 py-1.5">
          <button
            onClick={() => onChange(toggleCollapsed(doc, block.id))}
            className="text-indigo-300/80 hover:text-indigo-200 shrink-0 transition-colors"
            title={block.collapsed ? 'Abrir' : 'Cerrar'}
          >
            {block.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <input
            value={block.text}
            onChange={(e) => onChange(setText(doc, block.id, e.target.value))}
            placeholder="Título del desplegable"
            className="flex-1 bg-transparent text-sm font-semibold text-zinc-100 placeholder-zinc-600 outline-none min-w-0"
          />
          <span className="text-[10px] text-indigo-300/50 tabular-nums shrink-0">
            {countChildren(block) || ''}
          </span>
          <RowDelete onDelete={() => onChange(removeBlock(doc, block.id))} />
        </div>
        {!block.collapsed && (
          <div className="mt-1">
            <BlockList
              blocks={block.children ?? []}
              doc={doc}
              depth={depth + 1}
              focusRef={focusRef}
              onChange={onChange}
              onSelect={onSelect}
              onOpenPage={onOpenPage}
              containerId={block.id}
            />
          </div>
        )}
      </div>
    )
  }

  // ── Página ──
  return (
    <div className="group/row my-1 flex items-center gap-1">
      <button
        onClick={() => onOpenPage(block.id)}
        className="flex-1 flex items-center gap-2 rounded-lg bg-amber-500/[0.07] border border-amber-500/25 hover:bg-amber-500/[0.12] hover:border-amber-500/40 px-2.5 py-2 transition-colors text-left"
      >
        <FileText className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="flex-1 text-sm font-semibold text-zinc-100 truncate">{blockLabel(block)}</span>
        <span className="text-[10px] text-amber-300/60 tabular-nums shrink-0">
          {countChildren(block) > 0 ? `${countChildren(block)} bloques` : 'vacía'}
        </span>
        <CornerDownRight className="w-3.5 h-3.5 text-amber-400/60 shrink-0" />
      </button>
      <RowDelete onDelete={() => onChange(removeBlock(doc, block.id))} />
    </div>
  )
}

function RowDelete({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      onClick={onDelete}
      title="Borrar bloque"
      className="shrink-0 opacity-0 group-hover/row:opacity-100 text-zinc-700 hover:text-red-400 p-1 rounded transition-all"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )
}
