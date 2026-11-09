import type {
  CommentEntry,
  CommentIndex,
  EmitOptions,
  SlotComments,
} from './types'

const INDENT = '  '

function indent(depth: number): string {
  return INDENT.repeat(depth)
}

function isObjectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key)
}

function directiveLine(entry: CommentEntry): string {
  const directive = entry.directive!
  return directive.condition
    ? `// #${directive.kind} ${directive.condition}`
    : `// #${directive.kind}`
}

function inlineComment(entry: CommentEntry): string {
  if (entry.kind === 'block') {
    return `/*${entry.text}*/`
  }
  return `//${entry.text}`
}

function needsOwnLine(entry: CommentEntry): boolean {
  return entry.conditional || (entry.kind === 'block' && entry.text.includes('*/'))
}

function blockDegradeLines(entry: CommentEntry, prefix: string, options: EmitOptions): string[] {
  options.diagnostics?.push({
    severity: 'warning',
    code: 'block-comment-degraded',
    message: 'block comment text contains "*/"; emitted as line comments',
    file: entry.source.file,
    line: entry.source.line,
    column: entry.source.column,
  })
  return entry.text.split(/\r?\n/).map(line => `${prefix}//${line}`)
}

function renderCommentLine(
  entry: CommentEntry,
  prefix: string,
  options: EmitOptions,
): string[] {
  if (entry.conditional) {
    return [`${prefix}${directiveLine(entry)}`]
  }
  if (entry.kind === 'block') {
    if (entry.text.includes('*/')) {
      return blockDegradeLines(entry, prefix, options)
    }
    return [`${prefix}/*${entry.text}*/`]
  }
  return [`${prefix}//${entry.text}`]
}

function renderLines(
  entries: CommentEntry[] | undefined,
  prefix: string,
  options: EmitOptions,
): string[] {
  if (!entries || entries.length === 0) {
    return []
  }
  return entries.flatMap(entry => renderCommentLine(entry, prefix, options))
}

interface InlineResult {
  text: string
  extras: string[]
}

function renderInline(
  entries: CommentEntry[] | undefined,
  prefix: string,
  options: EmitOptions,
): InlineResult {
  if (!entries || entries.length === 0) {
    return { text: '', extras: [] }
  }

  const parts: string[] = []
  const extras: string[] = []
  for (const entry of entries) {
    if (needsOwnLine(entry)) {
      extras.push(...renderCommentLine(entry, prefix, options))
    }
    else {
      parts.push(inlineComment(entry))
    }
  }
  return { text: parts.join(' '), extras }
}

function orderedKeys(
  object: Record<string, unknown>,
  orderHints: WeakMap<object, string[]>,
  injectedKeys: Set<string> | undefined,
): { keys: string[], injected: string[] } {
  const hints = orderHints.get(object) ?? []
  const keys: string[] = []
  const seen = new Set<string>()

  for (const key of hints) {
    if (seen.has(key) || !hasOwn(object, key) || injectedKeys?.has(key)) {
      continue
    }
    seen.add(key)
    keys.push(key)
  }
  for (const key of Object.keys(object)) {
    if (seen.has(key) || injectedKeys?.has(key)) {
      continue
    }
    seen.add(key)
    keys.push(key)
  }

  const injected = Object.keys(object).filter(key => injectedKeys?.has(key))
  return { keys, injected }
}

interface ArrayItem {
  value: unknown
  index: number
}

function partitionArray(
  array: unknown[],
  injectedElements: WeakSet<object> | undefined,
): { normal: ArrayItem[], injected: ArrayItem[] } {
  const normal: ArrayItem[] = []
  const injected: ArrayItem[] = []

  array.forEach((value, index) => {
    if (
      injectedElements
      && value !== null
      && typeof value === 'object'
      && injectedElements.has(value)
    ) {
      injected.push({ value, index })
    }
    else {
      normal.push({ value, index })
    }
  })

  return { normal, injected }
}

function itemSlots(
  comments: CommentIndex,
  array: unknown[],
  item: ArrayItem,
): SlotComments | undefined {
  if (item.value !== null && typeof item.value === 'object') {
    return comments.arrayItem.get(item.value)
  }
  return comments.arrayIndex.get(array)?.get(item.index)
}

function emitPrimitive(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return JSON.stringify(value)
  }
  return 'null'
}

function emitValue(
  value: unknown,
  depth: number,
  comments: CommentIndex,
  orderHints: WeakMap<object, string[]>,
  options: EmitOptions,
): string {
  if (Array.isArray(value)) {
    return emitArray(value, depth, comments, orderHints, options)
  }
  if (isObjectValue(value)) {
    return emitObject(value, depth, comments, orderHints, options)
  }
  return emitPrimitive(value)
}

function emitEmptyContainer(
  depth: number,
  inner: CommentEntry[] | undefined,
  afterLast: CommentEntry[] | undefined,
  options: EmitOptions,
  brackets: [string, string],
): string {
  const prefix = indent(depth + 1)
  const lines = [
    ...renderLines(inner, prefix, options),
    ...renderLines(afterLast, prefix, options),
  ]
  if (lines.length === 0) {
    return `${brackets[0]}${brackets[1]}`
  }
  return [brackets[0], ...lines, `${indent(depth)}${brackets[1]}`].join('\n')
}

function emitObject(
  object: Record<string, unknown>,
  depth: number,
  comments: CommentIndex,
  orderHints: WeakMap<object, string[]>,
  options: EmitOptions,
): string {
  const container = comments.container.get(object)
  const injectedKeys = options.injectedKeys?.get(object)
  const { keys, injected } = orderedKeys(object, orderHints, injectedKeys)
  const allKeys = [...keys, ...injected]

  if (allKeys.length === 0) {
    return emitEmptyContainer(
      depth,
      container?.inner,
      container?.afterLast,
      options,
      ['{', '}'],
    )
  }

  const childPrefix = indent(depth + 1)
  const lines: string[] = ['{']
  // after-last 是注释而非容器成员，不能据此补逗号；末尾指令行被预处理剥离后会留下尾逗号。

  allKeys.forEach((key, position) => {
    const slots = comments.property.get(object)?.get(key)
    const isLast = position === allKeys.length - 1

    lines.push(...renderLines(slots?.before, childPrefix, options))

    let line = `${childPrefix}${JSON.stringify(key)}`
    const afterProp = renderInline(slots?.afterProp, childPrefix, options)
    if (afterProp.text) {
      line += ` ${afterProp.text}`
    }
    line += ': '

    const afterColon = renderInline(slots?.afterColon, childPrefix, options)
    if (afterColon.text) {
      line += `${afterColon.text} `
    }

    line += emitValue(object[key], depth + 1, comments, orderHints, options)

    const afterValue = renderInline(slots?.afterValue, childPrefix, options)
    if (afterValue.text) {
      line += ` ${afterValue.text}`
    }

    if (!isLast) {
      line += ','
    }

    const after = renderInline(slots?.after, childPrefix, options)
    if (after.text) {
      line += ` ${after.text}`
    }

    lines.push(line, ...afterProp.extras, ...afterColon.extras, ...afterValue.extras, ...after.extras)

    if (position === keys.length - 1) {
      lines.push(...renderLines(container?.afterLast, childPrefix, options))
    }
  })

  if (keys.length === 0) {
    lines.push(...renderLines(container?.afterLast, childPrefix, options))
  }

  lines.push(`${indent(depth)}}`)
  return lines.join('\n')
}

function emitArray(
  array: unknown[],
  depth: number,
  comments: CommentIndex,
  orderHints: WeakMap<object, string[]>,
  options: EmitOptions,
): string {
  const container = comments.container.get(array)
  const { normal, injected } = partitionArray(array, options.injectedElements)

  if (normal.length + injected.length === 0) {
    return emitEmptyContainer(
      depth,
      container?.inner,
      container?.afterLast,
      options,
      ['[', ']'],
    )
  }

  const childPrefix = indent(depth + 1)
  const lines: string[] = ['[']
  const total = normal.length + injected.length
  let position = 0

  const emitItem = (item: ArrayItem): void => {
    const slots = itemSlots(comments, array, item)
    const isLast = position === total - 1
    position++

    lines.push(...renderLines(slots?.before, childPrefix, options))

    let line = `${childPrefix}${emitValue(item.value, depth + 1, comments, orderHints, options)}`

    const afterValue = renderInline(slots?.afterValue, childPrefix, options)
    if (afterValue.text) {
      line += ` ${afterValue.text}`
    }

    if (!isLast) {
      line += ','
    }

    const after = renderInline(slots?.after, childPrefix, options)
    if (after.text) {
      line += ` ${after.text}`
    }

    lines.push(line, ...afterValue.extras, ...after.extras)
  }

  normal.forEach(emitItem)
  lines.push(...renderLines(container?.afterLast, childPrefix, options))
  injected.forEach(emitItem)

  lines.push(`${indent(depth)}]`)
  return lines.join('\n')
}

/**
 * 按输出 DFS 顺序枚举所有注释条目，用于条件编译 region 的发射顺序复核。
 */
export function walkCommentEntries(
  value: unknown,
  comments: CommentIndex,
  orderHints: WeakMap<object, string[]>,
  options: EmitOptions = {},
): CommentEntry[] {
  const result: CommentEntry[] = []

  function visitItem(array: unknown[], item: ArrayItem): void {
    const slots = itemSlots(comments, array, item)
    if (slots?.before) {
      result.push(...slots.before)
    }
    visit(item.value)
    if (slots?.afterValue) {
      result.push(...slots.afterValue)
    }
    if (slots?.after) {
      result.push(...slots.after)
    }
  }

  function visit(current: unknown): void {
    if (!isObjectValue(current)) {
      return
    }
    const container = comments.container.get(current)
    if (container?.beforeAll) {
      result.push(...container.beforeAll)
    }

    if (Array.isArray(current)) {
      const { normal, injected } = partitionArray(current, options.injectedElements)
      if (normal.length + injected.length === 0) {
        if (container?.inner) {
          result.push(...container.inner)
        }
      }
      normal.forEach(item => visitItem(current, item))
      if (container?.afterLast) {
        result.push(...container.afterLast)
      }
      injected.forEach(item => visitItem(current, item))
    }
    else {
      const object = current as Record<string, unknown>
      const injectedKeys = options.injectedKeys?.get(object)
      const { keys, injected } = orderedKeys(object, orderHints, injectedKeys)
      if (keys.length + injected.length === 0) {
        if (container?.inner) {
          result.push(...container.inner)
        }
      }
      for (const key of keys) {
        const slots = comments.property.get(object)?.get(key)
        if (slots?.before) {
          result.push(...slots.before)
        }
        if (slots?.afterProp) {
          result.push(...slots.afterProp)
        }
        if (slots?.afterColon) {
          result.push(...slots.afterColon)
        }
        visit(object[key])
        if (slots?.afterValue) {
          result.push(...slots.afterValue)
        }
        if (slots?.after) {
          result.push(...slots.after)
        }
      }
      if (container?.afterLast) {
        result.push(...container.afterLast)
      }
      for (const key of injected) {
        const slots = comments.property.get(object)?.get(key)
        if (slots?.before) {
          result.push(...slots.before)
        }
        visit(object[key])
        if (slots?.after) {
          result.push(...slots.after)
        }
      }
    }

    if (container?.afterAll) {
      result.push(...container.afterAll)
    }
  }

  visit(value)
  return result
}

/**
 * 确定性 JSONC 发射：2 空格缩进、`\n`、无尾随换行、无尾逗号。
 */
export function emitJSONC(
  value: unknown,
  comments: CommentIndex,
  orderHints: WeakMap<object, string[]>,
  options: EmitOptions = {},
): string {
  const lines: string[] = []
  const container = isObjectValue(value) ? comments.container.get(value) : undefined

  if (container?.beforeAll) {
    lines.push(...renderLines(container.beforeAll, '', options))
  }
  lines.push(emitValue(value, 0, comments, orderHints, options))
  if (container?.afterAll) {
    lines.push(...renderLines(container.afterAll, '', options))
  }

  return lines.join('\n')
}
