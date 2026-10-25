import type {
  CommentEntry,
  CommentIndex,
  DirectiveInfo,
  DirectiveKind,
  SlotComments,
} from '@uni-aide/core'

const SLOT_PREFIXES: Record<string, keyof SlotComments> = {
  'before': 'before',
  'after-prop': 'afterProp',
  'after-colon': 'afterColon',
  'after-value': 'afterValue',
  'after': 'after',
}

interface CommentToken {
  type: 'BlockComment' | 'LineComment'
  value: string
  inline: boolean
  loc?: { start?: { line?: number, column?: number } }
}

/**
 * 扫描注入的容器与注释追踪：值树中的注释索引、注入元素、注入 key。
 */
export interface InjectionTracker {
  comments: CommentIndex
  injectedElements: WeakSet<object>
  injectedKeys: WeakMap<object, Set<string>>
  scanFiles: Set<string>
}

export function createInjectionTracker(comments: CommentIndex): InjectionTracker {
  return {
    comments,
    injectedElements: new WeakSet(),
    injectedKeys: new WeakMap(),
    scanFiles: new Set(),
  }
}

export function markInjectedKey(
  tracker: InjectionTracker,
  target: object,
  key: string,
): void {
  let keys = tracker.injectedKeys.get(target)
  if (!keys) {
    keys = new Set()
    tracker.injectedKeys.set(target, keys)
  }
  keys.add(key)
}

export function pushInjectedElement<T extends object>(
  tracker: InjectionTracker,
  array: unknown[],
  value: T,
): T {
  array.push(value)
  tracker.injectedElements.add(value)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 仅用于扫描块的指令识别：保证 `#ifdef` 等指令独占行并按小写归一发射。
 * 扫描块不参与配置侧的 region 配对，因此这里不产出诊断。
 */
function parseDirective(text: string): DirectiveInfo | undefined {
  const trimmed = text.replace(/^\s+/, '')
  const match = /^#(ifdef|ifndef|if|else|endif)(?=\s|$)/i.exec(trimmed)
  if (!match) {
    return undefined
  }

  const rest = trimmed.slice(match[0].length)
  if (/#(?:ifdef|ifndef|if|else|endif|elif|elseif)\b/i.test(rest)) {
    return undefined
  }

  const kind = match[1].toLowerCase() as DirectiveKind
  if (kind === 'else' || kind === 'endif') {
    return { kind }
  }

  return { kind, condition: rest.trim() }
}

function tokensToEntries(value: unknown, file: string): CommentEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const entries: CommentEntry[] = []
  for (const token of value as CommentToken[]) {
    if (!token || typeof token.value !== 'string') {
      continue
    }
    const directive = parseDirective(token.value)
    entries.push({
      text: token.value,
      kind: token.type === 'BlockComment' ? 'block' : 'line',
      inline: Boolean(token.inline),
      conditional: Boolean(directive),
      directive,
      source: {
        file,
        line: token.loc?.start?.line ?? 1,
        column: token.loc?.start?.column ?? 0,
      },
      start: 0,
      end: 0,
    })
  }

  return entries.length > 0 ? entries : undefined
}

function attachSlots(
  slots: SlotComments,
  kind: keyof SlotComments,
  entries: CommentEntry[],
): void {
  const existing = slots[kind]
  slots[kind] = existing ? [...existing, ...entries] : entries
}

/**
 * 把 `<route>` 块（comment-json 结构）上的注释登记到统一 CommentIndex，
 * 使扫描注入的页面内容仍能保留注释。
 */
function indexScanComments(
  value: unknown,
  comments: CommentIndex,
  file: string,
  seen: WeakSet<object>,
): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return
  }
  seen.add(value)

  const isArray = Array.isArray(value)
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    const descriptor = symbol.description
    const separator = descriptor?.indexOf(':') ?? -1
    if (!descriptor || separator < 0) {
      continue
    }

    const slot = SLOT_PREFIXES[descriptor.slice(0, separator)]
    if (!slot) {
      continue
    }

    const entries = tokensToEntries(
      (value as Record<symbol, unknown>)[symbol],
      file,
    )
    if (!entries) {
      continue
    }

    const key = descriptor.slice(separator + 1)
    if (isArray) {
      const index = Number(key)
      if (!Number.isInteger(index)) {
        continue
      }
      const array = value as unknown[]
      let indexMap = comments.arrayIndex.get(array)
      if (!indexMap) {
        indexMap = new Map()
        comments.arrayIndex.set(array, indexMap)
      }
      let slots = indexMap.get(index)
      if (!slots) {
        slots = {}
        indexMap.set(index, slots)
      }
      attachSlots(slots, slot, entries)
      continue
    }

    let propertyMap = comments.property.get(value)
    if (!propertyMap) {
      propertyMap = new Map()
      comments.property.set(value, propertyMap)
    }
    let slots = propertyMap.get(key)
    if (!slots) {
      slots = {}
      propertyMap.set(key, slots)
    }
    attachSlots(slots, slot, entries)
  }

  if (isArray) {
    for (const item of value as unknown[]) {
      indexScanComments(item, comments, file, seen)
    }
    return
  }

  for (const key of Object.keys(value)) {
    indexScanComments(
      (value as Record<string, unknown>)[key],
      comments,
      file,
      seen,
    )
  }
}

function copyPropertyComments(
  comments: CommentIndex,
  source: object,
  target: object,
  key: string,
): void {
  const slots = comments.property.get(source)?.get(key)
  if (!slots) {
    return
  }

  let propertyMap = comments.property.get(target)
  if (!propertyMap) {
    propertyMap = new Map()
    comments.property.set(target, propertyMap)
  }
  propertyMap.set(key, slots)
}

/**
 * 把扫描到的 `<route>` 内容合并进运行时值树。
 * 配置文件已有的 key 保持不变（配置文件优先），只追加扫描新增的 key；
 * 合并只搬运对象引用，注释随值移动。
 */
export function mergeScanContent(
  tracker: InjectionTracker,
  target: object,
  source: unknown,
  file: string | undefined,
): void {
  if (!isRecord(source)) {
    return
  }

  if (file) {
    tracker.scanFiles.add(file)
    indexScanComments(source, tracker.comments, file, new WeakSet())
  }

  const record = target as Record<string, unknown>
  for (const key of Object.keys(source)) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      continue
    }
    record[key] = source[key]
    markInjectedKey(tracker, target, key)
    copyPropertyComments(tracker.comments, source, target, key)
  }
}
