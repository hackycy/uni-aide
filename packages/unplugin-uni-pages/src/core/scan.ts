import type { Stats } from 'node:fs'
import type { ResolvedOptions } from '../types'
import type { ScanFileEntry } from './scan-index'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import picomatch from 'picomatch'
import { escapePath, glob } from 'tinyglobby'
import { FILE_EXTENSIONS } from './constants'
import {
  extsToGlob,
  getRouteSfcBlock,
  parseCustomBlock,
  parseSFC,
  slash,
} from './utils'

const DEFAULT_CONCURRENCY = 32
const SCAN_PATTERN = `**/*.${extsToGlob(FILE_EXTENSIONS)}`
const EXTENSION_PATTERN = new RegExp(`\\.(${FILE_EXTENSIONS.join('|')})$`)
const ESCAPING_BACKSLASHES = /\\(?=[()[\]{}!*+?@|])/g
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin'

export interface LoadScanEntriesOptions {
  inputDir: string
  filter: ResolvedOptions['onScanPageFilter']
  concurrency?: number
  onError?: (file: string, error: unknown) => void
  onInvalidPart?: (file: string, part: string) => void
}

export interface ScanScope {
  isCandidate: (file: string) => boolean
  isIgnored: (file: string, stats?: Stats) => boolean
}

export function normalizeFileKey(file: string): string {
  const key = slash(path.resolve(file))
  return /^[a-z]:\//i.test(key) ? `${key[0].toUpperCase()}${key.slice(1)}` : key
}

function routePathFor(file: string, inputDir: string): string {
  return slash(path.relative(inputDir, file)).replace(EXTENSION_PATTERN, '')
}

function isSupportedPageFile(file: string): boolean {
  return FILE_EXTENSIONS.includes(path.extname(file).slice(1))
}

export async function collectScanFiles(
  options: Pick<ResolvedOptions, 'scanDir' | 'exclude'>,
): Promise<string[]> {
  if (options.scanDir.length === 0) {
    return []
  }

  const results = await Promise.all(
    options.scanDir.map(dir => glob(SCAN_PATTERN, {
      cwd: dir,
      ignore: options.exclude,
      absolute: true,
      onlyFiles: true,
      dot: false,
    })),
  )

  const files = new Set<string>()
  for (const result of results) {
    for (const file of result) {
      files.add(normalizeFileKey(file))
    }
  }
  return [...files]
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length })
  let index = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (index < items.length) {
        const current = index++
        results[current] = await fn(items[current])
      }
    },
  )
  await Promise.all(workers)
  return results
}

export async function loadScanEntries(
  files: readonly string[],
  options: LoadScanEntriesOptions,
): Promise<Map<string, ScanFileEntry>> {
  const parsed = await mapWithConcurrency(
    files,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    file => readScanFile(file, options),
  )

  const entries = new Map<string, ScanFileEntry>()
  for (const entry of parsed) {
    if (!entry) {
      continue
    }

    if (entry.blocks.length === 0) {
      entries.set(entry.file, entry)
      continue
    }

    if (!(await runFilter(options.filter, entry))) {
      entries.set(entry.file, { ...entry, blocks: [] })
      continue
    }

    for (const block of entry.blocks) {
      if (block.part !== 'page' && block.part !== 'subPackage' && block.part !== 'tabBar') {
        options.onInvalidPart?.(entry.file, `${block.part}`)
      }
    }
    entries.set(entry.file, entry)
  }

  return entries
}

/**
 * 在大小写不敏感文件系统上，`bar.vue` 在重命名为 `Bar.vue` 后仍然可读。
 * 逐段比对目录项的实际拼写，避免旧路径被重新加入索引。
 */
export async function filterExactCase(
  files: readonly string[],
  scanDir: readonly string[],
): Promise<string[]> {
  if (!CASE_INSENSITIVE_FS || files.length === 0) {
    return [...files]
  }

  const roots = scanDir.map(dir => normalizeFileKey(dir))
  const listings = new Map<string, Set<string>>()

  const readNames = async (dir: string): Promise<Set<string>> => {
    let names = listings.get(dir)
    if (!names) {
      try {
        names = new Set(await fs.promises.readdir(dir))
      }
      catch {
        names = new Set()
      }
      listings.set(dir, names)
    }
    return names
  }

  const hasExactPath = async (file: string): Promise<boolean> => {
    for (const root of roots) {
      const relative = path.posix.relative(root, file)
      if (!relative || relative.startsWith('../')) {
        continue
      }

      let current = root
      let exact = true
      for (const segment of relative.split('/')) {
        const names = await readNames(current)
        if (!names.has(segment)) {
          exact = false
          break
        }
        current = path.posix.join(current, segment)
      }
      if (exact) {
        return true
      }
    }
    return false
  }

  const result: string[] = []
  for (const file of files) {
    if (await hasExactPath(file)) {
      result.push(file)
    }
  }
  return result
}

export function createScanScope(
  scanDir: readonly string[],
  exclude: readonly string[],
  configPath: string | null,
): ScanScope {
  const dirs = scanDir.map(dir => normalizeFileKey(dir))
  const matchers = scanDir.map((dir) => {
    const patterns = exclude
      .map(pattern => normalizeIgnorePattern(pattern, dir))
      .filter((pattern): pattern is string => pattern !== null)

    return patterns.length > 0
      ? picomatch(patterns, { dot: false, posix: true })
      : null
  })
  const configKey = configPath ? normalizeFileKey(configPath) : null

  function relativePath(dir: string, key: string): string | null {
    const relative = path.posix.relative(dir, key)
    return relative.startsWith('../') ? null : relative
  }

  function isIgnoredRelative(
    relative: string,
    matcher: ((value: string) => boolean) | null,
  ): boolean {
    const segments = relative.split('/')
    if (segments.some(segment => segment.startsWith('.'))) {
      return true
    }
    if (!matcher) {
      return false
    }

    let current = ''
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment
      if (matcher(current)) {
        return true
      }
    }
    return false
  }

  function isCandidate(file: string): boolean {
    const key = normalizeFileKey(file)
    if (!isSupportedPageFile(key)) {
      return false
    }

    return dirs.some((dir, index) => {
      const relative = relativePath(dir, key)
      return relative !== null
        && relative !== ''
        && !isIgnoredRelative(relative, matchers[index])
    })
  }

  return {
    isCandidate,
    isIgnored(file, stats) {
      const key = normalizeFileKey(file)
      if (configKey && key === configKey) {
        return false
      }
      if (!stats || stats.isSymbolicLink()) {
        return false
      }

      if (stats.isDirectory()) {
        let contained = false
        let accepted = false

        for (let index = 0; index < dirs.length; index++) {
          const relative = relativePath(dirs[index], key)
          if (relative === null) {
            continue
          }
          if (!relative) {
            accepted = true
            break
          }

          contained = true
          if (!isIgnoredRelative(relative, matchers[index])) {
            accepted = true
            break
          }
        }

        return contained && !accepted
      }

      return !isCandidate(key)
    },
  }
}

async function readScanFile(
  file: string,
  options: LoadScanEntriesOptions,
): Promise<ScanFileEntry | null> {
  const routePath = routePathFor(file, options.inputDir)

  let code: string
  try {
    code = await fs.promises.readFile(file, 'utf-8')
  }
  catch (error) {
    if (!isMissingFileError(error)) {
      options.onError?.(file, error)
    }
    return null
  }

  try {
    if (!code.includes('<route')) {
      return { file, routePath, blocks: [] }
    }

    const sfc = parseSFC(code, { filename: file })
    const blocks = getRouteSfcBlock(sfc)?.map(
      block => parseCustomBlock(block, file)!,
    ) ?? []
    return { file, routePath, blocks }
  }
  catch (error) {
    options.onError?.(file, error)
    return { file, routePath, blocks: [] }
  }
}

async function runFilter(
  filter: ResolvedOptions['onScanPageFilter'],
  entry: ScanFileEntry,
): Promise<boolean> {
  try {
    return (await filter(entry.routePath, entry.file, entry.blocks)) !== false
  }
  catch {
    return true
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

/**
 * 镜像 tinyglobby 0.2.15 的 ignore 归一化：
 * - 空 pattern / `!` 负向 pattern 丢弃；
 * - 去尾部 `/`，非 `*` 结尾时追加 `/**`；
 * - 绝对 pattern 相对 scanDir 转成相对路径，其余做 posix 归一化。
 */
function normalizeIgnorePattern(pattern: string, cwd: string): string | null {
  if (!pattern) {
    return null
  }
  if (pattern[0] === '!' && pattern[1] !== '(') {
    return null
  }

  let result = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern
  if (!result.endsWith('*')) {
    result += '/**'
  }

  if (path.isAbsolute(result.replace(ESCAPING_BACKSLASHES, ''))) {
    result = path.posix.relative(
      escapePath(slash(path.resolve(cwd))),
      result,
    )
  }
  else {
    result = path.posix.normalize(result)
  }

  return result
}
