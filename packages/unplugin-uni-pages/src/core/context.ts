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

    const watcher = chokidar.watch(sourceConfigPath)

    const handleFileChange = async () => {
      await this.writePagesJSON()
    }

    watcher.on('change', handleFileChange)
    watcher.on('add', handleFileChange)
    watcher.on('unlink', handleFileChange)
  }

  async writePagesJSON() {
    try {
      const jsonc = await parse(PAGES_CONFIG_FILE, {
        cwd: this.root,
      })

      await fs.promises.writeFile(this.options.outputJsonPath, jsonc, { encoding: 'utf-8' })
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
