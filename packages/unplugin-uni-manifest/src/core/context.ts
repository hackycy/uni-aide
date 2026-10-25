import type { Diagnostic } from '@uni-aide/core'
import type { FSWatcher } from 'chokidar'
import type { Options, ResolvedOptions } from '../types'
import process from 'node:process'
import {
  atomicWriteFile,
  compareStringWithFile,
  ConfigError,
  emitJSONC,
  findConfigFile,
  parseConfig,
} from '@uni-aide/core'
import chokidar from 'chokidar'
import lockfile from 'proper-lockfile'
import { MANIFEST_CONFIG_FILE } from './constants'
import { resolveOptions } from './options'

export class Context {
  options: ResolvedOptions
  root: string = process.cwd()

  private watcher: FSWatcher | null = null

  constructor(private rawOptions: Options) {
    this.options = resolveOptions(this.rawOptions, this.root)
  }

  setRoot(root: string) {
    if (this.root === root) {
      return
    }

    this.root = root
    this.options = resolveOptions(this.rawOptions, this.root)
  }

  setupWatcher() {
    const sourceConfigPath = findConfigFile(this.options.configSource, MANIFEST_CONFIG_FILE)
    if (!sourceConfigPath) {
      this.stopWatcher()
      return
    }

    if (this.watcher) {
      return
    }

    this.watcher = chokidar.watch(sourceConfigPath, {
      ignoreInitial: true, // Don't fire events for initial add
    })

    const handleFileChange = async () => {
      await this.writeManifestJSON()
    }

    this.watcher.on('change', handleFileChange)
    this.watcher.on('unlink', handleFileChange)
  }

  private async stopWatcher() {
    if (!this.watcher) {
      return
    }

    const currentWatcher = this.watcher
    this.watcher = null

    try {
      await currentWatcher.close()
    }
    catch (error) {
      console.error('[unplugin-uni-manifest] failed to close watcher.')
      console.error(error instanceof Error ? error.message : `${error}`)
    }
  }

  async close() {
    this.stopWatcher()
  }

  async writeManifestJSON() {
    // 使用 lockfile 防止并发写入
    let release: (() => Promise<void>) | null = null

    try {
      release = await lockfile.lock(this.options.outputJsonPath, {
        retries: 0,
        stale: 5000,
      })
    }
    catch {
      // 获取锁失败，则视为被占用，直接返回
      return
    }

    try {
      const parsed = await parseConfig(MANIFEST_CONFIG_FILE, {
        cwd: this.options.configSource,
      })
      const diagnostics = downgradeRegionDiagnostics(parsed.diagnostics)
      this.reportDiagnostics(diagnostics)
      this.assertNoErrors(diagnostics)

      const jsonStr = emitJSONC(parsed.value, parsed.comments, parsed.orderHints)
      const isSame = await compareStringWithFile(jsonStr, this.options.outputJsonPath)
      if (isSame) {
        return
      }

      await atomicWriteFile(this.options.outputJsonPath, jsonStr, { encoding: 'utf-8' })
      // console.log(`[unplugin-uni-manifest] ${this.options.outputJsonPath} generated.`)
    }
    catch (error) {
      console.log(`[unplugin-uni-manifest] ${this.options.outputJsonPath} generation failed.`)
      console.error(error instanceof Error ? error.message : `${error}`)
    }
    finally {
      if (release) {
        await release()
      }
    }
  }

  private assertNoErrors(diagnostics: Diagnostic[]): void {
    const errors = diagnostics.filter(
      diagnostic => diagnostic.severity === 'error',
    )
    if (errors.length === 0) {
      return
    }

    const first = errors[0]
    throw new ConfigError({
      code: first.code,
      file: first.file,
      path: first.path,
      message: first.message,
      diagnostics: errors,
    })
  }

  private reportDiagnostics(diagnostics: Diagnostic[]): void {
    for (const diagnostic of diagnostics) {
      if (diagnostic.severity !== 'warning') {
        continue
      }
      const location = diagnostic.file
        ? ` (${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''})`
        : ''
      console.warn(
        `[unplugin-uni-manifest] ${diagnostic.code}: ${diagnostic.message}${location}`,
      )
    }
  }
}

/**
 * 条件编译 region 相关诊断（ticket 06/12）。manifest 不执行条件编译，
 * 这些诊断降级为 warning，不阻塞生成。
 */
const REGION_DIAGNOSTIC_CODES = new Set([
  'unclosed-region',
  'unmatched-endif',
  'else-without-if',
  'duplicate-else',
  'crossed-region',
  'empty-condition',
])

function downgradeRegionDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.map(diagnostic =>
    diagnostic.severity === 'error' && REGION_DIAGNOSTIC_CODES.has(diagnostic.code)
      ? { ...diagnostic, severity: 'warning' }
      : diagnostic,
  )
}
