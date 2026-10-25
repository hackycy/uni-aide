import type { Diagnostic, ParseConfigResult, ParseOptions } from './types'
import fs from 'node:fs'
import process from 'node:process'
import { analyze, detectExportKind } from './analyze'
import { babelParse, languageForFile } from './ast'
import { buildCommentIndex, collectComments } from './comments'
import { emitJSONC, walkCommentEntries } from './emit'
import { ConfigError } from './errors'
import { assertObjectExport, evaluateConfig, findConfigFile } from './evaluate'
import { normalizeValue } from './normalize'
import { validateRegions } from './regions'

export { findConfigFile }

/**
 * 解析配置文件：零污染求值、采集注释侧表、校验条件编译 region，返回诊断。
 */
export async function parseConfig(
  name: string,
  options: ParseOptions = {},
): Promise<ParseConfigResult> {
  const cwd = options.cwd || process.cwd()
  const configPath = resolveConfigPath(cwd, name)

  let source: string
  try {
    source = await fs.promises.readFile(configPath, 'utf-8')
  }
  catch (error) {
    throw new ConfigError({
      code: 'read-failed',
      file: configPath,
      cause: error,
      message: error instanceof Error ? error.message : `${error}`,
    })
  }

  let program
  try {
    program = babelParse(source, languageForFile(configPath), {
      sourceType: 'module',
      attachComment: false,
    })
  }
  catch (error) {
    throw new ConfigError({
      code: 'parse-error',
      file: configPath,
      cause: error,
      message: error instanceof Error ? error.message : `${error}`,
    })
  }

  const evaluated = await evaluateConfig(configPath, detectExportKind(program))
  const value = assertObjectExport(evaluated.value, configPath)

  const diagnostics: Diagnostic[] = []
  diagnostics.push(...normalizeValue(value, configPath))

  const analysis = analyze(program, value, configPath, source)
  diagnostics.push(...analysis.warnings)

  const collected = collectComments(
    program.comments ?? [],
    source,
    configPath,
    analysis,
  )
  diagnostics.push(...collected.diagnostics)

  const built = buildCommentIndex(collected.placements, value, configPath)
  diagnostics.push(...built.diagnostics)

  const outputOrder = walkCommentEntries(value, built.index, analysis.orderHints)
  diagnostics.push(...validateRegions(built.placements, outputOrder, configPath))

  const orderHints = new WeakMap<object, string[]>()
  for (const [object, hints] of analysis.orderHints) {
    orderHints.set(object, hints)
  }

  return {
    value,
    comments: built.index,
    orderHints,
    diagnostics,
  }
}

/**
 * 解析配置文件并发射 JSONC；遇到 error 级诊断时抛出。
 */
export async function parse(
  name: string,
  options: ParseOptions = {},
): Promise<string> {
  const result = await parseConfig(name, options)
  const errors = result.diagnostics.filter(
    diagnostic => diagnostic.severity === 'error',
  )
  if (errors.length > 0) {
    const first = errors[0]
    throw new ConfigError({
      code: first.code,
      file: first.file,
      path: first.path,
      message: first.message,
      diagnostics: errors,
    })
  }

  return emitJSONC(result.value, result.comments, result.orderHints)
}

function resolveConfigPath(cwd: string, name: string): string {
  const configPath = findConfigFile(cwd, name)
  if (!configPath) {
    throw new ConfigError({
      code: 'config-not-found',
      message: `Config file not found: ${name}`,
    })
  }
  return configPath
}
