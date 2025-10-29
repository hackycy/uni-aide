import type { Options, ResolvedOptions } from '../types'
import path from 'node:path'
import { PAGES_JSON_FILE } from './constants'

export const defaultOptions: Required<Options> = {
  outDir: 'src',
}

export function resolveOptions(rawOptions: Options, root: string): ResolvedOptions {
  const resolved = Object.assign({}, defaultOptions, rawOptions) as ResolvedOptions

  // 解析 outputJsonPath
  if (path.isAbsolute(resolved.outDir)) {
    resolved.outputJsonPath = resolved.outDir
  }
  else {
    resolved.outputJsonPath = path.join(
      root,
      typeof resolved.outDir === 'string' ? resolved.outDir : 'src',
      PAGES_JSON_FILE,
    )
  }

  return resolved
}
