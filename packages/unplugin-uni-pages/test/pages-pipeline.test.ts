import type { TempProject } from './helpers'
import fs from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { createTempProject, readOutput, routePage } from './helpers'

const projects: TempProject[] = []

async function make(input: Parameters<typeof createTempProject>[0]): Promise<TempProject> {
  const project = await createTempProject(input)
  projects.push(project)
  return project
}

afterEach(async () => {
  await Promise.all(projects.splice(0).map(project => project.cleanup()))
})

describe('pages 注释管线', () => {
  it('注释随值穿过合并与排序，扫描新 key 落在 after-last 之后', async () => {
    const project = await make({
      config: `
export default {
  pages: [
    {
      path: 'pages/b/index',
      // #ifdef H5
      style: { navigationBarTitleText: 'B' },
      // #endif
    },
    {
      path: 'pages/a/index',
      style: { navigationBarTitleText: 'A' },
      // page tail
    },
  ],
}
`,
      files: {
        'src/pages/a/index.vue': routePage(
          '{ "style": { "navigationBarTitleText": "SCAN" }, "custom": 123 }',
          ' seq="0"',
        ),
        'src/pages/c/index.vue': routePage(
          '{ "style": { "navigationBarTitleText": "C" } }',
        ),
      },
    })

    await project.write()
    const output = await readOutput(project.outputPath)

    const aIndex = output.indexOf('"path": "pages/a/index"')
    const ifdef = output.indexOf('// #ifdef H5')
    const bIndex = output.indexOf('"path": "pages/b/index"')
    const endif = output.indexOf('// #endif', bIndex)
    const cIndex = output.indexOf('"path": "pages/c/index"')

    // 扫描 seq 让 a 排到 b 前，region 注释跟随 b 移动
    expect(aIndex).toBeGreaterThan(-1)
    expect(aIndex).toBeLessThan(bIndex)
    expect(ifdef).toBeGreaterThan(bIndex)
    expect(ifdef).toBeLessThan(output.indexOf('"navigationBarTitleText": "B"'))
    expect(endif).toBeGreaterThan(output.indexOf('"navigationBarTitleText": "B"'))

    // 配置文件已有的 key 优先，扫描内容只补充新 key
    expect(output).toContain('"navigationBarTitleText": "A"')
    expect(output).not.toContain('"navigationBarTitleText": "SCAN"')
    expect(output).toContain('"custom": 123')

    // 合并进 page 的新 key 在容器 after-last 之后
    const tail = output.indexOf('// page tail')
    expect(tail).toBeGreaterThan(-1)
    expect(output.indexOf('"custom": 123')).toBeGreaterThan(tail)

    // 扫描新增页面在既有页面之后
    expect(cIndex).toBeGreaterThan(bIndex)
  })

  it('扫描新增页面发射在 trailing region 之外', async () => {
    const project = await make({
      config: `
export default {
  pages: [
    { path: 'pages/a/index' },
    // #ifdef MP-WEIXIN
    { path: 'pages/mp/index' },
    // #endif
  ],
}
`,
      files: {
        'src/pages/z/index.vue': routePage(
          '{ "style": { "navigationBarTitleText": "Z" } }',
        ),
      },
    })

    await project.write()
    const output = await readOutput(project.outputPath)

    const ifdef = output.indexOf('// #ifdef MP-WEIXIN')
    const mpIndex = output.indexOf('"path": "pages/mp/index"')
    const endif = output.indexOf('// #endif', mpIndex)
    const zIndex = output.indexOf('"path": "pages/z/index"')

    expect(ifdef).toBeGreaterThan(-1)
    expect(ifdef).toBeLessThan(mpIndex)
    expect(endif).toBeGreaterThan(mpIndex)
    expect(zIndex).toBeGreaterThan(endif)
  })

  it('排序后 region 交叉时中止写出并保留旧文件', async () => {
    const project = await make({
      config: `
export default {
  pages: [
    // #ifdef H5
    { path: 'pages/b/index' },
    // #ifdef MP-WEIXIN
    { path: 'pages/a/index' },
    // #endif
    // #endif
  ],
}
`,
      files: {
        'src/pages/a/index.vue': routePage('{ "style": {} }', ' seq="0"'),
      },
    })

    const sentinel = '{"sentinel":true}'
    await fs.promises.writeFile(project.outputPath, sentinel, 'utf-8')

    await project.write()

    expect(await readOutput(project.outputPath)).toBe(sentinel)
  })

  it('扫描块中的条件编译注释按独占行保留', async () => {
    const project = await make({
      config: `
export default {
  pages: [
    { path: 'pages/a/index' },
  ],
}
`,
      files: {
        'src/pages/z/index.vue': routePage(`{
  "style": {
    "navigationBarTitleText": "Z",
    // #ifdef H5
    "navigationStyle": "custom"
    // #endif
  }
}`),
      },
    })

    await project.write()
    const output = await readOutput(project.outputPath)

    expect(output).toMatch(
      /\/\/ #ifdef H5\n\s+"navigationStyle": "custom"\n\s+\/\/ #endif/,
    )
  })

  it('同一输入重复运行逐字节一致，且不使用 locale 比较器', async () => {
    const project = await make({
      config: `
export default {
  pages: [
    { path: 'pages/b/index' },
    { path: 'pages/a/index' },
  ],
}
`,
      files: {
        'src/pages/c/index.vue': routePage(
          '{ "style": { "navigationBarTitleText": "C" } }',
        ),
      },
    })

    await project.write()
    const first = await readOutput(project.outputPath)
    await project.write()
    const second = await readOutput(project.outputPath)

    expect(second).toBe(first)

    const contextSource = await fs.promises.readFile(
      new URL('../src/core/context.ts', import.meta.url),
      'utf-8',
    )
    expect(contextSource).not.toContain('localeCompare')
    expect(contextSource).toContain('emitJSONC(')
    expect(contextSource).not.toContain('jsoncStringify(pageMeta')
  })
})
