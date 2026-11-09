import type { CommentEntry, CommentIndex, SlotComments } from '../src/types'
import { describe, expect, it } from 'vitest'
import { createCommentIndex } from '../src/comments'
import { emitJSONC } from '../src/emit'

function entry(text: string, overrides: Partial<CommentEntry> = {}): CommentEntry {
  return {
    text,
    kind: 'line',
    inline: false,
    conditional: false,
    source: { file: 'test.ts', line: 1, column: 0 },
    start: 0,
    end: 0,
    ...overrides,
  }
}

function directive(kind: 'ifdef' | 'ifndef' | 'if' | 'else' | 'endif', condition?: string): CommentEntry {
  return entry(` #${kind}${condition ? ` ${condition}` : ''}`, {
    conditional: true,
    directive: { kind, condition },
  })
}

function setProperty(
  index: CommentIndex,
  object: Record<string, unknown>,
  key: string,
  slots: SlotComments,
): void {
  const map = index.property.get(object) ?? new Map<string, SlotComments>()
  map.set(key, slots)
  index.property.set(object, map)
}

function emit(
  value: unknown,
  index: CommentIndex,
  hints: Array<[object, string[]]> = [],
  options = {},
): string {
  const orderHints = new WeakMap<object, string[]>(hints)
  return emitJSONC(value, index, orderHints, options)
}

describe('emitJSONC', () => {
  it('formats with 2 spaces, LF and no trailing newline', () => {
    const value = { a: 1, list: [true, null, 'x'], empty: {} }
    expect(emit(value, createCommentIndex())).toBe(`{
  "a": 1,
  "list": [
    true,
    null,
    "x"
  ],
  "empty": {}
}`)
  })

  it('uses order hints for numeric keys and appends missing keys', () => {
    const value: Record<string, unknown> = { 2: 'two', a: 1, b: 2 }
    const output = emit(value, createCommentIndex(), [[value, ['a', '2', 'missing']]])
    expect(output).toBe(`{
  "a": 1,
  "2": "two",
  "b": 2
}`)
  })

  it('renders every property slot', () => {
    const value = { a: 1, b: 2 }
    const index = createCommentIndex()
    setProperty(index, value, 'a', {
      before: [entry(' before a')],
      afterProp: [entry(' p ', { kind: 'block' })],
      afterColon: [entry(' c ', { kind: 'block' })],
      afterValue: [entry(' v ', { kind: 'block' })],
      after: [entry(' tail')],
    })
    expect(emit(value, index)).toBe(`{
  // before a
  "a" /* p */: /* c */ 1 /* v */, // tail
  "b": 2
}`)
  })

  it('renders container inner and after-last comments', () => {
    const value: Record<string, unknown> = { empty: {}, list: [] }
    const index = createCommentIndex()
    index.container.set(value.empty as object, { inner: [entry(' inner')] })
    index.container.set(value.list as object, { inner: [entry(' inner')] })
    index.container.set(value, { afterLast: [entry(' end')] })
    expect(emit(value, index)).toBe(`{
  "empty": {
    // inner
  },
  "list": [
    // inner
  ]
  // end
}`)
  })

  it('does not add a trailing comma before after-last comments', () => {
    const value = { a: 1 }
    const index = createCommentIndex()
    index.container.set(value, { afterLast: [entry(' end')] })
    expect(emit(value, index)).toBe(`{
  "a": 1
  // end
}`)
  })

  it('emits injected keys after after-last comments', () => {
    const value = { a: 1, b: 2 }
    const index = createCommentIndex()
    index.container.set(value, { afterLast: [entry(' end')] })
    const injectedKeys = new WeakMap<object, Set<string>>([[value, new Set(['b'])]])
    expect(emit(value, index, [], { injectedKeys })).toBe(`{
  "a": 1,
  // end
  "b": 2
}`)
  })

  it('emits injected array elements after after-last comments', () => {
    const injected = { path: 'new' }
    const value = ['a', injected]
    const index = createCommentIndex()
    index.container.set(value, { afterLast: [entry(' end')] })
    const injectedElements = new WeakSet<object>([injected])
    expect(emit(value, index, [], { injectedElements })).toBe(`[
  "a",
  // end
  {
    "path": "new"
  }
]`)
  })

  it('degrades block comments containing */ and reports a warning', () => {
    const value = { a: 1 }
    const index = createCommentIndex()
    setProperty(index, value, 'a', { before: [entry(' a */ b ', { kind: 'block' })] })
    const diagnostics: Array<{ code: string }> = []
    const output = emit(value, index, [], { diagnostics })
    expect(output).toContain('// a */ b')
    expect(diagnostics.map(d => d.code)).toContain('block-comment-degraded')
  })

  it('puts directives on their own line even in inline slots', () => {
    const value = { a: 1 }
    const index = createCommentIndex()
    setProperty(index, value, 'a', {
      after: [directive('ifdef', 'H5'), directive('endif')],
    })
    expect(emit(value, index)).toBe(`{
  "a": 1
  // #ifdef H5
  // #endif
}`)
  })

  it('renders root before-all and after-all comments', () => {
    const value = { a: 1 }
    const index = createCommentIndex()
    index.container.set(value, {
      beforeAll: [entry(' head')],
      afterAll: [entry(' tail')],
    })
    expect(emit(value, index)).toBe(`// head
{
  "a": 1
}
// tail`)
  })

  it('is byte-deterministic across repeated runs', () => {
    const value = { list: [{ path: 'a' }, { path: 'b' }] }
    const index = createCommentIndex()
    index.arrayItem.set(value.list[0], { before: [entry(' first')] })
    const first = emit(value, index)
    const second = emit(value, index)
    expect(first).toBe(second)
    expect(first).not.toContain('\r')
    expect(first.endsWith('\n')).toBe(false)
  })
})
