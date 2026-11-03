import type { CommentEntry, Diagnostic, Placement } from '@uni-aide/core'
import type { FSWatcher } from 'chokidar'
import type { PagesConfig, SubPackage } from '..'
import type { Options, ResolvedOptions, ScanPageRouteBlock } from '../types'
import type { LoadScanEntriesOptions, ScanScope } from './scan'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  atomicWriteFile,
  compareStrings,
  compareStringWithFile,
  ConfigError,
  emitJSONC,
  findConfigFile,
  jsoncParse,
  jsoncStringify,
  parseConfig,
  validateRegions,
  walkCommentEntries,
} from '@uni-aide/core'
import chokidar from 'chokidar'
import lockfile from 'proper-lockfile'
import { DEFAULT_SEQ, PAGES_CONFIG_FILE } from './constants'
import {
  createInjectionTracker,
  markInjectedKey,
  mergeScanContent,
  pushInjectedElement,
} from './merge'
import { resolveOptions } from './options'
import {
  collectScanFiles,
  createScanScope,
  filterExactCase,
  loadScanEntries,
  normalizeFileKey,
} from './scan'
import { ScanIndex } from './scan-index'
import { forbiddenOverwritePagePath, slash } from './utils'

const REGENERATE_DEBOUNCE_MS = 30

export class Context {
  options: ResolvedOptions
  root: string = process.cwd()

  private index = new ScanIndex()
  private scope: ScanScope
  private watcher: FSWatcher | null = null
  private watchTargets: string[] = []
  private configPath: string | null = null
  private dirty = new Set<string>()
  private removedDirs = new Set<string>()
  private fullScanRequested = true
  private generateRequested = false
  private drainPromise: Promise<void> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readyResolve: (() => void) | null = null
  private closed = false

  constructor(private rawOptions: Options) {
    this.options = resolveOptions(this.rawOptions, this.root)
    this.configPath = this.findConfigPath()
    this.scope = createScanScope(
      this.options.scanDir,
      this.options.exclude,
      this.configPath,
    )
  }

  get scanPagesMap(): ReadonlyMap<string, ScanPageRouteBlock> {
    return this.index.pages
  }

  get scanSubPackagesMap(): ReadonlyMap<string, ScanPageRouteBlock> {
    return this.index.subPackages
  }

  get scanTabBarMap(): ReadonlyMap<string, ScanPageRouteBlock> {
    return this.index.tabBar
  }

  async setRoot(root: string) {
    if (this.root === root) {
      return
    }

    const hadWatcher = Boolean(this.watcher)
    await this.stopWatcher()
    if (this.drainPromise) {
      await this.drainPromise
    }

    this.root = root
    this.options = resolveOptions(this.rawOptions, this.root)
    this.resetScanState()

    if (hadWatcher) {
      await this.setupWatcher()
    }
  }

  async setupWatcher() {
    if (this.closed) {
      return
    }

    this.configPath = this.findConfigPath()
    this.scope = createScanScope(
      this.options.scanDir,
      this.options.exclude,
      this.configPath,
    )

    if (!this.configPath) {
      await this.stopWatcher()
      return
    }

    const watchTargets = this.createWatchTargets(this.configPath)
    if (this.watcher && this.hasSameWatchTargets(watchTargets)) {
      return
    }

    await this.stopWatcher()

    const watcher = chokidar.watch(watchTargets, {
      ignoreInitial: true, // Don't fire events for initial add
      ignored: (filePath, stats) => this.scope.isIgnored(filePath, stats),
    })
    this.watcher = watcher
    this.watchTargets = watchTargets

    watcher.on('add', filePath => this.notifyFileEvent(filePath))
    watcher.on('change', filePath => this.notifyFileEvent(filePath))
    watcher.on('unlink', filePath => this.notifyFileEvent(filePath))
    watcher.on('unlinkDir', dirPath => this.notifyDirectoryRemoved(dirPath))
    watcher.on('error', (error) => {
      console.error('[unplugin-uni-pages] watcher error.')
      console.error(error instanceof Error ? error.message : `${error}`)
      this.fullScanRequested = true
      this.scheduleFlush()
    })

    await new Promise<void>((resolve) => {
      this.readyResolve = resolve
      watcher.once('ready', () => {
        this.readyResolve = null
        resolve()
      })
      watcher.once('error', () => {
        this.readyResolve = null
        resolve()
      })
    })
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
  notifyFileEvent(filePath: string) {
    if (this.closed) {
      return
    }

    const key = normalizeFileKey(filePath)
    if (this.configPath && key === this.configPath) {
      this.generateRequested = true
      this.scheduleFlush()
      return
    }

    if (!this.index.has(key) && !this.scope.isCandidate(key)) {
      return
    }

    this.dirty.add(key)
    this.scheduleFlush()
  }

  /** @internal */
  notifyDirectoryRemoved(dirPath: string) {
    if (this.closed) {
      return
    }

    this.removedDirs.add(normalizeFileKey(dirPath))
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
      else if (this.hasPending()) {
        await this.requestDrain()
      }
      else {
        break
      }
    }
  }

  async writePagesJSON() {
    this.fullScanRequested = true
    await this.flush()
  }

  private findConfigPath(): string | null {
    const configPath = findConfigFile(this.options.configSource, PAGES_CONFIG_FILE)
    return configPath ? normalizeFileKey(configPath) : null
  }

  private resetScanState() {
    this.configPath = this.findConfigPath()
    this.scope = createScanScope(
      this.options.scanDir,
      this.options.exclude,
      this.configPath,
    )
    this.index.clear()
    this.dirty.clear()
    this.removedDirs.clear()
    this.fullScanRequested = true
    this.generateRequested = false
  }

  private createWatchTargets(sourceConfigPath: string): string[] {
    const targets = new Set<string>()
    targets.add(sourceConfigPath)

    this.options.scanDir.forEach((dir) => {
      targets.add(slash(dir))
    })

    return Array.from(targets).sort()
  }

  private hasSameWatchTargets(nextTargets: string[]): boolean {
    if (this.watchTargets.length !== nextTargets.length) {
      return false
    }

    return this.watchTargets.every(
      (target, index) => target === nextTargets[index],
    )
  }

  private async stopWatcher() {
    this.readyResolve?.()
    this.readyResolve = null

    if (!this.watcher) {
      this.watchTargets = []
      return
    }

    const currentWatcher = this.watcher
    this.watcher = null
    this.watchTargets = []

    try {
      await currentWatcher.close()
    }
    catch (error) {
      console.error('[unplugin-uni-pages] failed to close watcher.')
      console.error(error instanceof Error ? error.message : `${error}`)
    }
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

  private hasPending(): boolean {
    return this.fullScanRequested
      || this.generateRequested
      || this.dirty.size > 0
      || this.removedDirs.size > 0
  }

  private requestDrain(): Promise<void> {
    if (this.drainPromise) {
      return this.drainPromise
    }

    const promise = this.drainLoop()
      .catch((error) => {
        console.error('[unplugin-uni-pages] generation failed.')
        console.error(error instanceof Error ? error.message : `${error}`)
      })
      .finally(() => {
        this.drainPromise = null
        if (!this.closed && this.hasPending()) {
          this.scheduleFlush()
        }
      })

    this.drainPromise = promise
    return promise
  }

  private async drainLoop(): Promise<void> {
    while (!this.closed) {
      const full = this.fullScanRequested
      const generate = this.generateRequested
      const dirty = this.dirty
      const removedDirs = this.removedDirs
      this.fullScanRequested = false
      this.generateRequested = false
      this.dirty = new Set()
      this.removedDirs = new Set()

      if (!full && !generate && dirty.size === 0 && removedDirs.size === 0) {
        return
      }

      let relevant = full || generate

      for (const dir of removedDirs) {
        if (this.index.deleteUnder(dir)) {
          relevant = true
        }
      }

      try {
        if (full) {
          await this.fullScan()
        }
        else if (dirty.size > 0) {
          relevant = (await this.reconcile(dirty)) || relevant
        }

        if (relevant) {
          await this.generatePagesJSON()
        }
      }
      catch (error) {
        console.error('[unplugin-uni-pages] scan failed.')
        console.error(error instanceof Error ? error.message : `${error}`)
        return
      }
    }
  }

  private async fullScan(): Promise<void> {
    const files = await collectScanFiles(this.options)
    const entries = await loadScanEntries(files, this.scanLoadOptions())
    this.index.replaceAll(entries.values())
  }

  private async reconcile(paths: Set<string>): Promise<boolean> {
    const files = [...paths]
    const existing = new Set(
      await filterExactCase(files, this.options.scanDir),
    )
    const candidates = files.filter(
      file => existing.has(file) && this.scope.isCandidate(file),
    )
    const entries = await loadScanEntries(candidates, this.scanLoadOptions())
    let relevant = false

    for (const file of files) {
      const previous = this.index.get(file)
      const next = existing.has(file) ? entries.get(file) : undefined

      if (previous && previous.blocks.length > 0) {
        relevant = true
      }

      if (!next) {
        this.index.delete(file)
        continue
      }

      if (next.blocks.length > 0) {
        relevant = true
      }
      this.index.set(next)
    }

    return relevant
  }

  private scanLoadOptions(): LoadScanEntriesOptions {
    return {
      inputDir: this.options.inputDir,
      filter: this.options.onScanPageFilter,
      onError: (file, error) => {
        console.error(
          `[unplugin-uni-pages] ${error instanceof Error ? error.message : `${error}`} (${file})`,
        )
      },
      onInvalidPart: (file, part) => {
        console.warn(
          `[unplugin-uni-pages] warning: invalid part "${part}" in route block of file ${file}. Expected "page", "subPackage", or "tabBar".`,
        )
      },
    }
  }

  private async generatePagesJSON(): Promise<void> {
    try {
      const configPath = findConfigFile(
        this.options.configSource,
        PAGES_CONFIG_FILE,
      ) ?? this.options.configSource
      const parsed = await parseConfig(PAGES_CONFIG_FILE, {
        cwd: this.options.configSource,
      })
      this.reportDiagnostics(parsed.diagnostics)
      this.assertNoErrors(parsed.diagnostics)

      // 合并扫描结果（值树 + 以对象引用为键的注释索引）
      const pageMeta = parsed.value as PagesConfig
      const { comments, orderHints } = parsed
      const tracker = createInjectionTracker(comments)
      if (!pageMeta.pages) {
        pageMeta.pages = []
        markInjectedKey(tracker, pageMeta, 'pages')
      }

      // 记录最原始的页面路径排序
      const originalPathSeqMap = new Map<string, number>()
      pageMeta.pages.forEach((page, index) => {
        originalPathSeqMap.set(page.path, index)
      })
      pageMeta.subPackages?.forEach((subPackage) => {
        subPackage.pages?.forEach((subPage, index) => {
          const fullPath = `${subPackage.root}/${subPage.path}`
          originalPathSeqMap.set(fullPath, index)
        })
      })
      // tabbar list 排序优先需要覆盖pages上的排序
      pageMeta.tabBar?.list?.forEach((tabBarItem, index) => {
        originalPathSeqMap.set(tabBarItem.pagePath, index)
      })

      if (this.scanPagesMap.size > 0) {
        const mergedPages = new Set<string>()
        // 合并同样路径的页面配置；配置文件已有的 key 优先
        pageMeta.pages.forEach((page) => {
          const route = this.scanPagesMap.get(page.path)
          if (route) {
            mergeScanContent(tracker, page, route.content, route.file)
            mergedPages.add(page.path)
          }
        })

        // 添加剩余未处理的扫描页面
        for (const [routePath, route] of this.scanPagesMap) {
          if (mergedPages.has(routePath)) {
            continue
          }

          const page = forbiddenOverwritePagePath({}, 'path', routePath)
          mergeScanContent(tracker, page, route.content, route.file)
          pushInjectedElement(tracker, pageMeta.pages, page)
          mergedPages.add(routePath)
        }
      }

      if (this.scanTabBarMap.size > 0) {
        // prevent tabBar or tabBar.list is undefined
        if (!pageMeta.tabBar) {
          pageMeta.tabBar = {}
          markInjectedKey(tracker, pageMeta, 'tabBar')
        }
        if (!pageMeta.tabBar.list) {
          pageMeta.tabBar.list = []
          markInjectedKey(tracker, pageMeta.tabBar, 'list')
        }

        const mergedTabBarPages = new Set<string>()
        // 合并同样路径的 tabBar 配置；配置文件已有的 key 优先
        pageMeta.tabBar.list!.forEach((tabBarItem) => {
          const route = this.scanTabBarMap.get(tabBarItem.pagePath)
          if (route) {
            mergeScanContent(tracker, tabBarItem, route.content, route.file)
            mergedTabBarPages.add(tabBarItem.pagePath)
          }
        })

        for (const [routePath, route] of this.scanTabBarMap) {
          if (mergedTabBarPages.has(routePath)) {
            continue
          }

          const tabBarItem = forbiddenOverwritePagePath({}, 'pagePath', routePath)
          mergeScanContent(tracker, tabBarItem, route.content, route.file)
          pushInjectedElement(tracker, pageMeta.tabBar.list!, tabBarItem)
          mergedTabBarPages.add(routePath)
        }

        // 处理排序 先根据路径字符串排序，再根据 seq 排序
        pageMeta.tabBar
          .list!.sort((a, b) => {
          return compareStrings(a.pagePath, b.pagePath)
        }).sort((a, b) => {
          const routeA = this.scanTabBarMap.get(a.pagePath)
          const routeB = this.scanTabBarMap.get(b.pagePath)
          const seqA
            = routeA?.seq ?? originalPathSeqMap.get(a.pagePath) ?? DEFAULT_SEQ
          const seqB
            = routeB?.seq ?? originalPathSeqMap.get(b.pagePath) ?? DEFAULT_SEQ
          return seqA - seqB
        })
      }

      // 处理分包页面扫描
      if (this.scanSubPackagesMap.size > 0) {
        // prevent subPackages is undefined
        if (!pageMeta.subPackages) {
          pageMeta.subPackages = []
          markInjectedKey(tracker, pageMeta, 'subPackages')
        }

        // 所有分包页面路径
        const allSubPackagesPath = new Set<string>()
        // 配置文件中已分配的分包路径，该路径优先，避免自动分配冲突
        const defineSubPackageRoots = new Set<string>()
        pageMeta.subPackages.forEach((subPackage) => {
          if (subPackage.root) {
            defineSubPackageRoots.add(subPackage.root)

            // 记录已存在的分包页面路径
            if (subPackage.pages && subPackage.pages.length > 0) {
              subPackage.pages.forEach((subPage) => {
                allSubPackagesPath.add(`${subPackage.root}/${subPage.path}`)
              })
            }
          }
        })
        for (const routePath of this.scanSubPackagesMap.keys()) {
          allSubPackagesPath.add(routePath)
        }

        // 排序路径数组：以便按顺序比较路径。
        // LCP函数：计算两个路径字符串的最长共同目录前缀（始终以 '/' 结尾）。
        // 分组路径：迭代排序后的路径，根据LCP将路径分组到不同的根下。
        // 处理每组：对于每个组，根路径是LCP去掉尾部斜杠，页面是路径去掉LCP后的部分。
        // 处理边界情况：如路径无斜杠或空数组。

        // ['pages/subpackage/comment', 'pages/subpackage/list/list', 'pages/subpackage/goods', 'pages/sub2/list']
        // 转换为
        // {
        //   'pages/sub2': ['list'],
        //   'pages/subpackage': ['comment', 'goods', 'list/list']
        // }
        const sortedPaths = Array.from(allSubPackagesPath).sort()
        const definedRoots = Array.from(defineSubPackageRoots)

        // 预计算：哪些一级目录下存在直接文件（用于 O(1) 判断目录是否为有效分包根）
        const dirHasDirectFile = new Set<string>()
        for (const p of allSubPackagesPath) {
          const parts = p.split('/')
          if (parts.length === 2) {
            dirHasDirectFile.add(parts[0])
          }
        }

        // LCP函数：返回两个字符串的最长共同目录前缀（以'/'结尾）
        function lcpPath(str1: string, str2: string) {
          let i = 0
          while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
            i++
          }
          const common = str1.substring(0, i)
          const lastSlash = common.lastIndexOf('/')
          if (lastSlash === -1) {
            return '' // 无共同目录
          }
          else {
            return common.substring(0, lastSlash + 1) // 返回至最后一个斜杠（包含）
          }
        }

        const parsedSubPackagesMap = new Map<string, string[]>()

        const dirPrefix = (p: string) =>
          p.includes('/') ? p.substring(0, p.lastIndexOf('/') + 1) : ''

        const shouldSplitByLCP = (nextLCP: string, currentLCP: string, fullPath: string) => {
          // nextLCP 为空：说明没有共同目录，需要拆组
          if (!nextLCP) {
            return true
          }

          // 如果当前组在一个已定义的分包根下，检查新路径是否还在同一根下
          // 若不在 → 拆组，若在 → 继续归为一组
          const containingRoot = definedRoots.find(
            root => currentLCP.startsWith(`${root}/`),
          )
          if (containingRoot) {
            return !fullPath.startsWith(`${containingRoot}/`)
          }

          // 如果 LCP 变成了只有一级的目录（如 'pages/'）
          // 只要这个一级目录下未存在直接文件，那么则视为非最短的分包根，继续归为一组
          // 即 pages/ 下还有其他文件，则说明 pages/ 是一个有效的分包根，需拆组
          // 如果 pages/ 下没有其他文件，则说明 pages/ 不是一个有效的分包根，继续归为一组
          // 例如 pages/a 和 pages/b/a 的 LCP 是 pages/ （a为文件）
          const isTopLevel = nextLCP.split('/').length === 2
          if (isTopLevel) {
            const potentialRoot = nextLCP.slice(0, -1) // 去掉末尾斜杠
            // 当前目录下没有直接文件，则不该使用该目录作为分包根
            if (!dirHasDirectFile.has(potentialRoot)) {
              return true
            }
          }

          return false
        }

        const finalizeGroup = (group: string[], groupLCP: string) => {
          let lcp = groupLCP
          if (!lcp) {
            lcp = dirPrefix(group[0])
          }

          const root = lcp.endsWith('/') ? lcp.slice(0, -1) : lcp
          if (!root) {
            return
          }

          if (!parsedSubPackagesMap.has(root)) {
            parsedSubPackagesMap.set(root, [])
          }

          for (const p of group) {
            const page = p.substring(lcp.length)
            parsedSubPackagesMap.get(root)!.push(page)
          }
        }

        let currentGroup: string[] = [sortedPaths[0]]
        // 当前组的 LCP（以 '/' 结尾）。
        let currentLCP: string = dirPrefix(sortedPaths[0])

        for (let i = 1; i < sortedPaths.length; i++) {
          const fullPath = sortedPaths[i]
          const nextLCP = lcpPath(currentLCP, fullPath)

          if (shouldSplitByLCP(nextLCP, currentLCP, fullPath)) {
            finalizeGroup(currentGroup, currentLCP)
            currentGroup = [fullPath]
            currentLCP = dirPrefix(fullPath)
            continue
          }

          // 同组：允许 currentLCP 变短（例如：pages/onecard/order/list + pages/onecard/search => pages/onecard/）
          currentGroup.push(fullPath)
          currentLCP = nextLCP
        }

        finalizeGroup(currentGroup, currentLCP)

        // 最终合并配置
        for (const [root, paths] of parsedSubPackagesMap.entries()) {
          for (const path of paths) {
            const fullPath = `${root}/${path}`
            if (!this.scanSubPackagesMap.has(fullPath)) {
              // 非扫描忽略
              continue
            }

            const route = this.scanSubPackagesMap.get(fullPath)!

            // 是否存在在配置中，有则需要合并
            const rootIdx = pageMeta.subPackages!.findIndex(
              packages => packages.root === root,
            )
            const pageIdx
              = rootIdx === -1
                ? -1
                : pageMeta.subPackages![rootIdx].pages?.findIndex(
                    p => p.path === path,
                  )

            if (rootIdx !== -1 && pageIdx !== -1) {
              mergeScanContent(
                tracker,
                pageMeta.subPackages![rootIdx].pages![pageIdx],
                route.content,
                route.file,
              )
              continue
            }

            // 不存在于原有配置，则新增
            let subPackageItem: SubPackage
            if (rootIdx === -1) {
              subPackageItem = {
                root,
                pages: [],
              }
              pushInjectedElement(tracker, pageMeta.subPackages!, subPackageItem)
            }
            else {
              subPackageItem = pageMeta.subPackages![rootIdx]
            }

            if (!subPackageItem.pages) {
              subPackageItem.pages = []
              markInjectedKey(tracker, subPackageItem, 'pages')
            }

            const subPage = forbiddenOverwritePagePath({}, 'path', path)
            mergeScanContent(tracker, subPage, route.content, route.file)
            pushInjectedElement(tracker, subPackageItem.pages, subPage)
          }
        }
      }

      // 处理分包内页面排序
      pageMeta.subPackages?.forEach((subPackage) => {
        if (!subPackage.pages) {
          return
        }

        subPackage.pages
          .sort((a, b) => {
            return compareStrings(a.path, b.path)
          })
          .sort((a, b) => {
            const fullPathA = `${subPackage.root}/${a.path}`
            const fullPathB = `${subPackage.root}/${b.path}`
            const routeA = this.scanSubPackagesMap.get(fullPathA)
            const routeB = this.scanSubPackagesMap.get(fullPathB)
            const seqA
              = routeA?.seq ?? originalPathSeqMap.get(fullPathA) ?? DEFAULT_SEQ
            const seqB
              = routeB?.seq ?? originalPathSeqMap.get(fullPathB) ?? DEFAULT_SEQ
            return seqA - seqB
          })
      })

      // 处理pages排序 先根据路径字符串排序，再根据 seq 排序，如果包含在tabBar中则优先级取决于tabBar的seq
      pageMeta.pages
        // 先根据路径字符串排序，确保相同路径时排序稳定
        .sort((a, b) => {
          return compareStrings(a.path, b.path)
        })
        // tabBar 路径优先排序
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
            const seqA
              = routeA?.seq ?? originalPathSeqMap.get(a.path) ?? DEFAULT_SEQ
            const seqB
              = routeB?.seq ?? originalPathSeqMap.get(b.path) ?? DEFAULT_SEQ
            return seqA - seqB
          }
        })

      // detect page path conflicts between main package and subPackages
      const mainPagePaths = new Set<string>()
      pageMeta.pages?.forEach(p => mainPagePaths.add(p.path))

      const subPageRoots = new Map<string, string>() // fullPath -> root
      const subPackageRoots = new Set<string>()
      pageMeta.subPackages?.forEach((sub) => {
        subPackageRoots.add(sub.root)
        sub.pages?.forEach((p) => {
          subPageRoots.set(`${sub.root}/${p.path}`, sub.root)
        })
      })

      const conflicts = new Set<string>()
      for (const pagePath of mainPagePaths) {
        const subRoot = subPageRoots.get(pagePath)
        if (subRoot) {
          conflicts.add(`"${pagePath}" conflicts with subPackage "${subRoot}"`)
        }
        else {
          for (const root of subPackageRoots) {
            if (pagePath.startsWith(`${root}/`)) {
              conflicts.add(`"${pagePath}" conflicts with subPackage root "${root}/"`)
              break
            }
          }
        }
      }

      if (conflicts.size > 0) {
        conflicts.forEach(c => console.warn(`[unplugin-uni-pages] page path conflict detected: ${c}`))
      }

      // 排序/注入后按输出 DFS 顺序重新校验 region
      const emitOptions = {
        injectedElements: tracker.injectedElements,
        injectedKeys: tracker.injectedKeys,
      }
      const outputOrder = walkCommentEntries(
        pageMeta,
        comments,
        orderHints,
        emitOptions,
      )
      // 注入子节点不参与配置侧的 region 配对
      const configOrder = outputOrder.filter(
        entry => !tracker.scanFiles.has(entry.source.file),
      )
      const placements: Placement[] = configOrder.map(
        (comment: CommentEntry, sourceIndex) => ({
          path: [],
          slot: 'before',
          comment,
          sourceIndex,
        }),
      )
      this.assertNoErrors(validateRegions(placements, configOrder, configPath))

      const jsonStr = emitJSONC(pageMeta, comments, orderHints, emitOptions)
      await this.writeOutput(jsonStr)
    }
    catch (error) {
      console.log(
        `[unplugin-uni-pages] ${this.options.outputJsonPath} generation failed.`,
      )
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
      console.warn('[unplugin-uni-pages] failed to write pages.json.')
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
        `[unplugin-uni-pages] ${diagnostic.code}: ${diagnostic.message}${location}`,
      )
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
}
