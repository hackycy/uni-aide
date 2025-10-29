import type { FSWatcher } from 'chokidar'
import type { Options, ResolvedOptions } from '../types'
import fs from 'node:fs'
import process from 'node:process'
import { findConfigFile, parse } from '@uni-aide/core'
import chokidar from 'chokidar'
import { parse as jsoncParse } from 'jsonc-parser'
import { PAGES_CONFIG_FILE } from './constants'
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
    const sourceConfigPath = findConfigFile(this.root, PAGES_CONFIG_FILE)
    if (!sourceConfigPath) {
      return
    }

    this.watcher = chokidar.watch(sourceConfigPath, {
      ignoreInitial: true, // Don't fire events for initial add
    })

    const handleFileChange = async () => {
      await this.writePagesJSON()
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

  async writePagesJSON() {
    try {
      const jsonc = await parse(PAGES_CONFIG_FILE, {
        cwd: this.root,
      })

      await fs.promises.writeFile(this.options.outputJsonPath, jsonc, { encoding: 'utf-8' })
      console.log(`[unplugin-uni-pages] ${this.options.outputJsonPath} has been updated.`)
    }
    catch {
      // ignore
    }
  }

  async resolveVirtualModule() {
    const pagesStr = await fs.promises.readFile(this.options.outputJsonPath, { encoding: 'utf-8' })
    let routes: string = '[]'
    let subRoutes: string = '[]'
    try {
      const pages: Record<string, any> = jsoncParse(pagesStr)
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
