import type { Diagnostic, Path } from './types'

export interface ConfigErrorOptions {
  code: string
  message: string
  file?: string
  path?: Path
  cause?: unknown
  diagnostics?: Diagnostic[]
}

/**
 * 结构化求值/解析错误：`{ code, file, path?, cause }`。
 */
export class ConfigError extends Error {
  code: string
  file?: string
  path?: Path
  cause?: unknown
  diagnostics?: Diagnostic[]

  constructor(options: ConfigErrorOptions) {
    super(`[${options.code}] ${options.message}`)
    this.name = 'ConfigError'
    this.code = options.code
    this.file = options.file
    this.path = options.path
    this.cause = options.cause
    this.diagnostics = options.diagnostics
  }
}
