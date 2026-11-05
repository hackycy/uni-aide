import { describe, expect, it } from 'vitest'
import { parse, parseConfig } from '../src/index'
import { withFixture } from './helpers'

async function analyze(source: string) {
  return withFixture(
    { 'pages.config.ts': source },
    async dir => parseConfig('pages.config', { cwd: dir }),
  )
}

async function emit(source: string) {
  return withFixture(
    { 'pages.config.ts': source },
    async dir => parse('pages.config', { cwd: dir }),
  )
}

function codes(result: { diagnostics: Array<{ code: string }> }): string[] {
  return result.diagnostics.map(diagnostic => diagnostic.code)
}

describe('comment ownership', () => {
  it('classifies before, trailing, after-prop, after-colon and after-value comments', async () => {
    const output = await emit(`export default {
  /* before a */
  a: 1, // trailing a
  b: /* colon */ 2,
  c /* prop */: 3,
  d: 4 /* value */,
  e: 5,
}
`)
    expect(output).toBe(`{
  /* before a */
  "a": 1, // trailing a
  "b": /* colon */ 2,
  "c" /* prop */: 3,
  "d": 4 /* value */,
  "e": 5
}`)
  })

  it('moves comments with array items when identities are reordered', async () => {
    const output = await emit(`const pages = [
  // for a
  { path: 'a' },
  // for b
  { path: 'b' },
]
pages.reverse()
export default { pages }
`)
    expect(output).toBe(`{
  "pages": [
    // for b
    {
      "path": "b"
    },
    // for a
    {
      "path": "a"
    }
  ]
}`)
  })

  it('silently drops comments on properties removed by normalization', async () => {
    const result = await analyze(`export default {
  // normal comment
  a: undefined,
  b: 1,
}
`)
    expect(codes(result)).toContain('dropped-value')
    expect(codes(result)).not.toContain('directive-unresolved')
    await withFixture(
      {
        'pages.config.ts': `export default {
  // normal comment
  a: undefined,
  b: 1,
}
`,
      },
      async (dir) => {
        await expect(parse('pages.config', { cwd: dir })).resolves.not.toContain('normal comment')
      },
    )
  })

  it('warns directive-unresolved when a directive path disappears', async () => {
    const result = await analyze(`export default {
  // #ifdef H5
  a: undefined,
  // #endif
  b: 1,
}
`)
    expect(codes(result)).toContain('directive-unresolved')
  })
})

describe('degradation warnings', () => {
  it('reports computed-key-ambiguous when several computed keys cannot be paired', async () => {
    const result = await analyze(`function key1() { return 'a' }
function key2() { return 'b' }
export default {
  [key1()]: 1,
  [key2()]: 2,
}
`)
    expect(codes(result)).toContain('computed-key-ambiguous')
  })

  it('reports ambiguous-branch and drops branch comments', async () => {
    const result = await analyze(`const flag = Date.now() > 0
export default {
  page: flag
    ? {
        // inside
        path: 'a',
      }
    : { path: 'a' },
}
`)
    expect(codes(result)).toContain('ambiguous-branch')
    await withFixture(
      {
        'pages.config.ts': `const flag = Date.now() > 0
export default {
  page: flag
    ? {
        // inside
        path: 'a',
      }
    : { path: 'a' },
}
`,
      },
      async (dir) => {
        await expect(parse('pages.config', { cwd: dir })).resolves.not.toContain('inside')
      },
    )
  })

  it('reports ambiguous-return when several returns match the runtime value', async () => {
    const result = await analyze(`function make(x: boolean) {
  if (x) {
    return { path: 'a' }
  }
  return { path: 'a' }
}
export default { page: make(Date.now() > 0) }
`)
    expect(codes(result)).toContain('ambiguous-return')
  })

  it('reports duplicate-identity and falls back to index alignment', async () => {
    const result = await analyze(`export default {
  pages: [{ path: 'a' }, { path: 'a' }],
}
`)
    expect(codes(result)).toContain('duplicate-identity')
  })

  it('reports array-reordered-unverifiable for reordered primitive arrays', async () => {
    const result = await analyze(`const list = ['b', 'a']
list.sort()
export default { list }
`)
    expect(codes(result)).toContain('array-reordered-unverifiable')
  })
})

describe('identity wrapper calls', () => {
  it('aligns comments through an imported defineConfig (ESM)', async () => {
    await withFixture(
      {
        'wrapper.ts': `export function defineConfig(config: any) {
  return config
}
`,
        'pages.config.ts': `import { defineConfig } from './wrapper'

export default defineConfig({
  // config comment
  pages: [
    {
      path: 'pages/index/index',
      // #ifdef H5
      style: { navigationStyle: 'custom' },
      // #endif
    },
  ],
})
`,
      },
      async (dir) => {
        const result = await parseConfig('pages.config', { cwd: dir })
        expect(result.value).toEqual({
          pages: [{ path: 'pages/index/index', style: { navigationStyle: 'custom' } }],
        })
        expect(codes(result)).toEqual([])
        await expect(parse('pages.config', { cwd: dir })).resolves.toBe(`{
  // config comment
  "pages": [
    {
      "path": "pages/index/index",
      // #ifdef H5
      "style": {
        "navigationStyle": "custom"
      },
      // #endif
    }
  ]
}`)
      },
    )
  })

  it('aligns comments through a required defineConfig (CJS destructuring)', async () => {
    await withFixture(
      {
        'wrapper.cjs': `module.exports = { defineConfig(config) { return config } }
`,
        'pages.config.cts': `// eslint-disable-next-line ts/no-require-imports
const { defineConfig } = require('./wrapper.cjs')

module.exports = defineConfig({
  // cjs comment
  pages: [{ path: 'pages/index/index' }],
})
`,
      },
      async (dir) => {
        const result = await parseConfig('pages.config', { cwd: dir })
        expect(codes(result)).toEqual([])
        await expect(parse('pages.config', { cwd: dir })).resolves.toBe(`{
  // cjs comment
  "pages": [
    {
      "path": "pages/index/index"
    }
  ]
}`)
      },
    )
  })

  it('does not align when the unresolved wrapper does not forward the argument', async () => {
    await withFixture(
      {
        'wrapper.ts': `export function defineConfig(config: any) {
  return { ...config, injected: true }
}
`,
        'pages.config.ts': `import { defineConfig } from './wrapper'

export default defineConfig({
  // #ifdef H5
  pages: [{ path: 'pages/index/index' }],
  // #endif
})
`,
      },
      async (dir) => {
        const result = await parseConfig('pages.config', { cwd: dir })
        expect(codes(result)).toContain('directive-unresolved')
        await expect(parse('pages.config', { cwd: dir })).resolves.toBe(`{
  "pages": [
    {
      "path": "pages/index/index"
    }
  ],
  "injected": true
}`)
      },
    )
  })

  it('keeps ambiguous local wrappers opaque', async () => {
    await withFixture(
      {
        'pages.config.ts': `function wrap(config: any) {
  if (config.path) {
    return config
  }
  return config
}
export default wrap({
  // should be dropped
  path: 'pages/index/index',
})
`,
      },
      async (dir) => {
        const result = await parseConfig('pages.config', { cwd: dir })
        expect(codes(result)).toContain('ambiguous-return')
        await expect(parse('pages.config', { cwd: dir })).resolves.not.toContain('should be dropped')
      },
    )
  })
})
