export interface Options {
  /**
   * 扫描页面的目录，设置空则不扫描
   *
   * @example ['src/pages', 'src/sub-packages']
   * @default []
   */
  scanDir?: string[]

  /**
   * 扫描时排除的目录或文件 (glob patterns)
   */
  exclude?: string[]

  /**
   * 输出 pages.json 目录
   * @default "src"
   */
  outDir?: string

  /**
   * 配置文件路径
   */
  configSource?: string

  /**
   * 是否启用严格模式，严格模式下会对分包路径进行校验
   *
   * @default false
   */
  strict?: boolean

  /**
   * 扫描页面过滤，返回 false 则跳过该页面
   */
  onScanPageFilter?: (pagePath: string, filePath: string) => undefined | void | false | Promise<undefined | void | false>
}

export type ResolvedOptions = Required<Options> & {
  /**
   * 输出 pages.json 完整路径
   */
  outputJsonPath: string

  /**
   * 项目代码目录
   * @default process.env.UNI_INPUT_DIR
   */
  inputDir: string
}

export interface ScanPageRouteBlock {
  lang?: 'jsonc' | 'json' | 'json5'
  part?: 'page' | 'subPackage' | 'tabBar'
  // order (0..n)
  seq?: number
  content?: Record<string, any>
}
