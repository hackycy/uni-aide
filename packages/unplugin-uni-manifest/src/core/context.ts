import type { FSWatcher } from 'chokidar'
import type { Options, ResolvedOptions } from '../types'
import fs from 'node:fs'
import process from 'node:process'
import { findConfigFile, parse } from '@uni-aide/core'
import chokidar from 'chokidar'
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
    const sourceConfigPath = findConfigFile(this.root, MANIFEST_CONFIG_FILE)
    if (!sourceConfigPath) {
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

  async close() {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  async writeManifestJSON() {
    try {
      const jsonc = await parse(MANIFEST_CONFIG_FILE, {
        cwd: this.root,
      })

      await fs.promises.writeFile(this.options.outputJsonPath, jsonc, { encoding: 'utf-8' })
      console.log(`[unplugin-uni-manifest] ${this.options.outputJsonPath} has been updated.`)
    }
    catch {
      // ignore
    }
  }
}
