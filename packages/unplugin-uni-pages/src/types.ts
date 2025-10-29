export interface Options {
  /**
   * 输出 pages.json 目录
   * @default "src"
   */
  outDir?: string
}

export type ResolvedOptions = Required<Options> & {
  outputJsonPath: string
}
