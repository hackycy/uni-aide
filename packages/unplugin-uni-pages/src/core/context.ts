import type { FSWatcher } from 'chokidar'
import type { Options, ResolvedOptions } from '../types'
import fs from 'node:fs'
import process from 'node:process'
import { findConfigFile, jsoncParse, parse } from '@uni-aide/core'
import chokidar from 'chokidar'
import { PAGES_CONFIG_FILE } from './constants'
import { resolveOptions } from './options'

interface ScanPageAttribute {
  lang?: 'jsonc' | 'json' | 'json5'
  type?: 'page' | 'subPackage' | 'tabBar'
  // home path
  entry?: boolean
  // subPackage root path
  root?: string
  content?: Record<string, any>
}

export class Context {
  options: ResolvedOptions
  root: string = process.cwd()

  // scan pages
  scanPages: Map<string, ScanPageAttribute> = new Map()
  scanSubPackages: Map<string, ScanPageAttribute> = new Map()
  scanTabBar: Map<string, ScanPageAttribute> = new Map()

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
    const sourceConfigPath = findConfigFile(this.options.configSource, PAGES_CONFIG_FILE)
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
        cwd: this.options.configSource,
      })

      await fs.promises.writeFile(this.options.outputJsonPath, jsonc, { encoding: 'utf-8' })
      console.log(`[unplugin-uni-pages] ${this.options.outputJsonPath} generated.`)
    }
    catch (error) {
      console.log(`[unplugin-uni-pages] ${this.options.outputJsonPath} generation failed.`)
      console.error(error instanceof Error ? error.message : `${error}`)
    }
  }

  async resolveVirtualModule() {
    const pagesStr = await fs.promises.readFile(this.options.outputJsonPath, { encoding: 'utf-8' })
    let routes: string = '[]'
    let subRoutes: string = '[]'
    try {
      const pages = jsoncParse(pagesStr) as Record<string, any>
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
