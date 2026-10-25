import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 在临时目录中创建 fixture 文件，运行结束后清理。
 */
export async function withFixture<T>(
  files: Record<string, string>,
  run: (dir: string) => Promise<T> | T,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'uni-aide-core-'))
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content, 'utf-8')
    }
    return await run(dir)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
