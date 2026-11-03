import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { globSync } from 'tinyglobby'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveOptions } from '../src/core/options'
import { createScanScope, normalizeFileKey } from '../src/core/scan'

const FILE_GLOB = '**/*.{vue,nvue,uvue}'
const roots: string[] = []

function createTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-pages-match-'))
  roots.push(root)

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  return root
}

function walkFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(filePath)
      }
      else if (entry.isFile()) {
        files.push(filePath)
      }
    }
  }
  walk(dir)
  return files
}

function assertParity(scanDirs: string[], exclude: string[]) {
  const scope = createScanScope(scanDirs, exclude, null)
  const expected = new Set<string>()
  const discovered = new Set<string>()

  for (const dir of scanDirs) {
    for (const file of globSync(FILE_GLOB, {
      cwd: dir,
      ignore: exclude,
      absolute: true,
      onlyFiles: true,
    })) {
      expected.add(normalizeFileKey(file))
    }

    for (const file of walkFiles(dir)) {
      discovered.add(normalizeFileKey(file))
    }
  }

  const actual = [...discovered]
    .filter(file => scope.isCandidate(file))
    .sort()
  expect(actual).toEqual([...expected].sort())
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('scan scope', () => {
  let root: string
  let scanDir: string
  let nestedDir: string
  let dotPagesDir: string

  beforeEach(() => {
    root = createTree({
      'pages.config.ts': 'export default {}',
      'scan/a.vue': '',
      'scan/keep.vue': '',
      'scan/A.VUE': '',
      'scan/notes.txt': '',
      'scan/.dot.vue': '',
      'scan/.hidden/e.vue': '',
      'scan/nested/b.vue': '',
      'scan/nested/x.spec.vue': '',
      'scan/nested/components/x.vue': '',
      'scan/components/c.vue': '',
      'scan/components/deep/d.vue': '',
      '.pages/a.vue': '',
      '.pages/.hidden/b.vue': '',
    })
    scanDir = path.join(root, 'scan')
    nestedDir = path.join(scanDir, 'nested')
    dotPagesDir = path.join(root, '.pages')
  })

  it('无 exclude 时与 glob 结果完全一致', () => {
    assertParity([scanDir], [])
  })

  it('**/components/**', () => {
    assertParity([scanDir], ['**/components/**'])
  })

  it('components（expandDirectories 追加 /**）', () => {
    assertParity([scanDir], ['components'])
  })

  it('components/**', () => {
    assertParity([scanDir], ['components/**'])
  })

  it('components/* 会通过目录剪枝排除更深层文件', () => {
    assertParity([scanDir], ['components/*'])
  })

  it('*', () => {
    assertParity([scanDir], ['*'])
  })

  it('**/components/*', () => {
    assertParity([scanDir], ['**/components/*'])
  })

  it('nested/*', () => {
    assertParity([scanDir], ['nested/*'])
  })

  it('**/*.spec.vue', () => {
    assertParity([scanDir], ['**/*.spec.vue'])
  })

  it('负向 ignore pattern 被 tinyglobby 忽略', () => {
    assertParity([scanDir], ['!keep.vue'])
  })

  it('绝对 exclude pattern', () => {
    assertParity([scanDir], [path.join(scanDir, 'components/**')])
  })

  it('绝对 exclude pattern 在含 glob 特殊字符的路径下与 tinyglobby 一致', () => {
    const specialRoot = createTree({
      'proj[1]/scan/a.vue': '',
      'proj[1]/scan/components/c.vue': '',
    })
    const dir = path.join(specialRoot, 'proj[1]/scan')
    assertParity([dir], [path.join(dir, 'components/**')])
  })

  it('重叠 scanDir 时按 glob 结果并集判断', () => {
    assertParity([scanDir, nestedDir], ['components/**'])
  })

  it('点目录作为 scanDir 根时其直接子文件仍可匹配', () => {
    assertParity([dotPagesDir], [])
  })

  it('isIgnored 对配置文件、目录、排除文件与普通文件的行为', () => {
    const configPath = path.join(root, 'pages.config.ts')
    const scope = createScanScope([scanDir], ['**/components/**'], configPath)
    const excluded = path.join(scanDir, 'components/c.vue')
    const included = path.join(scanDir, 'a.vue')

    expect(scope.isIgnored(configPath, fs.statSync(configPath))).toBe(false)
    expect(scope.isIgnored(scanDir, fs.statSync(scanDir))).toBe(false)
    expect(scope.isIgnored(excluded, fs.statSync(excluded))).toBe(true)
    expect(scope.isIgnored(included, fs.statSync(included))).toBe(false)
    expect(scope.isIgnored(included)).toBe(false)
  })

  it('isIgnored 会剪枝被 exclude 命中的目录', () => {
    const scope = createScanScope([scanDir], ['**/components/**'], null)
    const components = path.join(scanDir, 'components')
    const nestedComponents = path.join(nestedDir, 'components')

    expect(scope.isIgnored(components, fs.statSync(components))).toBe(true)
    expect(scope.isIgnored(nestedComponents, fs.statSync(nestedComponents))).toBe(true)
    expect(scope.isIgnored(nestedDir, fs.statSync(nestedDir))).toBe(false)

    const wide = createScanScope([scanDir], ['components/*'], null)
    expect(wide.isIgnored(path.join(components, 'deep'), fs.statSync(path.join(components, 'deep')))).toBe(true)
    expect(wide.isIgnored(components, fs.statSync(components))).toBe(false)

    const union = createScanScope([scanDir, nestedDir], ['components/**'], null)
    expect(union.isIgnored(nestedComponents, fs.statSync(nestedComponents))).toBe(false)
  })

  it('符号链接目录不会被 isIgnored 剪枝', () => {
    if (process.platform === 'win32') {
      return
    }

    const linkTarget = path.join(root, 'link-target')
    fs.mkdirSync(linkTarget, { recursive: true })
    fs.writeFileSync(path.join(linkTarget, 'linked.vue'), '', 'utf-8')

    const linkPath = path.join(scanDir, 'linked')
    fs.symlinkSync(linkTarget, linkPath, 'dir')

    const scope = createScanScope([scanDir], [], null)
    const stats = fs.lstatSync(linkPath)
    expect(stats.isSymbolicLink()).toBe(true)
    expect(scope.isIgnored(linkPath, stats)).toBe(false)
    expect(scope.isCandidate(path.join(linkPath, 'linked.vue'))).toBe(true)
  })

  it('resolveOptions 归一化 exclude、scanDir 与 onScanPageFilter', () => {
    expect(resolveOptions({ exclude: undefined }, '/tmp').exclude).toEqual([])
    expect(resolveOptions({ exclude: 'components' as any }, '/tmp').exclude).toEqual(['components'])
    expect(resolveOptions({ exclude: ['a', 1 as any] }, '/tmp').exclude).toEqual(['a'])
    expect(resolveOptions({ scanDir: [1 as any, 'pages'] }, '/tmp').scanDir).toEqual([path.join('/tmp', 'pages')])
    expect(typeof resolveOptions({ onScanPageFilter: undefined }, '/tmp').onScanPageFilter).toBe('function')
  })
})
