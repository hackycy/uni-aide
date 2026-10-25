import type { TempProject } from './helpers'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTempProject, readOutput } from './helpers'

const projects: TempProject[] = []

async function make(input: Parameters<typeof createTempProject>[0]): Promise<TempProject> {
  const project = await createTempProject(input)
  projects.push(project)
  return project
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(projects.splice(0).map(project => project.cleanup()))
})

describe('manifest 注释管线', () => {
  it('注释与 #ifdef 原样保留且不产生诊断', async () => {
    const config = `export default {
  name: 'demo',
  // 普通行注释
  /* 块注释 */
  'app-plus': {
    // #ifdef H5
    modules: {},
    // #endif
  },
}
`
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const project = await make({ config })

    await project.write()
    const output = await readOutput(project.outputPath)

    expect(warn).not.toHaveBeenCalled()
    expect(output).toContain('// 普通行注释')
    expect(output).toContain('/* 块注释 */')
    expect(output).toContain('// #ifdef H5')
    expect(output).toContain('// #endif')
    expect(output).not.toContain('不支持')
    expect(output).not.toContain('unsupported')
  })

  it('region 诊断降级为 warning 且不阻塞写出', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const project = await make({
      config: `export default {
  name: 'demo',
  // #ifdef H5
  'app-plus': {},
}
`,
      initialOutput: '{"sentinel":true}',
    })

    await project.write()
    const output = await readOutput(project.outputPath)

    expect(output).not.toBe('{"sentinel":true}')
    expect(output).toContain('// #ifdef H5')
    const messages = warn.mock.calls.map(call => call.join(' '))
    expect(messages.some(message => message.includes('unclosed-region'))).toBe(true)
  })

  it('求值错误仍然中止并保留旧文件', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const sentinel = '{"sentinel":true}'

    const notObject = await make({
      config: `export default 'not-an-object'`,
      initialOutput: sentinel,
    })
    await notObject.write()
    expect(await readOutput(notObject.outputPath)).toBe(sentinel)

    const asyncConfig = await make({
      config: `export default async () => ({ name: 'demo' })`,
      initialOutput: sentinel,
    })
    await asyncConfig.write()
    expect(await readOutput(asyncConfig.outputPath)).toBe(sentinel)
  })

  it('写出路径不产生临时文件且不改写源配置', async () => {
    const config = `export default {
  name: 'demo',
}
`
    const project = await make({ config })

    await project.write()

    expect((await fs.promises.readdir(project.root)).sort()).toEqual([
      'manifest.config.ts',
      'src',
    ])
    expect((await fs.promises.readdir(project.srcDir)).sort()).toEqual([
      'manifest.json',
    ])
    expect(
      await fs.promises.readFile(
        path.join(project.root, 'manifest.config.ts'),
        'utf-8',
      ),
    ).toBe(config)
  })

  it('写出路径不含旧解析/序列化组合', async () => {
    const source = await fs.promises.readFile(
      new URL('../src/core/context.ts', import.meta.url),
      'utf-8',
    )

    expect(source).toContain('parseConfig(')
    expect(source).toContain('emitJSONC(')
    expect(source).not.toContain('jsoncParse')
    expect(source).not.toContain('jsoncStringify')
    expect(source).not.toMatch(/\bparse\(MANIFEST_CONFIG_FILE/)
  })
})
