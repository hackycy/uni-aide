import type { ScanPageRouteBlock } from '../types'

/**
 * 单个扫描文件的权威记录。
 * `blocks` 为空表示该文件没有 `<route>` 块、被 filter 排除或解析失败。
 */
export interface ScanFileEntry {
  /** 绝对路径，slash 归一化 */
  file: string
  /** 相对 inputDir，去掉扩展名 */
  routePath: string
  /** 源顺序；空数组表示无 route / 被过滤 / 解析失败 */
  blocks: ScanPageRouteBlock[]
}

interface ScanMaps {
  pages: Map<string, ScanPageRouteBlock>
  subPackages: Map<string, ScanPageRouteBlock>
  tabBar: Map<string, ScanPageRouteBlock>
}

/**
 * 以文件为 key 的增量扫描索引。
 *
 * 三张派生表按需从文件记录重建，不维护“文件 -> key”的所有权关系：
 * 替换/删除一个文件后，它的旧 key 自然消失，分类切换、同文件多块、
 * 重叠 scanDir 都不需要特判。
 */
export class ScanIndex {
  private files = new Map<string, ScanFileEntry>()
  private maps: ScanMaps | null = null

  get pages(): ReadonlyMap<string, ScanPageRouteBlock> {
    return this.ensureMaps().pages
  }

  get subPackages(): ReadonlyMap<string, ScanPageRouteBlock> {
    return this.ensureMaps().subPackages
  }

  get tabBar(): ReadonlyMap<string, ScanPageRouteBlock> {
    return this.ensureMaps().tabBar
  }

  has(file: string): boolean {
    return this.files.has(file)
  }

  get(file: string): ScanFileEntry | undefined {
    return this.files.get(file)
  }

  set(entry: ScanFileEntry): void {
    this.files.set(entry.file, entry)
    this.maps = null
  }

  delete(file: string): boolean {
    const deleted = this.files.delete(file)
    if (deleted) {
      this.maps = null
    }
    return deleted
  }

  /**
   * 删除目录下的所有文件记录，返回是否有条目包含 route 块。
   * 前缀比较带 `/`，避免 `pages/a` 误删 `pages/ab`。
   */
  deleteUnder(dir: string): boolean {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`
    let removed = false

    for (const [file, entry] of this.files) {
      if (file !== dir && !file.startsWith(prefix)) {
        continue
      }
      if (entry.blocks.length > 0) {
        removed = true
      }
      this.files.delete(file)
    }

    if (removed) {
      this.maps = null
    }
    return removed
  }

  clear(): void {
    this.files.clear()
    this.maps = null
  }

  replaceAll(entries: Iterable<ScanFileEntry>): void {
    this.files.clear()
    for (const entry of entries) {
      this.files.set(entry.file, entry)
    }
    this.maps = null
  }

  private ensureMaps(): ScanMaps {
    if (!this.maps) {
      const pages = new Map<string, ScanPageRouteBlock>()
      const subPackages = new Map<string, ScanPageRouteBlock>()
      const tabBar = new Map<string, ScanPageRouteBlock>()

      for (const entry of this.files.values()) {
        for (const block of entry.blocks) {
          if (block.part === 'page') {
            pages.set(entry.routePath, block)
          }
          else if (block.part === 'subPackage') {
            subPackages.set(entry.routePath, block)
          }
          else if (block.part === 'tabBar') {
            tabBar.set(entry.routePath, block)
          }
        }
      }

      this.maps = { pages, subPackages, tabBar }
    }
    return this.maps
  }
}
