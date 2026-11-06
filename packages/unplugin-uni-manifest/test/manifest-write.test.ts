import type { TempProject } from './helpers'
import fs from 'node:fs'
import path from 'node:path'
import lockfile from 'proper-lockfile'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '../src/core/context'
import { createTempProject, readOutput } from './helpers'

const V1 = `export default { name: 'v1' }`
const V2 = `export default { name: 'v2' }`

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

describe('manifest 输出管线', () => {
  it('输出目录与文件都不存在时创建，且不残留锁', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const project = await make({ config: V1 })

    expect(fs.existsSync(project.srcDir)).toBe(false)
    await project.write()

    expect(await readOutput(project.outputPath)).toContain('"name": "v1"')
    expect(fs.existsSync(`${project.outputPath}.lock`)).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('输出文件删除后可重新生成', async () => {
    const project = await make({ config: V1, initialOutput: '{"sentinel":true}' })
    await fs.promises.rm(project.outputPath)

    await project.write()

    expect(await readOutput(project.outputPath)).toContain('"name": "v1"')
    expect(fs.existsSync(`${project.outputPath}.lock`)).toBe(false)
  })

  it('锁被短暂持有时重试后写出', async () => {
    const project = await make({ config: V1, initialOutput: '{"sentinel":true}' })
    const releaseHolder = await lockfile.lock(project.outputPath, {
      realpath: false,
      stale: 5000,
    })

    const timer = setTimeout(() => {
      void releaseHolder().catch(() => {})
    }, 20)

    try {
      await project.write()
    }
    finally {
      clearTimeout(timer)
    }

    expect(await readOutput(project.outputPath)).toContain('"name": "v1"')
    expect(fs.existsSync(`${project.outputPath}.lock`)).toBe(false)
  })

  it('锁持续占用时告警、正常 resolve，释放后可继续生成', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const project = await make({ config: V1, initialOutput: '{"sentinel":true}' })
    const releaseHolder = await lockfile.lock(project.outputPath, {
      realpath: false,
      stale: 5000,
    })

    try {
      await expect(project.write()).resolves.toBeUndefined()

      const messages = warn.mock.calls.map(call => call.join(' '))
      expect(messages.some(message => message.includes('failed to write manifest.json'))).toBe(true)
      expect(await readOutput(project.outputPath)).toBe('{"sentinel":true}')
    }
    finally {
      await releaseHolder()
    }

    await project.write()
    expect(await readOutput(project.outputPath)).toContain('"name": "v1"')
    expect(fs.existsSync(`${project.outputPath}.lock`)).toBe(false)
  })

  it('防抖窗口内的连续事件合并为一次生成', async () => {
    const project = await make({ config: V1 })
    const generate = vi.spyOn(Context.prototype as any, 'generateManifestJSON')

    project.ctx.notifyConfigEvent()
    project.ctx.notifyConfigEvent()
    project.ctx.notifyConfigEvent()
    project.ctx.notifyConfigEvent()
    await project.ctx.flush()

    expect(generate).toHaveBeenCalledTimes(1)
    expect(await readOutput(project.outputPath)).toContain('"name": "v1"')
  })

  it('并发生成串行执行且最终内容为最新配置', async () => {
    const project = await make({ config: V1, initialOutput: '{"sentinel":true}' })
    let inFlight = 0
    let maxInFlight = 0
    const original = (Context.prototype as any).generateManifestJSON

    vi.spyOn(Context.prototype as any, 'generateManifestJSON').mockImplementation(
      async function (this: Context) {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        try {
          return await original.call(this)
        }
        finally {
          inFlight--
        }
      },
    )

    const first = project.write()
    await fs.promises.writeFile(
      path.join(project.root, 'manifest.config.ts'),
      V2,
      'utf-8',
    )
    const second = project.write()
    const third = project.write()

    await Promise.all([first, second, third])

    expect(maxInFlight).toBe(1)
    expect(await readOutput(project.outputPath)).toContain('"name": "v2"')
    expect(fs.existsSync(`${project.outputPath}.lock`)).toBe(false)
  })

  it('close 会取消待触发的防抖任务', async () => {
    const project = await make({ config: V1 })
    project.ctx.notifyConfigEvent()

    await project.ctx.close()
    await new Promise(resolve => setTimeout(resolve, 60))

    expect(fs.existsSync(project.outputPath)).toBe(false)
  })

  it('配置文件删除后重新添加可恢复生成', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const project = await make({ config: V1 })
    const configPath = path.join(project.root, 'manifest.config.ts')

    project.ctx.setupWatcher()
    await project.write()
    expect(await readOutput(project.outputPath)).toContain('"name": "v1"')

    // 先做一次真实 change，证明 watcher 已就绪
    await fs.promises.writeFile(configPath, V2, 'utf-8')
    await vi.waitFor(async () => {
      expect(await readOutput(project.outputPath)).toContain('"name": "v2"')
    }, { timeout: 5000, interval: 50 })

    fs.rmSync(configPath)
    await vi.waitFor(() => {
      expect(
        log.mock.calls.some(call => call.join(' ').includes('generation failed')),
      ).toBe(true)
    }, { timeout: 5000, interval: 50 })

    await fs.promises.writeFile(configPath, V1, 'utf-8')
    await vi.waitFor(async () => {
      expect(await readOutput(project.outputPath)).toContain('"name": "v1"')
    }, { timeout: 5000, interval: 50 })
  })
})
