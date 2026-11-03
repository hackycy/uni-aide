import type { ProjectInput, TempProject } from './helpers'
import fs from 'node:fs'
import path from 'node:path'
import { jsoncParse } from '@uni-aide/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '../src/core/context'
import { createTempProject, readOutput, routePage } from './helpers'

const EMPTY_CONFIG = 'export default { pages: [] }'
const projects: TempProject[] = []

async function createProject(input: ProjectInput): Promise<TempProject> {
  const project = await createTempProject(input)
  projects.push(project)
  return project
}

async function readJson(project: TempProject): Promise<Record<string, any>> {
  return jsoncParse(await readOutput(project.outputPath)) as Record<string, any>
}

function pagePaths(output: Record<string, any>): string[] {
  return (output.pages ?? []).map((page: any) => page.path)
}

function tabBarPaths(output: Record<string, any>): string[] {
  return (output.tabBar?.list ?? []).map((item: any) => item.pagePath)
}

function writePage(project: TempProject, relativePath: string, content: string): string {
  const filePath = path.join(project.root, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

async function notifyAndFlush(project: TempProject, filePath: string): Promise<void> {
  project.ctx.notifyFileEvent(filePath)
  await project.ctx.flush()
}

async function expectFullScanMatches(project: TempProject): Promise<void> {
  const incremental = await readOutput(project.outputPath)
  await project.write()
  expect(await readOutput(project.outputPath)).toBe(incremental)
}

function vueReads(mock: { mock: { calls: unknown[][] } }): number {
  return mock.mock.calls.filter(
    ([file]) => String(file).endsWith('.vue'),
  ).length
}

afterEach(async () => {
  await Promise.all(projects.splice(0).map(project => project.cleanup()))
  vi.restoreAllMocks()
})

describe('incremental scan', () => {
  it('change / add / unlink 与全量结果一致', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/index/index.vue': routePage('{ "style": { "navigationBarTitleText": "A" } }'),
        'src/pages/plain/plain.vue': '<template><view /></template>',
      },
    })
    await project.write()
    expect(pagePaths(await readJson(project))).toEqual(['pages/index/index'])
    await expectFullScanMatches(project)

    const added = writePage(
      project,
      'src/pages/list/list.vue',
      routePage('{ "style": {} }'),
    )
    await notifyAndFlush(project, added)
    expect(pagePaths(await readJson(project))).toContain('pages/list/list')
    await expectFullScanMatches(project)

    const changed = writePage(
      project,
      'src/pages/list/list.vue',
      routePage('{ "style": { "navigationBarTitleText": "B" } }'),
    )
    await notifyAndFlush(project, changed)
    const changedPage = (await readJson(project)).pages.find(
      (page: any) => page.path === 'pages/list/list',
    )
    expect(changedPage.style.navigationBarTitleText).toBe('B')
    await expectFullScanMatches(project)

    fs.rmSync(changed)
    await notifyAndFlush(project, changed)
    expect(pagePaths(await readJson(project))).not.toContain('pages/list/list')
    await expectFullScanMatches(project)
  })

  it('文件大小写重命名会移除旧 routePath', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/foo/bar.vue': routePage('{ "style": {} }'),
      },
    })
    await project.write()
    expect(pagePaths(await readJson(project))).toContain('pages/foo/bar')

    const oldPath = path.join(project.root, 'src/pages/foo/bar.vue')
    const newPath = path.join(project.root, 'src/pages/foo/Bar.vue')
    fs.renameSync(oldPath, newPath)

    project.ctx.notifyFileEvent(oldPath)
    project.ctx.notifyFileEvent(newPath)
    await project.ctx.flush()

    const pages = pagePaths(await readJson(project))
    expect(pages).toContain('pages/foo/Bar')
    expect(pages).not.toContain('pages/foo/bar')
    await expectFullScanMatches(project)
  })

  it('目录大小写重命名会移除旧 routePath', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/foo/bar.vue': routePage('{ "style": {} }'),
      },
    })
    await project.write()

    const oldDir = path.join(project.root, 'src/pages/foo')
    const newDir = path.join(project.root, 'src/pages/Foo')
    fs.renameSync(oldDir, newDir)

    project.ctx.notifyDirectoryRemoved(oldDir)
    project.ctx.notifyFileEvent(path.join(oldDir, 'bar.vue'))
    project.ctx.notifyFileEvent(path.join(newDir, 'bar.vue'))
    await project.ctx.flush()

    const pages = pagePaths(await readJson(project))
    expect(pages).toContain('pages/Foo/bar')
    expect(pages).not.toContain('pages/foo/bar')
    await expectFullScanMatches(project)
  })

  it('exclude 目录剪枝对增量变更生效', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
        'src/pages/components/c.vue': routePage('{ "style": {} }'),
        'src/pages/components/deep/d.vue': routePage('{ "style": {} }'),
      },
      options: { exclude: ['components/*'] },
    })
    await project.write()
    expect(pagePaths(await readJson(project))).toEqual(['pages/a/a'])

    const readFile = vi.spyOn(fs.promises, 'readFile')
    readFile.mockClear()

    const excluded = path.join(project.root, 'src/pages/components/deep/d.vue')
    fs.writeFileSync(
      excluded,
      routePage('{ "style": { "navigationBarTitleText": "D" } }'),
      'utf-8',
    )
    await notifyAndFlush(project, excluded)

    expect(vueReads(readFile)).toBe(0)
    expect(pagePaths(await readJson(project))).not.toContain('pages/components/deep/d')
    await expectFullScanMatches(project)
  })

  it('全量扫描期间删除目录不会被 replaceAll 复活', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    const filter = vi.fn(async () => {
      started()
      await gate
    })

    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
        'src/pages/list/list.vue': routePage('{ "style": {} }'),
      },
      options: { onScanPageFilter: filter },
    })

    const initial = project.write()
    await startedPromise

    const dirPath = path.join(project.root, 'src/pages/list')
    fs.rmSync(dirPath, { recursive: true, force: true })
    project.ctx.notifyDirectoryRemoved(dirPath)
    release()
    await initial

    expect(pagePaths(await readJson(project))).not.toContain('pages/list/list')
    await expectFullScanMatches(project)
  })

  it('part 切换与删除 route 块会移除旧分类', async () => {
    const project = await createProject({
      config: 'export default { pages: [], tabBar: { list: [] } }',
      files: {
        'src/pages/tab/tab.vue': routePage('{ "text": "Tab" }', ' part="tabBar"'),
      },
    })
    await project.write()
    let output = await readJson(project)
    expect(pagePaths(output)).not.toContain('pages/tab/tab')
    expect(tabBarPaths(output)).toContain('pages/tab/tab')

    const filePath = path.join(project.root, 'src/pages/tab/tab.vue')
    fs.writeFileSync(filePath, routePage('{ "style": {} }'), 'utf-8')
    await notifyAndFlush(project, filePath)
    output = await readJson(project)
    expect(pagePaths(output)).toContain('pages/tab/tab')
    expect(tabBarPaths(output)).not.toContain('pages/tab/tab')

    fs.writeFileSync(filePath, '<template><view /></template>', 'utf-8')
    await notifyAndFlush(project, filePath)
    output = await readJson(project)
    expect(pagePaths(output)).not.toContain('pages/tab/tab')
  })

  it('route JSON 非法后移除，修复后恢复', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const project = await createProject({
      config: EMPTY_CONFIG,
    })
    await project.write()

    const filePath = writePage(
      project,
      'src/pages/broken/broken.vue',
      routePage('{ invalid }'),
    )
    await notifyAndFlush(project, filePath)
    expect(pagePaths(await readJson(project))).not.toContain('pages/broken/broken')
    expect(error).toHaveBeenCalled()

    fs.writeFileSync(filePath, routePage('{ "style": {} }'), 'utf-8')
    await notifyAndFlush(project, filePath)
    expect(pagePaths(await readJson(project))).toContain('pages/broken/broken')
  })

  it('filter 返回 false 时排除，且只为 route 文件调用', async () => {
    let include = false
    const filter = vi.fn(() => (include ? undefined : false))
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/filtered/filtered.vue': routePage('{ "style": {} }'),
        'src/pages/plain/plain.vue': '<template><view /></template>',
      },
      options: { onScanPageFilter: filter },
    })
    await project.write()
    expect(pagePaths(await readJson(project))).not.toContain('pages/filtered/filtered')
    expect(filter).toHaveBeenCalledTimes(1)

    include = true
    const filePath = path.join(project.root, 'src/pages/filtered/filtered.vue')
    fs.writeFileSync(filePath, routePage('{ "style": { "navigationBarTitleText": "F" } }'), 'utf-8')
    await notifyAndFlush(project, filePath)
    expect(pagePaths(await readJson(project))).toContain('pages/filtered/filtered')
    expect(filter).toHaveBeenCalledTimes(2)

    const plain = path.join(project.root, 'src/pages/plain/plain.vue')
    fs.writeFileSync(plain, '<template><view>changed</view></template>', 'utf-8')
    await notifyAndFlush(project, plain)
    expect(filter).toHaveBeenCalledTimes(2)
  })

  it('filter 抛错时仍包含页面', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
      },
      options: {
        onScanPageFilter() {
          throw new Error('boom')
        },
      },
    })
    await project.write()
    expect(pagePaths(await readJson(project))).toContain('pages/a/a')
  })

  it('exclude 文件与点目录文件不读取、不生成', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/index/index.vue': routePage('{ "style": {} }'),
        'src/pages/components/c.vue': routePage('{ "style": {} }'),
        'src/pages/.hidden/h.vue': routePage('{ "style": {} }'),
      },
      options: { exclude: ['**/components/**'] },
    })
    await project.write()
    expect(pagePaths(await readJson(project))).toEqual(['pages/index/index'])

    const readFile = vi.spyOn(fs.promises, 'readFile')
    readFile.mockClear()

    const excluded = path.join(project.root, 'src/pages/components/c.vue')
    fs.writeFileSync(excluded, routePage('{ "style": { "navigationBarTitleText": "C" } }'), 'utf-8')
    await notifyAndFlush(project, excluded)

    const hidden = path.join(project.root, 'src/pages/.hidden/h.vue')
    fs.writeFileSync(hidden, routePage('{ "style": { "navigationBarTitleText": "H" } }'), 'utf-8')
    await notifyAndFlush(project, hidden)

    expect(vueReads(readFile)).toBe(0)
  })

  it('重叠 scanDir 只读取和过滤一次', async () => {
    const filter = vi.fn()
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
      },
      options: {
        scanDir: ['src/pages', 'src'],
        onScanPageFilter: filter,
      },
    })
    await project.write()
    expect(filter).toHaveBeenCalledTimes(1)
  })

  it('同一文件短时间多次事件只读取一次', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
      },
    })
    await project.write()

    const readFile = vi.spyOn(fs.promises, 'readFile')
    readFile.mockClear()

    const filePath = path.join(project.root, 'src/pages/a/a.vue')
    fs.writeFileSync(filePath, routePage('{ "style": { "navigationBarTitleText": "X" } }'), 'utf-8')
    project.ctx.notifyFileEvent(filePath)
    project.ctx.notifyFileEvent(filePath)
    project.ctx.notifyFileEvent(filePath)
    await project.ctx.flush()

    expect(vueReads(readFile)).toBe(1)
  })

  it('全量扫描期间到达的事件不会丢失', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    const filter = vi.fn(async () => {
      started()
      await gate
    })

    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
      },
      options: { onScanPageFilter: filter },
    })

    const initial = project.write()
    await startedPromise

    const added = writePage(
      project,
      'src/pages/b/b.vue',
      routePage('{ "style": {} }'),
    )
    project.ctx.notifyFileEvent(added)
    release()
    await initial

    expect(pagePaths(await readJson(project))).toEqual(
      expect.arrayContaining(['pages/a/a', 'pages/b/b']),
    )
  })

  it('生成期间到达的事件不会丢失', async () => {
    let release!: () => void
    let gate = Promise.resolve()
    let started!: () => void
    let startedPromise = Promise.resolve()
    const resetGate = () => {
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
      startedPromise = new Promise<void>((resolve) => {
        started = resolve
      })
    }
    const filter = vi.fn(async () => {
      started()
      await gate
    })

    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
      },
      options: { onScanPageFilter: filter },
    })
    await project.write()

    resetGate()
    const a = path.join(project.root, 'src/pages/a/a.vue')
    fs.writeFileSync(a, routePage('{ "style": { "navigationBarTitleText": "A2" } }'), 'utf-8')
    project.ctx.notifyFileEvent(a)
    const pending = project.ctx.flush()
    await startedPromise

    const added = writePage(
      project,
      'src/pages/b/b.vue',
      routePage('{ "style": {} }'),
    )
    project.ctx.notifyFileEvent(added)
    release()
    await pending

    expect(pagePaths(await readJson(project))).toEqual(
      expect.arrayContaining(['pages/a/a', 'pages/b/b']),
    )
  })

  it('配置变更只重新生成，不读取 vue 文件', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
      },
    })
    await project.write()

    const readFile = vi.spyOn(fs.promises, 'readFile')
    readFile.mockClear()

    const configPath = path.join(project.root, 'pages.config.ts')
    fs.writeFileSync(
      configPath,
      'export default { pages: [{ path: "pages/from-config" }] }',
      'utf-8',
    )
    await notifyAndFlush(project, configPath)

    expect(pagePaths(await readJson(project))).toContain('pages/from-config')
    expect(vueReads(readFile)).toBe(0)
  })

  it('unlinkDir 会移除目录下的页面', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/list/list.vue': routePage('{ "style": {} }'),
      },
    })
    await project.write()
    expect(pagePaths(await readJson(project))).toContain('pages/list/list')

    const dirPath = path.join(project.root, 'src/pages/list')
    fs.rmSync(dirPath, { recursive: true, force: true })
    project.ctx.notifyDirectoryRemoved(dirPath)
    await project.ctx.flush()

    expect(pagePaths(await readJson(project))).not.toContain('pages/list/list')
  })

  it('输出文件缺失时可以重新生成并释放锁', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
      },
    })
    await project.write()
    fs.rmSync(project.outputPath)

    await project.write()

    expect(await readOutput(project.outputPath)).toContain('pages/a/a')
    expect(fs.existsSync(`${project.outputPath}.lock`)).toBe(false)
  })

  it('无 route 的组件编辑不触发生成', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
        'src/pages/plain/plain.vue': '<template><view /></template>',
      },
    })
    await project.write()

    const generate = vi.spyOn(Context.prototype as any, 'generatePagesJSON')
    generate.mockClear()

    const plain = path.join(project.root, 'src/pages/plain/plain.vue')
    fs.writeFileSync(plain, '<template><view>changed</view></template>', 'utf-8')
    await notifyAndFlush(project, plain)

    expect(generate).not.toHaveBeenCalled()
  })

  it('真实 watcher 在新增页面后更新输出', async () => {
    const project = await createProject({
      config: EMPTY_CONFIG,
      files: {
        'src/pages/a/a.vue': routePage('{ "style": {} }'),
      },
    })
    await project.ctx.setupWatcher()
    await project.write()

    writePage(project, 'src/pages/b/b.vue', routePage('{ "style": {} }'))

    await vi.waitFor(async () => {
      expect(await readOutput(project.outputPath)).toContain('pages/b/b')
    }, { timeout: 5000, interval: 50 })
  })

  it('真实 watcher 能处理符号链接目录中的页面变更', async () => {
    if (process.platform === 'win32') {
      return
    }

    const project = await createProject({ config: EMPTY_CONFIG })
    const pagesDir = path.join(project.root, 'src/pages')
    const sharedDir = path.join(project.root, 'shared/pages')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.mkdirSync(sharedDir, { recursive: true })
    fs.writeFileSync(
      path.join(sharedDir, 'linked.vue'),
      routePage('{ "style": {} }'),
      'utf-8',
    )
    fs.symlinkSync(sharedDir, path.join(pagesDir, 'linked'), 'dir')

    await project.ctx.setupWatcher()
    await project.write()
    expect(pagePaths(await readJson(project))).toContain('pages/linked/linked')

    fs.writeFileSync(
      path.join(pagesDir, 'linked/linked.vue'),
      routePage('{ "style": { "navigationBarTitleText": "Linked2" } }'),
      'utf-8',
    )

    await vi.waitFor(async () => {
      expect(await readOutput(project.outputPath)).toContain('Linked2')
    }, { timeout: 5000, interval: 50 })
  })
})
