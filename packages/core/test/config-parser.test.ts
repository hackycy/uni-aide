import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfigFile, parse, transformComments } from '../src/config-parser'

describe('transformComments', () => {
  const fixturesDir = resolve(__dirname, 'fixtures')

  it('should transform comments in TypeScript config file', () => {
    const configPath = resolve(fixturesDir, 'pages.config.ts')
    const result = transformComments(configPath)

    // 手动检查
    writeFileSync(resolve(fixturesDir, '_pages.config.transform.ts'), result, 'utf-8')

    // 应该包含转换后的注释标记
    expect(result).toContain('__uni_aide_comment__')
  })

  it('should loadConfigFile', async () => {
    const result = await loadConfigFile('pages.config', fixturesDir)

    // 手动检查
    writeFileSync(resolve(fixturesDir, '_pages.config.loaded.json'), `${result}`, 'utf-8')

    // 应该包含转换后的注释标记
    expect(result).toContain('__uni_aide_comment__')
  })

  it('should parse config file', async () => {
    const result = await parse('pages.config', { cwd: fixturesDir })

    // 手动检查
    writeFileSync(resolve(fixturesDir, '_pages.config.parsed.json'), `${result}`, 'utf-8')
  })
})
