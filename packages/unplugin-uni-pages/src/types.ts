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
