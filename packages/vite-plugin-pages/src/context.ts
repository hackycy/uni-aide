import type { Logger, ViteDevServer } from 'vite'
import type { UniPagesOptions } from './types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { findConfigFile, parse } from '@uni-aide/core'
import json5 from 'json5'
import { PAGE_CONFIG_FILE, PAGE_JSON_FILE } from './const'

export class PageContext {
  private _server: ViteDevServer | undefined

  root: string
  options: UniPagesOptions
  outputJsonPath: string
  logger?: Logger

  constructor(userOptions: UniPagesOptions, viteRoot: string = process.cwd()) {
    this.options = userOptions
    this.root = viteRoot

    this.outputJsonPath = path.join(
      this.root,
      typeof this.options.outDir === 'string' ? this.options.outDir : 'src',
      PAGE_JSON_FILE,
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
    const sourceConfigPath = findConfigFile(this.root, PAGE_CONFIG_FILE)
    if (!sourceConfigPath) {
      this.logger?.warn(`Cannot find ${PAGE_CONFIG_FILE}`)
      return
    }

    watcher.add(sourceConfigPath)

    const handleFileChange = async (file: string) => {
      if (file !== sourceConfigPath) {
        return
      }

      await this.writePagesJSON()
    }

    watcher.on('add', handleFileChange)
    watcher.on('change', handleFileChange)
    watcher.on('unlink', handleFileChange)
  }

  async writePagesJSON() {
    try {
      const jsonc = await parse(PAGE_CONFIG_FILE, {
        cwd: this.root,
      })

      await fs.promises.writeFile(this.outputJsonPath, jsonc, { encoding: 'utf-8' })
      this.logger?.info(`Generated ${this.outputJsonPath}`, { timestamp: true })
    }
    catch {
      this.logger?.error(`Failed to generate ${this.outputJsonPath}`, { timestamp: true })
    }
  }

  async resolveVirtualModule() {
    const pagesStr = await fs.promises.readFile(this.outputJsonPath, { encoding: 'utf-8' })
    let routes: string = '[]'
    let subRoutes: string = '[]'
    try {
      const pages: Record<string, any> = json5.parse(pagesStr)
      routes = JSON.stringify(pages.pages || [], null, 2)
      subRoutes = JSON.stringify(pages.subPackages || [], null, 2)
    }
    catch {
      // ignore
    }

    const pages = `export const pages = ${routes};`
    const subPackages = `export const subPackages = ${subRoutes};`
    return [pages, subPackages].join('\n')
  }
}
