import { describe, expect, it } from 'vitest'
import { ConfigError, parse, parseConfig } from '../src/index'
import { withFixture } from './helpers'

async function analyze(source: string) {
  return withFixture(
    { 'pages.config.ts': source },
    async dir => parseConfig('pages.config', { cwd: dir }),
  )
}

function codes(result: { diagnostics: Array<{ code: string }> }): string[] {
  return result.diagnostics.map(diagnostic => diagnostic.code)
}

describe('conditional directives', () => {
  it('accepts nested, paired regions without diagnostics', async () => {
    const result = await analyze(`export default {
  // #ifdef H5
  a: 1,
  // #ifndef APP-PLUS
  b: 2,
  // #endif
  // #endif
}
`)
    expect(result.diagnostics).toEqual([])
  })

  it('normalizes directive casing and preserves the condition', async () => {
    await withFixture(
      {
        'pages.config.ts': `export default {
  // #IFDEF H5 || MP-WEIXIN
  a: 1,
  // #ENDIF
}
`,
      },
      async (dir) => {
        await expect(parse('pages.config', { cwd: dir })).resolves.toBe(`{
  // #ifdef H5 || MP-WEIXIN
  "a": 1
  // #endif
}`)
      },
    )
  })

  it('reports unmatched-endif', async () => {
    const result = await analyze(`export default {
  a: 1,
  // #endif
}
`)
    expect(codes(result)).toContain('unmatched-endif')
    await expect(
      withFixture(
        {
          'pages.config.ts': `export default {
  a: 1,
  // #endif
}
`,
        },
        dir => parse('pages.config', { cwd: dir }),
      ),
    ).rejects.toMatchObject({ code: 'unmatched-endif' })
  })

  it('reports unclosed-region', async () => {
    const result = await analyze(`export default {
  // #ifdef H5
  a: 1,
}
`)
    expect(codes(result)).toContain('unclosed-region')
  })

  it('reports else-without-if', async () => {
    const result = await analyze(`export default {
  // #else
  a: 1,
}
`)
    expect(codes(result)).toContain('else-without-if')
  })

  it('reports duplicate-else', async () => {
    const result = await analyze(`export default {
  // #ifdef H5
  a: 1,
  // #else
  b: 2,
  // #else
  c: 3,
  // #endif
}
`)
    expect(codes(result)).toContain('duplicate-else')
  })

  it('reports empty-condition', async () => {
    const result = await analyze(`export default {
  // #ifdef
  a: 1,
  // #endif
}
`)
    expect(codes(result)).toContain('empty-condition')
  })

  it('reports endif-trailing-text', async () => {
    const result = await analyze(`export default {
  // #ifdef H5
  a: 1,
  // #endif trailing
}
`)
    expect(codes(result)).toContain('endif-trailing-text')
    expect(result.diagnostics.find(d => d.code === 'endif-trailing-text')?.severity).toBe('warning')
  })

  it('reports crossed-region when output order changes pairing', async () => {
    const result = await analyze(`const pages = [
  // #ifdef H5
  { path: 'b' },
  // #endif
  { path: 'a' },
]
pages.sort((a, b) => (a.path < b.path ? -1 : 1))
export default { pages }
`)
    expect(codes(result)).toContain('crossed-region')
  })

  it('warns directive-unresolved for out-of-scope directives', async () => {
    const result = await analyze(`// #ifdef H5
export default { a: 1 }
`)
    const diagnostic = result.diagnostics.find(d => d.code === 'directive-unresolved')
    expect(diagnostic?.severity).toBe('warning')
  })

  it('treats unsupported directive forms as ordinary comments', async () => {
    const result = await analyze(`export default {
  // #elseif H5
  a: 1,
}
`)
    expect(codes(result)).toContain('directive-invalid')
    expect(result.diagnostics.every(d => d.code !== 'else-without-if')).toBe(true)
  })

  it('returns region diagnostics from parseConfig and throws them from parse', async () => {
    const source = `export default {
  // #ifdef H5
  a: 1,
}
`
    const result = await analyze(source)
    expect(codes(result)).toContain('unclosed-region')

    await withFixture({ 'pages.config.ts': source }, async (dir) => {
      try {
        await parse('pages.config', { cwd: dir })
        throw new Error('expected parse to throw')
      }
      catch (error) {
        expect(error).toBeInstanceOf(ConfigError)
        expect((error as ConfigError).code).toBe('unclosed-region')
      }
    })
  })
})
