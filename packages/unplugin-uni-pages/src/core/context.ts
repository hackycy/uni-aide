import type { FSWatcher } from 'chokidar'
import type { Options, ResolvedOptions, ScanPageRouteBlock } from '../types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { findConfigFile, jsoncParse, jsoncStringify, parse } from '@uni-aide/core'
import chokidar from 'chokidar'
import { globSync } from 'tinyglobby'
import { FILE_EXTENSIONS, PAGES_CONFIG_FILE } from './constants'
import { resolveOptions } from './options'
import { extsToGlob, getRouteSfcBlock, parseCustomBlock, parseSFC, slash } from './utils'

export class Context {
  options: ResolvedOptions
  root: string = process.cwd()

  // scan pages
  scanPages: Map<string, ScanPageRouteBlock> = new Map()
  scanSubPackages: Map<string, ScanPageRouteBlock> = new Map()
  scanTabBar: Map<string, ScanPageRouteBlock> = new Map()

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

      await this.scan()

      await fs.promises.writeFile(this.options.outputJsonPath, jsoncStringify(jsoncParse(jsonc), null, 2), { encoding: 'utf-8' })
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
      routes = jsoncStringify(pages.pages || [], null, 2)
      subRoutes = jsoncStringify(pages.subPackages || [], null, 2)
    }
    catch {
      // ignore
    }

    const pages = `export const pages = ${routes};`
    const subPackages = `export const subPackages = ${subRoutes};`
    return [pages, subPackages].join('\n')
  }

  async scan() {
    // reset
    this.scanPages.clear()
    this.scanSubPackages.clear()
    this.scanTabBar.clear()

    if (!this.options.scanDir || this.options.scanDir.length === 0) {
      return
    }

    const scanFiles: string[] = []
    const ext = `**/*.${extsToGlob(FILE_EXTENSIONS)}`
    this.options.scanDir.forEach((dir) => {
      const files = globSync(ext, {
        cwd: dir,
        ignore: this.options.exclude,
        absolute: true,
        onlyFiles: true,
      })
      scanFiles.push(...files)
    })

    try {
      for (const file of scanFiles) {
        const code = await fs.promises.readFile(file, { encoding: 'utf-8' })
        const sfc = parseSFC(code, { filename: file })
        const routeBlock = getRouteSfcBlock(sfc)
        if (routeBlock) {
          parseCustomBlock(routeBlock)
        }
      }
    }
    catch (error) {
      console.error(error)
    }

    const paths = scanFiles.map(file => slash(path.relative(process.env.UNI_INPUT_DIR!, file)))
    console.log('[unplugin-uni-pages] Scanning pages in directories:', scanFiles)
    console.log('[unplugin-uni-pages] Resolved paths:', paths)
  }
}
