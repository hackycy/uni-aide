import type { Logger, ViteDevServer } from 'vite'
import type { UniManifestOptions } from './types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { findConfigFile, parse } from '@uni-aide/core'
import { DEFAULT_MANIFEST_CONFIG, MANIFEST_CONFIG_FILE, MANIFEST_JSON_FILE } from './const'

export class ManifestContext {
  private _server: ViteDevServer | undefined

  root: string
  options: UniManifestOptions
  outputJsonPath: string
  logger?: Logger

  constructor(userOptions: UniManifestOptions, viteRoot: string = process.cwd()) {
    this.options = userOptions
    this.root = viteRoot

    this.outputJsonPath = path.join(
      this.root,
      typeof this.options.outDir === 'string' ? this.options.outDir : 'src',
      MANIFEST_JSON_FILE,
    )
  }

  setLogger(logger: Logger) {
    this.logger = logger
  }

  setupViteServer(server: ViteDevServer) {
    if (this._server === server)
      return

    this._server = server
    this.setupWatcher(server.watcher)
  }

  setupWatcher(watcher: ViteDevServer['watcher']) {
    const sourceConfigPath = findConfigFile(this.root, MANIFEST_CONFIG_FILE)
    if (!sourceConfigPath) {
      this.logger?.warn(`Cannot find ${MANIFEST_CONFIG_FILE}`)
      return
    }

    watcher.add(sourceConfigPath)

    const handleFileChange = async (file: string) => {
      if (file !== sourceConfigPath) {
        return
      }

      await this.writeManifestJSON()
    }

    watcher.on('add', handleFileChange)
    watcher.on('change', handleFileChange)
    watcher.on('unlink', handleFileChange)
  }

  async writeManifestJSON() {
    try {
      const jsonc = await parse(MANIFEST_CONFIG_FILE, {
        cwd: this.root,
        defaults: DEFAULT_MANIFEST_CONFIG,
      })

      await fs.promises.writeFile(this.outputJsonPath, jsonc, { encoding: 'utf-8' })
      this.logger?.info(`Generated ${this.outputJsonPath}`, { clear: true, timestamp: true })
    }
    catch {
      this.logger?.error(`Failed to generate ${this.outputJsonPath}`, { clear: true, timestamp: true })
    }
  }
}
