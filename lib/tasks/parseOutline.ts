export interface OutlineLine {
  title: string
  depth: number
}

export interface ParsedOutlineSubtask {
  title: string
  subtasks: ParsedOutlineSubtask[]
}

export interface ParsedOutlineTask {
  title: string
  subtasks: ParsedOutlineSubtask[]
}

export interface BuiltOutline {
  tasks: ParsedOutlineTask[]
}

const STATUS_SUFFIX_RE = /\s+(?:Hacer|Completada(?:\s+\d+)?|Copied|Anotacion|Anotación)\s*$/iu
const EXPORT_HEADER_RE = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\b/u
const URL_ONLY_RE = /^\s*https?:\/\/\S+\s*$/iu
const NUMBER_KEYCAP_RE = /^(?:\d\ufe0f?\u20e3|\u{1F51F})\s*/u
const NUMBER_PREFIX_RE = /^\d+[\.)]\s+/u
const CHECKBOX_RE = /^\s*(?:\[[ xX]\]|☐|☑|✅)\s*/u
const BULLET_RE = /^\s*(?:[-*•▪◦‣]+)\s*/u
// Consume el CLUSTER de emoji completo: base pictogr\u00e1fica + modificadores de
// tono de piel (U+1F3FB\u20131F3FF), VS16 y secuencias ZWJ. Sin el cluster, "\ud83e\udd33\ud83c\udffc"
// dejaba el modificador de tono colgado en el t\u00edtulo ("\ud83c\udffc Modelado").
const EMOJI_PREFIX_RE = /^(?:\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}]|\ufe0f|\u200d\p{Extended_Pictographic})*|\d\ufe0f?\u20e3|\u{1F51F})\s*/u

function countIndent(raw: string): number {
  let count = 0
  for (const ch of raw) {
    if (ch === '\t') count += 4
    else if (ch === ' ') count += 1
    else break
  }
  return count
}

function stripConsumedPrefix(text: string, fallbackMode: boolean): string {
  let next = text.trim()
  next = next.replace(CHECKBOX_RE, '')
  next = next.replace(BULLET_RE, '')
  if (fallbackMode) {
    next = next.replace(NUMBER_KEYCAP_RE, '')
    next = next.replace(NUMBER_PREFIX_RE, '')
    next = next.replace(EMOJI_PREFIX_RE, '')
  } else {
    next = next.replace(NUMBER_PREFIX_RE, '')
  }
  next = next.replace(CHECKBOX_RE, '').replace(BULLET_RE, '')
  next = next.replace(STATUS_SUFFIX_RE, '')
  return next.trim()
}

function startsWithNonNumberEmoji(text: string): boolean {
  const trimmed = text.trim()
  return EMOJI_PREFIX_RE.test(trimmed) && !NUMBER_KEYCAP_RE.test(trimmed)
}

function detectSpaceUnit(indents: number[]): number {
  const positives = indents.filter((n) => n > 0).sort((a, b) => a - b)
  return positives[0] || 1
}

export function parseOutline(text: string): OutlineLine[] {
  const rawLines = text.split(/\r?\n/)
    .filter((line) => line.trim())
    .filter((line) => !EXPORT_HEADER_RE.test(line))
    .filter((line) => !URL_ONLY_RE.test(line))

  const indentCounts = rawLines.map(countIndent)
  const hasIndent = indentCounts.some((n) => n > 0)
  const unit = hasIndent ? detectSpaceUnit(indentCounts) : 1

  const parsed: OutlineLine[] = []
  for (const raw of rawLines) {
    const trimmed = raw.trim()
    const depth = hasIndent
      ? Math.floor(countIndent(raw) / unit)
      : NUMBER_KEYCAP_RE.test(trimmed) || NUMBER_PREFIX_RE.test(trimmed)
        ? 1
        : startsWithNonNumberEmoji(trimmed)
          ? 0
          : 2
    const title = stripConsumedPrefix(trimmed, !hasIndent)
    if (title) parsed.push({ title, depth })
  }

  if (parsed.length === 0) return []
  const minDepth = Math.min(...parsed.map((line) => line.depth))
  return parsed.map((line) => ({ ...line, depth: Math.max(0, line.depth - minDepth) }))
}

export function buildOutline(lines: OutlineLine[]): BuiltOutline {
  const tasks: ParsedOutlineTask[] = []
  const stack: { depth: number; node: ParsedOutlineTask | ParsedOutlineSubtask }[] = []

  for (const line of lines) {
    while (stack.length > 0 && stack[stack.length - 1].depth >= line.depth) stack.pop()

    if (line.depth === 0 || stack.length === 0) {
      const task: ParsedOutlineTask = { title: line.title, subtasks: [] }
      tasks.push(task)
      stack.length = 0
      stack.push({ depth: 0, node: task })
      continue
    }

    const subtask: ParsedOutlineSubtask = { title: line.title, subtasks: [] }
    const parent = stack[stack.length - 1]?.node
    if (!parent) {
      tasks.push({ title: line.title, subtasks: [] })
      stack.length = 0
      stack.push({ depth: 0, node: tasks[tasks.length - 1] })
      continue
    }
    parent.subtasks.push(subtask)
    stack.push({ depth: line.depth, node: subtask })
  }

  return { tasks }
}

export function parseOutlineToTasks(text: string): BuiltOutline {
  return buildOutline(parseOutline(text))
}
