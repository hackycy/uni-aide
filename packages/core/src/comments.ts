import type * as t from '@babel/types'
import type { AnalysisResult, Anchor, ContainerInfo } from './analyze'
import type {
  CommentEntry,
  CommentIndex,
  ContainerComments,
  Diagnostic,
  DirectiveInfo,
  DirectiveKind,
  Path,
  Placement,
  Slot,
  SlotComments,
} from './types'

export interface CollectResult {
  placements: Placement[]
  diagnostics: Diagnostic[]
}

interface Target {
  path: Path
  slot: Slot
}

const MISSING: unique symbol = Symbol('missing')

interface ParsedDirective {
  /** 仅在指令合法时存在；缺失表示按普通注释处理 */
  info?: DirectiveInfo
  diagnostics: Diagnostic[]
}

function directiveDiagnostic(
  severity: 'error' | 'warning',
  code: string,
  message: string,
  entry: CommentEntry,
): Diagnostic {
  return {
    severity,
    code,
    message,
    file: entry.source.file,
    line: entry.source.line,
    column: entry.source.column,
  }
}

/**
 * 识别并归一化条件编译指令（ticket 06）。
 * 返回 `null` 表示按普通注释处理。
 */
function parseDirective(entry: CommentEntry): ParsedDirective | null {
  const trimmed = entry.text.replace(/^\s+/, '')
  if (!trimmed.startsWith('#')) {
    return null
  }

  const match = /^#(ifdef|ifndef|if|else|endif)(?=\s|$)/i.exec(trimmed)
  if (!match) {
    if (/^#(?:elif|elseif)\b/i.test(trimmed)) {
      return {
        diagnostics: [
          directiveDiagnostic(
            'warning',
            'directive-invalid',
            'unsupported directive form; treated as an ordinary comment',
            entry,
          ),
        ],
      }
    }
    return null
  }

  const kind = match[1].toLowerCase() as DirectiveKind
  const rest = trimmed.slice(match[0].length)

  if (
    /#(?:ifdef|ifndef|if|else|endif)\b/i.test(rest)
    || /#(?:elif|elseif)\b/i.test(rest)
  ) {
    return {
      diagnostics: [
        directiveDiagnostic(
          'warning',
          'directive-invalid',
          'multiple or unsupported directives in one comment; treated as an ordinary comment',
          entry,
        ),
      ],
    }
  }

  const body = rest.trim()
  const diagnostics: Diagnostic[] = []

  if (kind === 'else' || kind === 'endif') {
    if (body.length > 0) {
      diagnostics.push(
        directiveDiagnostic(
          'warning',
          'endif-trailing-text',
          `trailing text after #${kind} is discarded`,
          entry,
        ),
      )
    }
    return { info: { kind }, diagnostics }
  }

  if (body.length === 0) {
    diagnostics.push(
      directiveDiagnostic(
        'error',
        'empty-condition',
        `#${kind} requires a non-empty condition`,
        entry,
      ),
    )
    return { info: { kind, condition: '' }, diagnostics }
  }

  if (/\r?\n/.test(body)) {
    diagnostics.push(
      directiveDiagnostic(
        'warning',
        'directive-invalid',
        'multi-line directive condition; treated as an ordinary comment',
        entry,
      ),
    )
    return { diagnostics }
  }

  return { info: { kind, condition: body }, diagnostics }
}

/**
 * 从源码区间中剔除完整或部分重叠的注释，用于判断“两个节点之间是否只有空白/逗号”。
 */
function gapText(
  source: string,
  from: number,
  to: number,
  comments: t.Comment[],
): string {
  if (to <= from) {
    return ''
  }
  let text = ''
  let cursor = from
  for (const comment of comments) {
    const start = comment.start
    const end = comment.end
    if (typeof start !== 'number' || typeof end !== 'number') {
      continue
    }
    if (end <= from || start >= to) {
      continue
    }
    const overlapStart = Math.max(start, from)
    const overlapEnd = Math.min(end, to)
    if (overlapStart > cursor) {
      text += source.slice(cursor, overlapStart)
    }
    cursor = Math.max(cursor, overlapEnd)
  }
  if (cursor < to) {
    text += source.slice(cursor, to)
  }
  return text
}

function classifyInContainer(
  entry: CommentEntry,
  container: ContainerInfo,
  source: string,
  comments: t.Comment[],
): Target | null {
  if (container.empty) {
    return { path: container.path, slot: 'inner' }
  }

  for (const anchor of container.anchors) {
    if (
      anchor.kind !== 'property'
      || anchor.keyEnd === undefined
      || anchor.valueStart === undefined
    ) {
      continue
    }
    if (anchor.keyEnd <= entry.start && entry.end <= anchor.valueStart) {
      if (anchor.colonStart !== undefined && entry.end <= anchor.colonStart) {
        return { path: anchor.path, slot: 'after-prop' }
      }
      return { path: anchor.path, slot: 'after-colon' }
    }
  }

  let candidate: Anchor | undefined
  for (const anchor of container.anchors) {
    if (anchor.end > entry.start) {
      continue
    }
    if (!/^\s*$/.test(gapText(source, anchor.end, entry.start, comments))) {
      continue
    }
    if (!/^[ \t]*,/.test(source.slice(entry.end))) {
      continue
    }
    if (!candidate || anchor.end > candidate.end) {
      candidate = anchor
    }
  }
  if (candidate) {
    return { path: candidate.path, slot: 'after-value' }
  }

  candidate = undefined
  for (const anchor of container.anchors) {
    if (anchor.end > entry.start) {
      continue
    }
    if (anchor.line !== entry.source.line) {
      continue
    }
    if (!/^\s*(?:,\s*)?$/.test(gapText(source, anchor.end, entry.start, comments))) {
      continue
    }
    if (!candidate || anchor.end > candidate.end) {
      candidate = anchor
    }
  }
  if (candidate) {
    return { path: candidate.path, slot: 'after' }
  }

  candidate = undefined
  for (const anchor of container.anchors) {
    if (anchor.start < entry.end) {
      continue
    }
    if (!/^[\s,]*$/.test(gapText(source, entry.end, anchor.start, comments))) {
      continue
    }
    if (!candidate || anchor.start < candidate.start) {
      candidate = anchor
    }
  }
  if (candidate) {
    return { path: candidate.path, slot: 'before' }
  }

  return { path: container.path, slot: 'after-last' }
}

function isOpaque(entry: CommentEntry, analysis: AnalysisResult): boolean {
  return analysis.opaqueRanges.some(
    range => range.start <= entry.start && entry.end <= range.end,
  )
}

function classify(
  entry: CommentEntry,
  analysis: AnalysisResult,
  source: string,
  comments: t.Comment[],
): Target[] {
  if (isOpaque(entry, analysis)) {
    return []
  }

  const containers = analysis.containers.filter(
    container => container.start <= entry.start && entry.end <= container.end,
  )

  if (containers.length > 0) {
    const minSpan = Math.min(...containers.map(c => c.end - c.start))
    const innermost = containers.filter(c => c.end - c.start === minSpan)
    const targets: Target[] = []
    const seen = new Set<string>()

    for (const container of innermost) {
      const target = classifyInContainer(entry, container, source, comments)
      if (!target) {
        continue
      }
      const key = `${target.slot}:${JSON.stringify(target.path)}`
      if (!seen.has(key)) {
        seen.add(key)
        targets.push(target)
      }
    }
    return targets
  }

  const root = analysis.rootNode
  if (root && typeof root.start === 'number' && typeof root.end === 'number') {
    if (entry.end <= root.start && entry.start >= analysis.statementStart) {
      return [{ path: [], slot: 'before-all' }]
    }
    if (entry.start >= root.end && entry.end <= analysis.statementEnd) {
      return [{ path: [], slot: 'after-all' }]
    }
  }

  return []
}

function createCommentEntry(
  comment: t.Comment,
  source: string,
  file: string,
): CommentEntry | null {
  if (
    typeof comment.start !== 'number'
    || typeof comment.end !== 'number'
    || !comment.loc
  ) {
    return null
  }

  const lineStart = source.lastIndexOf('\n', comment.start - 1) + 1
  const inline = /\S/.test(source.slice(lineStart, comment.start))

  const entry: CommentEntry = {
    text: comment.value,
    kind: comment.type === 'CommentBlock' ? 'block' : 'line',
    inline,
    conditional: false,
    source: {
      file,
      line: comment.loc.start.line,
      column: comment.loc.start.column,
    },
    start: comment.start,
    end: comment.end,
  }

  return entry
}

export function collectComments(
  rawComments: t.Comment[],
  source: string,
  file: string,
  analysis: AnalysisResult,
): CollectResult {
  const comments = [...rawComments].sort(
    (a, b) => (a.start ?? 0) - (b.start ?? 0),
  )
  const placements: Placement[] = []
  const diagnostics: Diagnostic[] = []

  comments.forEach((comment, sourceIndex) => {
    const entry = createCommentEntry(comment, source, file)
    if (!entry) {
      return
    }

    const directive = parseDirective(entry)
    if (directive) {
      diagnostics.push(...directive.diagnostics)
      if (directive.info) {
        entry.conditional = true
        entry.directive = directive.info
      }
    }

    const targets = classify(entry, analysis, source, comments)
    if (targets.length === 0) {
      if (entry.conditional) {
        diagnostics.push(
          directiveDiagnostic(
            'warning',
            'directive-unresolved',
            'conditional directive cannot be mapped to the emitted value; it is dropped',
            entry,
          ),
        )
      }
      return
    }

    for (const target of targets) {
      placements.push({
        path: target.path,
        slot: target.slot,
        comment: entry,
        sourceIndex,
      })
    }
  })

  return { placements, diagnostics }
}

function resolvePath(root: unknown, path: Path): unknown | typeof MISSING {
  let current: unknown = root
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || !Number.isInteger(segment)) {
        return MISSING
      }
      if (segment < 0 || segment >= current.length) {
        return MISSING
      }
      current = current[segment]
      continue
    }
    if (
      current === null
      || typeof current !== 'object'
      || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return MISSING
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function isObjectValue(value: unknown): value is object {
  return value !== null && typeof value === 'object'
}

function pushUnique(
  list: CommentEntry[] | undefined,
  entry: CommentEntry,
): CommentEntry[] {
  if (!list) {
    return [entry]
  }
  if (!list.includes(entry)) {
    list.push(entry)
  }
  return list
}

type ResolvedPlacement
  = | { kind: 'root' }
    | { kind: 'container', value: object }
    | { kind: 'property', parent: Record<string, unknown>, key: string }
    | { kind: 'item-object', item: object }
    | { kind: 'item-index', array: any[], index: number }

function resolvePlacement(
  placement: Placement,
  rootValue: unknown,
): ResolvedPlacement | null {
  if (placement.slot === 'before-all' || placement.slot === 'after-all') {
    return isObjectValue(rootValue) ? { kind: 'root' } : null
  }

  if (placement.slot === 'inner' || placement.slot === 'after-last') {
    const value = resolvePath(rootValue, placement.path)
    return value !== MISSING && isObjectValue(value)
      ? { kind: 'container', value }
      : null
  }

  if (placement.path.length === 0) {
    return null
  }

  const parentPath = placement.path.slice(0, -1)
  const last = placement.path[placement.path.length - 1]
  const parent = resolvePath(rootValue, parentPath)

  if (parent === MISSING) {
    return null
  }

  if (Array.isArray(parent) && typeof last === 'number') {
    if (!Number.isInteger(last) || last < 0 || last >= parent.length) {
      return null
    }
    const item = parent[last]
    if (isObjectValue(item)) {
      return { kind: 'item-object', item }
    }
    return { kind: 'item-index', array: parent, index: last }
  }

  if (
    typeof last === 'string'
    && parent !== null
    && typeof parent === 'object'
    && !Array.isArray(parent)
    && Object.prototype.hasOwnProperty.call(parent, last)
  ) {
    return {
      kind: 'property',
      parent: parent as Record<string, unknown>,
      key: last,
    }
  }

  return null
}

function slotKey(slot: Slot): keyof SlotComments | undefined {
  switch (slot) {
    case 'before':
      return 'before'
    case 'after-prop':
      return 'afterProp'
    case 'after-colon':
      return 'afterColon'
    case 'after-value':
      return 'afterValue'
    case 'after':
      return 'after'
    default:
      return undefined
  }
}

function getSlotComments(
  map: WeakMap<object, Map<string, SlotComments>>,
  parent: object,
  key: string,
): SlotComments {
  let properties = map.get(parent)
  if (!properties) {
    properties = new Map()
    map.set(parent, properties)
  }
  let slots = properties.get(key)
  if (!slots) {
    slots = {}
    properties.set(key, slots)
  }
  return slots
}

function getSlotCommentsByIndex(
  map: WeakMap<any[], Map<number, SlotComments>>,
  array: any[],
  index: number,
): SlotComments {
  let items = map.get(array)
  if (!items) {
    items = new Map()
    map.set(array, items)
  }
  let slots = items.get(index)
  if (!slots) {
    slots = {}
    items.set(index, slots)
  }
  return slots
}

function getContainerComments(
  index: CommentIndex,
  container: object,
): ContainerComments {
  let comments = index.container.get(container)
  if (!comments) {
    comments = {}
    index.container.set(container, comments)
  }
  return comments
}

export function createCommentIndex(): CommentIndex {
  return {
    container: new WeakMap(),
    property: new WeakMap(),
    arrayItem: new WeakMap(),
    arrayIndex: new WeakMap(),
  }
}

export interface BuildIndexResult {
  index: CommentIndex
  placements: Placement[]
  diagnostics: Diagnostic[]
}

/**
 * 校验 Placement.path 是否仍落在可发射路径上，并构建引用索引。
 * 落在不可发射路径上的条件编译注释升级为 `directive-unresolved` 告警。
 */
export function buildCommentIndex(
  placements: Placement[],
  rootValue: unknown,
  file: string,
): BuildIndexResult {
  const index = createCommentIndex()
  const valid: Placement[] = []
  const diagnostics: Diagnostic[] = []

  for (const placement of placements) {
    const resolved = resolvePlacement(placement, rootValue)
    if (!resolved) {
      if (placement.comment.conditional) {
        diagnostics.push({
          severity: 'warning',
          code: 'directive-unresolved',
          message: `conditional directive at ${placement.path.length ? 'path' : 'root'} does not survive value normalization; it is dropped`,
          file,
          path: placement.path,
          line: placement.comment.source.line,
          column: placement.comment.source.column,
        })
      }
      continue
    }

    valid.push(placement)
    const entry = placement.comment

    if (resolved.kind === 'root') {
      const container = getContainerComments(index, rootValue as object)
      if (placement.slot === 'before-all') {
        container.beforeAll = pushUnique(container.beforeAll, entry)
      }
      else {
        container.afterAll = pushUnique(container.afterAll, entry)
      }
      continue
    }

    if (resolved.kind === 'container') {
      const container = getContainerComments(index, resolved.value)
      if (placement.slot === 'inner') {
        container.inner = pushUnique(container.inner, entry)
      }
      else {
        container.afterLast = pushUnique(container.afterLast, entry)
      }
      continue
    }

    const key = slotKey(placement.slot)
    if (!key) {
      continue
    }

    if (resolved.kind === 'property') {
      const slots = getSlotComments(index.property, resolved.parent, resolved.key)
      slots[key] = pushUnique(slots[key], entry)
      continue
    }

    if (resolved.kind === 'item-object') {
      const slots = index.arrayItem.get(resolved.item) ?? {}
      slots[key] = pushUnique(slots[key], entry)
      index.arrayItem.set(resolved.item, slots)
      continue
    }

    const slots = getSlotCommentsByIndex(index.arrayIndex, resolved.array, resolved.index)
    slots[key] = pushUnique(slots[key], entry)
  }

  return { index, placements: valid, diagnostics }
}
