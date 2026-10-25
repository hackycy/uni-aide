import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'
import { ConfigError } from './errors'

export const AVAILABLE_CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']

/**
 * 查找配置文件
 */
export function findConfigFile(root: string, name: string) {
  const candidates = AVAILABLE_CONFIG_EXTENSIONS.map(ext => `${name}.${ext}`)
  for (const candidate of candidates) {
    const filePath = path.join(root, candidate)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }
  return null
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null
    && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { then?: unknown }).then === 'function'
  )
}

/**
 * 用 jiti 原样求值配置文件：不改写源码、不注入任何内容、不生成临时文件。
 */
export async function evaluateConfig(
  configPath: string,
  exportKind: 'esm-default' | 'cjs-default' | 'cjs-module' | 'none',
): Promise<{ value: unknown }> {
  const absolutePath = path.resolve(configPath)
  const jiti = createJiti(absolutePath, {
    fsCache: false,
    moduleCache: false,
    // ticket 08 指定 interopDefault: true，但 jiti 2.6.1 在 `export default null`
    // 时会抛 "Reflect.get called on non-object"，使 config-not-object 不可观察。
    // 这里关闭 interop 并按下方的 AST 导出形态手动解包默认导出，行为等价。
    interopDefault: false,
  })

  try {
    const namespace = await jiti.import(absolutePath)
    // `{ default: true }` 会对 Promise 导出自动 await，导致 async-config-unsupported
    // 无法观察；这里按 AST 判定的导出形态手动解包。
    if (
      (exportKind === 'esm-default' || exportKind === 'cjs-default')
      && namespace !== null
      && (typeof namespace === 'object' || typeof namespace === 'function')
      && 'default' in (namespace as object)
    ) {
      return { value: (namespace as { default: unknown }).default }
    }
    return { value: namespace }
  }
  catch (error) {
    throw new ConfigError({
      code: 'evaluation-failed',
      file: configPath,
      cause: error,
      message: error instanceof Error ? error.message : `${error}`,
    })
  }
}

/**
 * 仅接受对象导出。
 */
export function assertObjectExport(value: unknown, file: string): Record<string, unknown> {
  if (isThenable(value)) {
    throw new ConfigError({
      code: 'async-config-unsupported',
      file,
      message: 'async config is not supported; export a plain object',
    })
  }

  if (typeof value === 'function') {
    throw new ConfigError({
      code: 'function-config-unsupported',
      file,
      message: 'function config is not supported; export a plain object',
    })
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError({
      code: 'config-not-object',
      file,
      message: 'config must export a plain object',
    })
  }

  return value as Record<string, unknown>
}
