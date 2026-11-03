import type { Options } from '../src'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from '../src/core/context'

export interface TempProject {
  root: string
  outputPath: string
  ctx: Context
  write: () => Promise<void>
  cleanup: () => Promise<void>
}

export interface ProjectInput {
  config: string
  /** 相对项目根目录的文件，例如 `src/pages/index.vue` */
  files?: Record<string, string>
  options?: Options
}

/**
 * 在临时目录建立真实项目：写入 pages.config.ts、扫描文件与既有 pages.json，
 * 使用真实 findConfigFile / writePagesJSON，不 mock 文件系统。
 */
export async function createTempProject(input: ProjectInput): Promise<TempProject> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'uni-pages-'))
  const srcDir = path.join(root, 'src')
  await fs.promises.mkdir(srcDir, { recursive: true })

  const outputPath = path.join(srcDir, 'pages.json')
  await fs.promises.writeFile(outputPath, '', 'utf-8')
  await fs.promises.writeFile(
    path.join(root, 'pages.config.ts'),
    input.config,
    'utf-8',
  )

  for (const [relativePath, content] of Object.entries(input.files ?? {})) {
    const filePath = path.join(root, relativePath)
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, content, 'utf-8')
  }

  const ctx = new Context({
    scanDir: ['src/pages'],
    ...input.options,
  })
  await ctx.setRoot(root)

  return {
    root,
    outputPath,
    ctx,
    write: () => ctx.writePagesJSON(),
    cleanup: async () => {
      await ctx.close()
      await fs.promises.rm(root, { recursive: true, force: true })
    },
  }
}

export function routePage(content: string, attrs: string = ''): string {
  return [
    '<template>',
    '  <view />',
    '</template>',
    '',
    `<route lang="jsonc"${attrs}>`,
    content,
    '</route>',
    '',
  ].join('\n')
}

export async function readOutput(outputPath: string): Promise<string> {
  return fs.promises.readFile(outputPath, 'utf-8')
}
