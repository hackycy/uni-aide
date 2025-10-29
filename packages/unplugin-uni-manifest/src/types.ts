export interface Options {
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
  outputJsonPath: string
}
