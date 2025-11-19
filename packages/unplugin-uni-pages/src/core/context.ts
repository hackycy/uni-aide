import type { FSWatcher } from 'chokidar'
import type { PagesConfig } from '..'
import type { Options, ResolvedOptions, ScanPageRouteBlock } from '../types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  findConfigFile,
  jsoncAssign,
  jsoncParse,
  jsoncStringify,
  parse,
} from '@uni-aide/core'
import chokidar from 'chokidar'
import { globSync } from 'tinyglobby'
import { DEFAULT_SEQ, FILE_EXTENSIONS, PAGES_CONFIG_FILE } from './constants'
import { resolveOptions } from './options'
import {
  extsToGlob,
  forbiddenOverwritePagePath,
  getRouteSfcBlock,
  parseCustomBlock,
  parseSFC,
  slash,
} from './utils'

export class Context {
  options: ResolvedOptions
  root: string = process.cwd()

  // scan pages
  scanPagesMap: Map<string, ScanPageRouteBlock & { handled?: boolean }>
    = new Map()

  scanSubPackagesMap: Map<string, ScanPageRouteBlock & { handled?: boolean }>
    = new Map()

  scanTabBarMap: Map<string, ScanPageRouteBlock & { handled?: boolean }>
    = new Map()

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
    const sourceConfigPath = findConfigFile(
      this.options.configSource,
      PAGES_CONFIG_FILE,
    )
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

      // 扫描页面
      await this.scan()

      // 合并扫描结果
      const pageMeta = jsoncParse(jsonc) as PagesConfig
      if (!pageMeta.pages) {
        pageMeta.pages = []
      }

      if (this.scanPagesMap.size > 0) {
        // 合并同样路径的页面配置，配置文件优先级高会覆盖扫描到的配置
        pageMeta.pages.forEach((page) => {
          const route = this.scanPagesMap.get(page.path)
          if (route) {
            jsoncAssign(page, route.content)
            this.markAsHandledPage(page.path, route)
          }
        })

        // 添加剩余未处理的扫描页面
        for (const [routePath, route] of this.scanPagesMap) {
          if (route.handled) {
            continue
          }

          pageMeta.pages.push(
            jsoncAssign(
              forbiddenOverwritePagePath({}, 'path', routePath),
              route.content,
            ) as any,
          )
          this.markAsHandledPage(routePath, route)
        }
      }

      if (this.scanTabBarMap.size > 0) {
        if (!pageMeta.tabBar) {
          pageMeta.tabBar = {}

          if (!pageMeta.tabBar.list) {
            pageMeta.tabBar.list = []
          }
        }

        // 合并同样路径的 tabBar 配置，配置文件优先级高会覆盖扫描到的配置
        pageMeta.tabBar.list!.forEach((tabBarItem) => {
          const route = this.scanTabBarMap.get(tabBarItem.pagePath)
          if (route) {
            jsoncAssign(
              forbiddenOverwritePagePath(
                tabBarItem,
                'pagePath',
                tabBarItem.pagePath,
              ),
              route.content,
            )
            this.markAsHandledPage(tabBarItem.pagePath, route)
          }
        })

        for (const [routePath, route] of this.scanTabBarMap) {
          if (route.handled) {
            continue
          }

          pageMeta.tabBar.list!.push(
            jsoncAssign(
              forbiddenOverwritePagePath({}, 'pagePath', routePath),
              route.content,
            ) as any,
          )
          this.markAsHandledPage(routePath, route)
        }

        // 处理排序 先根据路径字符串排序，再根据 seq 排序
        pageMeta.tabBar
          .list!.sort((a, b) => {
          const pageA = a.pagePath
          const pageB = b.pagePath
          return pageA.localeCompare(pageB)
        }).sort((a, b) => {
          const routeA = this.scanTabBarMap.get(a.pagePath)
          const routeB = this.scanTabBarMap.get(b.pagePath)
          const seqA = routeA?.seq ?? DEFAULT_SEQ
          const seqB = routeB?.seq ?? DEFAULT_SEQ
          return seqA - seqB
        })
      }

      // 处理pages排序 先根据路径字符串排序，再根据 seq 排序，如果包含在tabBar中则优先级取决于tabBar的seq
      pageMeta.pages
        .sort((a, b) => {
          const pageA = a.path
          const pageB = b.path
          return pageA.localeCompare(pageB)
        })
        .sort((a, b) => {
          const tabBarA = pageMeta.tabBar?.list?.find(
            item => item.pagePath === a.path,
          )
          const tabBarB = pageMeta.tabBar?.list?.find(
            item => item.pagePath === b.path,
          )
          if (tabBarA && tabBarB) {
            // 如果都在 tabBar 中，则根据 tabBar 的顺序排序
            return (
              pageMeta.tabBar!.list!.indexOf(tabBarA)
              - pageMeta.tabBar!.list!.indexOf(tabBarB)
            )
          }
          else if (tabBarA) {
            // 如果只有 A 在 tabBar 中，则 A 优先
            return -1
          }
          else if (tabBarB) {
            // 如果只有 B 在 tabBar 中，则 B 优先
            return 1
          }
          else {
            // 如果都不在 tabBar 中，则根据 seq 排序
            const routeA = this.scanPagesMap.get(a.path)
            const routeB = this.scanPagesMap.get(b.path)
            const seqA = routeA?.seq ?? 1
            const seqB = routeB?.seq ?? 1
            return seqA - seqB
          }
        })

      await fs.promises.writeFile(
        this.options.outputJsonPath,
        jsoncStringify(pageMeta, null, 2),
        { encoding: 'utf-8' },
      )
      console.log(
        `[unplugin-uni-pages] ${this.options.outputJsonPath} generated.`,
      )
    }
    catch (error) {
      console.log(
        `[unplugin-uni-pages] ${this.options.outputJsonPath} generation failed.`,
      )
      console.error(error instanceof Error ? error.message : `${error}`)
    }
  }

  async resolveVirtualModule() {
    const pagesStr = await fs.promises.readFile(this.options.outputJsonPath, {
      encoding: 'utf-8',
    })
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
    this.scanPagesMap.clear()
    this.scanSubPackagesMap.clear()
    this.scanTabBarMap.clear()

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

    for (const file of scanFiles) {
      try {
        const code = await fs.promises.readFile(file, { encoding: 'utf-8' })
        const sfc = parseSFC(code, { filename: file })
        const routeBlocks = getRouteSfcBlock(sfc)?.map(
          b => parseCustomBlock(b, file)!,
        )
        if (!routeBlocks || routeBlocks.length === 0) {
          continue
        }

        // remove file extension and leading slash
        const routePath = slash(
          path.relative(process.env.UNI_INPUT_DIR!, file),
        ).replace(new RegExp(`\\.(${FILE_EXTENSIONS.join('|')})$`), '')

        for (const block of routeBlocks) {
          if (block.part === 'page') {
            this.scanPagesMap.set(routePath, block)
          }
          else if (block.part === 'subPackage') {
            this.scanSubPackagesMap.set(routePath, block)
          }
          else if (block.part === 'tabBar') {
            this.scanTabBarMap.set(routePath, block)
          }
        }
      }
      catch (err: any) {
        console.error(`[unplugin-uni-pages] ${err.message}`)
      }
    }
  }

  /**
   * 标记已处理的页面
   */
  private markAsHandledPage(routePath: string, block: ScanPageRouteBlock) {
    if (block.part === 'page') {
      this.scanPagesMap.get(routePath)!.handled = true
    }
    else if (block.part === 'subPackage') {
      this.scanSubPackagesMap.get(routePath)!.handled = true
    }
    else if (block.part === 'tabBar') {
      this.scanTabBarMap.get(routePath)!.handled = true
    }
  }
}
