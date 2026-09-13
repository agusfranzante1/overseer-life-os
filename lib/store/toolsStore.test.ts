/** Helpers puros de Herramientas. Correr: npx tsx lib/store/toolsStore.test.ts */
import { toolCategories, filterTools, sortTools, toolHost, type Tool } from './toolsStore'

let ok = 0, fail = 0
const t = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log('  ✗ ' + n) } }

const mk = (p: Partial<Tool>): Tool => ({
  id: p.id ?? Math.random().toString(36).slice(2), name: p.name ?? '', url: p.url ?? '',
  category: p.category ?? '', notes: p.notes ?? '', favorite: p.favorite ?? false,
  createdAt: p.createdAt ?? '2026-09-13T10:00:00Z', updatedAt: p.updatedAt ?? '2026-09-13T10:00:00Z',
})

const A = mk({ id: 'a', name: 'VibeCut', url: 'https://youtu.be/4eK3mrb6xgE', category: 'Edición de video', notes: 'edición automática', createdAt: '2026-09-13T10:00:00Z' })
const B = mk({ id: 'b', name: 'HeyGen', url: 'https://www.heygen.com/', category: 'Personajes IA', favorite: true, createdAt: '2026-09-12T10:00:00Z' })
const C = mk({ id: 'c', name: 'ElevenLabs', url: 'https://elevenlabs.io', category: 'Voces', createdAt: '2026-09-11T10:00:00Z' })
const D = mk({ id: 'd', name: 'sin cat', category: '  ', createdAt: '2026-09-14T10:00:00Z' })
const ALL = [A, B, C, D]

// categorías: sin repetir, sin vacías, alfabético
t('categorias unicas y ordenadas', toolCategories([...ALL, mk({ category: 'Voces' })]).join('|') === 'Edición de video|Personajes IA|Voces')
t('categoria en blanco no cuenta', !toolCategories([D]).length)

// filtros
t('filtro por categoria', filterTools(ALL, { category: 'Voces' }).map((x) => x.id).join() === 'c')
t('todas = sin filtro', filterTools(ALL, { category: 'todas' }).length === 4)
t('solo favoritas', filterTools(ALL, { onlyFavorites: true }).map((x) => x.id).join() === 'b')
t('busca en notas', filterTools(ALL, { query: 'automática' }).map((x) => x.id).join() === 'a')
t('busca en url', filterTools(ALL, { query: 'elevenlabs' }).map((x) => x.id).join() === 'c')
t('busca case-insensitive', filterTools(ALL, { query: 'HEYGEN' }).map((x) => x.id).join() === 'b')

// orden: favoritas arriba, después las más nuevas primero
t('favorita primero, luego por fecha desc', sortTools(ALL).map((x) => x.id).join() === 'b,d,a,c')

// host
t('host sin www', toolHost('https://www.heygen.com/x') === 'heygen.com')
t('host youtu.be', toolHost('https://youtu.be/abc?si=1') === 'youtu.be')
t('url rota → vacío', toolHost('no es una url') === '')
t('url vacía → vacío', toolHost('') === '')

console.log(`\n${ok}/${ok + fail} OK`)
if (fail) process.exit(1)
