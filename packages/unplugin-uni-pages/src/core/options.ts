import type { Options, ResolvedOptions } from '../types'
import path from 'node:path'
import process from 'node:process'
import { PAGES_JSON_FILE } from './constants'

export const defaultOptions: Required<Omit<Options, 'configSource' | 'inputDir'>> = {
  outDir: 'src',
  exclude: [],
  scanDir: [],
}

export function resolveOptions(
  rawOptions: Options,
  root: string,
): ResolvedOptions {
  const resolved = Object.assign(
    {},
    defaultOptions,
    rawOptions,
  ) as ResolvedOptions

  // 解析 outputJsonPath
  if (resolved.outDir && path.isAbsolute(resolved.outDir)) {
    resolved.outputJsonPath = path.join(resolved.outDir, PAGES_JSON_FILE)
  }
  else {
    resolved.outputJsonPath = path.join(
      root,
      typeof resolved.outDir === 'string' ? resolved.outDir : 'src',
      PAGES_JSON_FILE,
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

  // 解析 scanDir
  if (rawOptions.scanDir && rawOptions.scanDir.length > 0) {
    resolved.scanDir = rawOptions.scanDir
      .map((dir) => {
        if (path.isAbsolute(dir)) {
          return dir
        }
        return path.join(root, dir)
      })
  }

  // 解析 inputDir
  resolved.inputDir = process.env.UNI_INPUT_DIR || path.join(root, 'src')

  return resolved
}
