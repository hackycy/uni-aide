import type { Diagnostic } from '@uni-aide/core'
import type { FSWatcher } from 'chokidar'
import type { Options, ResolvedOptions } from '../types'
import fs from 'node:fs'
import path from 'node:path'
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

const REGENERATE_DEBOUNCE_MS = 30

export class Context {
  options: ResolvedOptions
  root: string = process.cwd()

  private watcher: FSWatcher | null = null
  private generateRequested = false
  private drainPromise: Promise<void> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false

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
    if (this.closed) {
      return
    }

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

    this.watcher.on('add', () => this.notifyConfigEvent())
    this.watcher.on('change', () => this.notifyConfigEvent())
    this.watcher.on('unlink', () => this.notifyConfigEvent())
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
    this.closed = true
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    await this.stopWatcher()
    if (this.drainPromise) {
      await this.drainPromise
    }
  }

  /** @internal */
  notifyConfigEvent() {
    if (this.closed) {
      return
    }

    this.generateRequested = true
    this.scheduleFlush()
  }

  /** @internal */
  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    while (!this.closed) {
      if (this.drainPromise) {
        await this.drainPromise
      }
      else if (this.generateRequested) {
        await this.requestDrain()
      }
      else {
        break
      }
    }
  }

  async writeManifestJSON() {
    this.generateRequested = true
    await this.flush()
  }

  private scheduleFlush() {
    if (this.closed || this.flushTimer) {
      return
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.requestDrain()
    }, REGENERATE_DEBOUNCE_MS)
  }

  private requestDrain(): Promise<void> {
    if (this.drainPromise) {
      return this.drainPromise
    }

    const promise = this.drainLoop()
      .catch((error) => {
        console.error('[unplugin-uni-manifest] generation failed.')
        console.error(error instanceof Error ? error.message : `${error}`)
      })
      .finally(() => {
        this.drainPromise = null
        if (!this.closed && this.generateRequested) {
          this.scheduleFlush()
        }
      })

    this.drainPromise = promise
    return promise
  }

  private async drainLoop(): Promise<void> {
    while (!this.closed) {
      const generate = this.generateRequested
      this.generateRequested = false

      if (!generate) {
        return
      }

      await this.generateManifestJSON()
    }
  }

  private async generateManifestJSON(): Promise<void> {
    try {
      const parsed = await parseConfig(MANIFEST_CONFIG_FILE, {
        cwd: this.options.configSource,
      })
      const diagnostics = downgradeRegionDiagnostics(parsed.diagnostics)
      this.reportDiagnostics(diagnostics)
      this.assertNoErrors(diagnostics)

      const jsonStr = emitJSONC(parsed.value, parsed.comments, parsed.orderHints)
      await this.writeOutput(jsonStr)
    }
    catch (error) {
      console.log(`[unplugin-uni-manifest] ${this.options.outputJsonPath} generation failed.`)
      console.error(error instanceof Error ? error.message : `${error}`)
    }
  }

  private async writeOutput(jsonStr: string): Promise<void> {
    const outputPath = this.options.outputJsonPath

    try {
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })

      const release = await lockfile.lock(outputPath, {
        realpath: false,
        retries: { retries: 3, factor: 2, minTimeout: 20, maxTimeout: 100 },
        stale: 5000,
      })

      try {
        const isSame = await compareStringWithFile(jsonStr, outputPath)
        if (isSame) {
          return
        }

        await atomicWriteFile(outputPath, jsonStr, { encoding: 'utf-8' })
      }
      finally {
        await release()
      }
    }
    catch (error) {
      console.warn('[unplugin-uni-manifest] failed to write manifest.json.')
      console.warn(error instanceof Error ? error.message : `${error}`)
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
