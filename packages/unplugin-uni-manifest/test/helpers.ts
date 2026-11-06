import type { Options } from '../src'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from '../src/core/context'

export interface TempProject {
  root: string
  srcDir: string
  outputPath: string
  ctx: Context
  write: () => Promise<void>
  cleanup: () => Promise<void>
}

export interface ProjectInput {
  config: string
  /** 预先写入的 manifest.json 内容；省略时输出目录与文件都不存在 */
  initialOutput?: string
  options?: Options
}

/**
 * 在临时目录建立真实项目：写入 manifest.config.ts，
 * 可选写入既有 manifest.json，使用真实 findConfigFile / writeManifestJSON，不 mock 文件系统。
 */
export async function createTempProject(input: ProjectInput): Promise<TempProject> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'uni-manifest-'))
  const srcDir = path.join(root, 'src')
  const outputPath = path.join(srcDir, 'manifest.json')

  if (input.initialOutput !== undefined) {
    await fs.promises.mkdir(srcDir, { recursive: true })
    await fs.promises.writeFile(outputPath, input.initialOutput, 'utf-8')
  }

  await fs.promises.writeFile(
    path.join(root, 'manifest.config.ts'),
    input.config,
    'utf-8',
  )

  const ctx = new Context({
    ...input.options,
  })
  ctx.setRoot(root)

  return {
    root,
    srcDir,
    outputPath,
    ctx,
    write: () => ctx.writeManifestJSON(),
    cleanup: async () => {
      await ctx.close()
      await fs.promises.rm(root, { recursive: true, force: true })
    },
  }
}

export async function readOutput(outputPath: string): Promise<string> {
  return fs.promises.readFile(outputPath, 'utf-8')
}
