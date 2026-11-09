import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from '../src/config-parser'

const casesDir = resolve(__dirname, 'fixtures/golden/cases')
const expectedDir = resolve(__dirname, 'fixtures/golden/expected')

const cases = [
  'basic',
  'conditional',
  'dynamic',
  'define-config',
  'cjs',
  'trailing-comments',
  'escapes',
  'block-comments',
  'edge-lossy',
]

describe('golden: 配置注释还原（L1）', () => {
  for (const name of cases) {
    it(name, async () => {
      const actual = await parse(`${name}.config`, { cwd: casesDir })
      const expected = readFileSync(
        resolve(expectedDir, `${name}.jsonc`),
        'utf-8',
      ).replace(/\r\n/g, '\n')
      // 只归一化 expected：兼容 Windows 检出/导出；actual 不归一化，emitter 的 CRLF 回归仍会失败。
      // emitJSONC 不输出尾随换行；expected 文件以单个换行结尾。
      expect(`${actual}\n`).toBe(expected)
    })
  }
})
