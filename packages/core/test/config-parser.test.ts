import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseConditionalComments } from '../src/config-parser'

describe('parseConditionalComments', () => {
  const fixturesDir = resolve(__dirname, 'fixtures')

  it('should parse conditional comments in TypeScript config file', () => {
    const configPath = resolve(fixturesDir, 'pages.config.ts')
    const result = parseConditionalComments(configPath)

    // 手动检查
    writeFileSync(resolve(fixturesDir, 'pages.config.parsed.ts'), result, 'utf-8')

    // 应该包含转换后的注释标记
    expect(result).toContain('__comment')
  })
})
