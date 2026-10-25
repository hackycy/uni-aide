import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigError, findConfigFile, parse, parseConfig } from '../src/index'
import { withFixture } from './helpers'

const fixturesDir = resolve(__dirname, 'fixtures')

describe('findConfigFile', () => {
  it('finds a config file by name', () => {
    expect(findConfigFile(fixturesDir, 'pages.config')).toBe(
      resolve(fixturesDir, 'pages.config.ts'),
    )
  })

  it('returns null when the config file is missing', () => {
    expect(findConfigFile(fixturesDir, 'missing.config')).toBeNull()
  })
})

describe('parseConfig', () => {
  it('evaluates a TypeScript config and returns value, hints and comments', async () => {
    await withFixture(
      {
        'pages.config.ts': `export default {
  // leading
  a: 1,
  nested: { b: 2 },
}
`,
      },
      async (dir) => {
        const result = await parseConfig('pages.config', { cwd: dir })
        expect(result.value).toEqual({ a: 1, nested: { b: 2 } })
        expect(Object.keys(result.value as object)).toEqual(['a', 'nested'])
        expect(result.orderHints.get(result.value as object)).toEqual([
          'a',
          'nested',
        ])
        expect(result.diagnostics).toEqual([])
      },
    )
  })

  it('does not pollute the evaluated value', async () => {
    await withFixture(
      {
        'pages.config.ts': `const keys = Object.keys({ a: 1, b: 2 })
export default { a: 1, b: 2, keys }
`,
      },
      async (dir) => {
        const result = await parseConfig('pages.config', { cwd: dir })
        expect(result.value).toEqual({ a: 1, b: 2, keys: ['a', 'b'] })
        expect(Object.keys(result.value as object)).toEqual(['a', 'b', 'keys'])
      },
    )
  })

  it('evaluates a CommonJS config', async () => {
    await withFixture(
      {
        'manifest.config.cts': `module.exports = { name: 'demo' }\n`,
      },
      async (dir) => {
        const result = await parseConfig('manifest.config', { cwd: dir })
        expect(result.value).toEqual({ name: 'demo' })
      },
    )
  })

  it('evaluates a config that imports another local module', async () => {
    await withFixture(
      {
        'base.ts': `export const base = { a: 1 }\n`,
        'manifest.config.ts': `import { base } from './base'\nexport default { ...base, b: 2 }\n`,
      },
      async (dir) => {
        const result = await parseConfig('manifest.config', { cwd: dir })
        expect(result.value).toEqual({ a: 1, b: 2 })
      },
    )
  })
})

describe('parse', () => {
  it('emits JSONC with source key order', async () => {
    await withFixture(
      {
        'pages.config.ts': `export default { b: 2, a: 1 }\n`,
      },
      async (dir) => {
        await expect(parse('pages.config', { cwd: dir })).resolves.toBe(
          '{\n  "b": 2,\n  "a": 1\n}',
        )
      },
    )
  })

  it('throws a typed error when the config file is missing', async () => {
    await expect(parse('missing.config', { cwd: fixturesDir })).rejects.toMatchObject({
      name: 'ConfigError',
      code: 'config-not-found',
    })
  })
})

describe('evaluation errors', () => {
  it('rejects non-object exports', async () => {
    await withFixture(
      { 'pages.config.ts': `export default 'nope'\n` },
      async (dir) => {
        await expect(parseConfig('pages.config', { cwd: dir })).rejects.toMatchObject({
          code: 'config-not-object',
        })
      },
    )
  })

  it('rejects async configs', async () => {
    await withFixture(
      { 'pages.config.ts': `export default Promise.resolve({ a: 1 })\n` },
      async (dir) => {
        await expect(parseConfig('pages.config', { cwd: dir })).rejects.toMatchObject({
          code: 'async-config-unsupported',
        })
      },
    )
  })

  it('rejects function configs', async () => {
    await withFixture(
      { 'pages.config.ts': `export default () => ({ a: 1 })\n` },
      async (dir) => {
        await expect(parseConfig('pages.config', { cwd: dir })).rejects.toMatchObject({
          code: 'function-config-unsupported',
        })
      },
    )
  })

  it('wraps evaluation failures', async () => {
    await withFixture(
      { 'pages.config.ts': `throw new Error('boom')\nexport default {}\n` },
      async (dir) => {
        await expect(parseConfig('pages.config', { cwd: dir })).rejects.toMatchObject({
          code: 'evaluation-failed',
        })
      },
    )
  })

  it('reports parse errors', async () => {
    await withFixture(
      { 'pages.config.ts': `export default {\n` },
      async (dir) => {
        await expect(parseConfig('pages.config', { cwd: dir })).rejects.toMatchObject({
          code: 'parse-error',
        })
      },
    )
  })

  it('exposes the typed error class', async () => {
    try {
      await withFixture(
        { 'pages.config.ts': `export default null\n` },
        async (dir) => {
          await parseConfig('pages.config', { cwd: dir })
        },
      )
    }
    catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).code).toBe('config-not-object')
    }
  })
})

describe('value normalization', () => {
  it('drops undefined/function/symbol properties and nulls array elements', async () => {
    await withFixture(
      {
        'pages.config.ts': `export default {
  a: undefined,
  b: () => 1,
  c: Symbol('x'),
  list: [undefined, () => 1, Symbol('x')],
}
`,
      },
      async (dir) => {
        const result = await parseConfig('pages.config', { cwd: dir })
        expect(result.value).toEqual({ list: [null, null, null] })
        const dropped = result.diagnostics.filter(d => d.code === 'dropped-value')
        expect(dropped).toHaveLength(6)
        expect(dropped.map(d => d.path)).toContainEqual(['a'])
        expect(dropped.map(d => d.path)).toContainEqual(['list', 0])
      },
    )
  })

  it('replaces NaN and Infinity with null and warns with paths', async () => {
    await withFixture(
      {
        'pages.config.ts': `export default { n: NaN, i: Infinity }\n`,
      },
      async (dir) => {
        const result = await parseConfig('pages.config', { cwd: dir })
        expect(result.value).toEqual({ n: null, i: null })
        const warnings = result.diagnostics.filter(d => d.code === 'non-finite-number')
        expect(warnings.map(d => d.path)).toEqual([['n'], ['i']])
      },
    )
  })

  it('serializes Date and objects with toJSON', async () => {
    await withFixture(
      {
        'pages.config.ts': `export default {
  d: new Date('2020-01-01T00:00:00.000Z'),
  o: { value: 1, toJSON() { return { wrapped: this.value } } },
}
`,
      },
      async (dir) => {
        const result = await parseConfig('pages.config', { cwd: dir })
        expect(result.value).toEqual({
          d: '2020-01-01T00:00:00.000Z',
          o: { wrapped: 1 },
        })
      },
    )
  })

  it('rejects BigInt values', async () => {
    await withFixture(
      { 'pages.config.ts': `export default { n: 1n }\n` },
      async (dir) => {
        await expect(parseConfig('pages.config', { cwd: dir })).rejects.toMatchObject({
          code: 'bigint-value',
          path: ['n'],
        })
      },
    )
  })

  it('rejects RegExp, Map and Set values', async () => {
    for (const value of ['/x/', 'new Map()', 'new Set()']) {
      await withFixture(
        { 'pages.config.ts': `export default { value: ${value} }\n` },
        async (dir) => {
          await expect(parseConfig('pages.config', { cwd: dir })).rejects.toMatchObject({
            code: 'unserializable-value',
          })
        },
      )
    }
  })

  it('rejects circular references', async () => {
    await withFixture(
      {
        'pages.config.ts': `const a = {}\na.self = a\nexport default { a }\n`,
      },
      async (dir) => {
        await expect(parseConfig('pages.config', { cwd: dir })).rejects.toMatchObject({
          code: 'circular-reference',
        })
      },
    )
  })
})
