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

    const watcher = chokidar.watch(sourceConfigPath)

    const handleFileChange = async () => {
      await this.writeManifestJSON()
    }

    watcher.on('change', handleFileChange)
    watcher.on('add', handleFileChange)
    watcher.on('unlink', handleFileChange)
  }

  async writeManifestJSON() {
    try {
      const jsonc = await parse(MANIFEST_CONFIG_FILE, {
        cwd: this.root,
      })

      await fs.promises.writeFile(this.options.outputJsonPath, jsonc, { encoding: 'utf-8' })
    }
    catch {
      // ignore
    }
  }
}
