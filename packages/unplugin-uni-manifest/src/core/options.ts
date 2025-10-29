import type { Options, ResolvedOptions } from '../types'
import path from 'node:path'
import { MANIFEST_JSON_FILE } from './constants'

export const defaultOptions: Required<Omit<Options, 'configSource'>> = {
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
      MANIFEST_JSON_FILE,
    )
  }

  // 解析 configSource
  if (rawOptions.configSource) {
    resolved.configSource = path.isAbsolute(rawOptions.configSource)
      ? rawOptions.configSource
      : path.join(root, rawOptions.configSource)
  }
  else {
    resolved.configSource = root
  }

  return resolved
}
