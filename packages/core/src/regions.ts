import type { CommentEntry, Diagnostic, Placement } from './types'

const OPENERS = new Set(['ifdef', 'ifndef', 'if'])

function regionDiagnostic(
  code: string,
  message: string,
  file: string,
  entry: CommentEntry,
): Diagnostic {
  return {
    severity: 'error',
    code,
    message,
    file,
    line: entry.source.line,
    column: entry.source.column,
  }
}

interface PairFrame {
  pairId: number
  hasElse: boolean
  entry: CommentEntry
}

interface PairResult {
  pairIds: Map<CommentEntry, number>
  diagnostics: Diagnostic[]
}

function pairMarkers(markers: CommentEntry[], file: string): PairResult {
  const pairIds = new Map<CommentEntry, number>()
  const diagnostics: Diagnostic[] = []
  const stack: PairFrame[] = []
  let nextPairId = 1

  for (const entry of markers) {
    const directive = entry.directive!
    const kind = directive.kind

    if (OPENERS.has(kind)) {
      pairIds.set(entry, nextPairId)
      stack.push({ pairId: nextPairId, hasElse: false, entry })
      nextPairId++
      continue
    }

    if (kind === 'else') {
      if (stack.length === 0) {
        diagnostics.push(
          regionDiagnostic(
            'else-without-if',
            '#else without a matching #ifdef/#ifndef/#if',
            file,
            entry,
          ),
        )
        continue
      }
      const frame = stack[stack.length - 1]
      if (frame.hasElse) {
        diagnostics.push(
          regionDiagnostic(
            'duplicate-else',
            'more than one #else in the same region',
            file,
            entry,
          ),
        )
        continue
      }
      frame.hasElse = true
      pairIds.set(entry, frame.pairId)
      continue
    }

    if (stack.length === 0) {
      diagnostics.push(
        regionDiagnostic(
          'unmatched-endif',
          '#endif without a matching #ifdef/#ifndef/#if',
          file,
          entry,
        ),
      )
      continue
    }
    const frame = stack.pop()!
    pairIds.set(entry, frame.pairId)
  }

  for (const frame of stack) {
    diagnostics.push(
      regionDiagnostic(
        'unclosed-region',
        'region is not closed by a matching #endif',
        file,
        frame.entry,
      ),
    )
  }

  return { pairIds, diagnostics }
}

/**
 * 按输出 DFS 顺序复核配对：任一指令与源码顺序配对结果不一致即为交叉 region。
 */
function hasCrossedRegion(
  occurrences: CommentEntry[],
  expected: Map<CommentEntry, number>,
): boolean {
  const stack: number[] = []

  for (const entry of occurrences) {
    const directive = entry.directive!
    const kind = directive.kind
    const pairId = expected.get(entry)
    if (pairId === undefined) {
      return true
    }

    if (OPENERS.has(kind)) {
      stack.push(pairId)
      continue
    }

    if (stack.length === 0 || stack[stack.length - 1] !== pairId) {
      return true
    }

    if (kind === 'endif') {
      stack.pop()
    }
  }

  return stack.length > 0
}

/**
 * 条件编译 region 两遍配对（ticket 06）：
 * 第一遍按源码顺序得到用户意图的配对，第二遍按输出 DFS 顺序复核。
 */
export function validateRegions(
  placements: Placement[],
  outputOrder: CommentEntry[],
  file: string,
): Diagnostic[] {
  const markers: CommentEntry[] = []
  const seen = new Set<CommentEntry>()

  for (const placement of [...placements].sort(
    (a, b) => a.comment.start - b.comment.start,
  )) {
    const entry = placement.comment
    if (entry.directive && !seen.has(entry)) {
      seen.add(entry)
      markers.push(entry)
    }
  }

  if (markers.length === 0) {
    return []
  }

  const source = pairMarkers(markers, file)
  if (source.diagnostics.length > 0) {
    return source.diagnostics
  }

  const occurrences = outputOrder.filter(entry => entry.directive)
  if (occurrences.length === 0) {
    return []
  }

  if (hasCrossedRegion(occurrences, source.pairIds)) {
    return [
      regionDiagnostic(
        'crossed-region',
        'conditional directives pair differently in source order and output order',
        file,
        markers[0],
      ),
    ]
  }

  return []
}
