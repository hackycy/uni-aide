import type { ParseResult, ParserOptions, ParserPlugin } from '@babel/parser'
import type * as t from '@babel/types'
import { parse } from '@babel/parser'
import { isObject } from './utils'

export const REGEX_LANG_TS: RegExp = /^[cm]?tsx?$/
export const REGEX_LANG_JSX: RegExp = /^[cm]?[jt]sx$/

/**
 * 查找注释所属的节点，只查找CommentLine类型的注释
 * 通过递归遍历 AST，找到包含该注释的最内层（最具体）的节点
 */
export function findCommentBelongsToNode(
  comment: t.Comment,
  ast: t.Program,
): t.Node | null {
  // 只处理 CommentLine 类型的注释
  if (comment.type !== 'CommentLine') {
    return null
  }

  if (!comment.loc) {
    return null
  }

  let foundNode: t.Node | null = null
  let minRange = Number.POSITIVE_INFINITY

  /**
   * 递归遍历节点，找到包含注释的最小节点
   */
  function traverse(node: t.Node): void {
    if (!node.loc) {
      return
    }

    // 检查注释是否在当前节点的范围内
    // 只需要检查注释的起始位置是否在节点范围内即可
    const commentLine = comment.loc!.start.line
    const commentColumn = comment.loc!.start.column

    const isCommentInNode
      = commentLine >= node.loc.start.line
        && commentLine <= node.loc.end.line
        && (commentLine > node.loc.start.line || commentColumn >= node.loc.start.column)
        && (commentLine < node.loc.end.line || commentColumn <= node.loc.end.column)

    if (isCommentInNode) {
      // 计算节点范围，找到最小的（最内层的）节点
      const range
        = (node.loc.end.line - node.loc.start.line) * 10000
          + (node.loc.end.column - node.loc.start.column)

      if (range < minRange) {
        minRange = range
        foundNode = node
      }
    }

    // 递归遍历子节点
    for (const key in node) {
      // 忽略元数据属性
      if (
        [
          'type',
          'kind',
          'loc',
          'start',
          'end',
          'comments',
          'leadingComments',
          'trailingComments',
          'innerComments',
          'extra',
          'range',
        ].includes(key)
      ) {
        continue
      }

      // 通用遍历，避免遗漏节点
      const value = (node as any)[key]

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (isObject(item) && item.type) {
            traverse(item)
          }
        })
      }
      else if (isObject(value) && value.type) {
        traverse(value)
      }
    }
  }

  // 从根节点开始遍历
  ast.body.forEach(node => traverse(node))

  return foundNode
}

/**
 * 获取属性的键名
 */
export function getPropertyKey(
  prop: t.ObjectProperty | t.ObjectMethod,
): string | null {
  if (prop.key.type === 'Identifier') {
    // 普通标识符，如: { name: 'value' }
    return prop.key.name
  }
  if (prop.key.type === 'StringLiteral') {
    // 字符串字面量，如: { 'my-key': 'value' }
    return prop.key.value
  }
  return null
}

/**
 * @link https://github.com/sxzz/ast-kit/blob/f876734fea0dc8bfa53d7e24fd372fa77aa93189/src/parse.ts#L78
 */
export function babelParse(code: string, lang?: string, options: ParserOptions = {}): t.Program & Omit<ParseResult<t.File>, 'type' | 'program'> {
  const result: ParseResult<t.File> | undefined = parse(code, getBabelParserOptions(lang, options))

  // oxlint-disable-next-line no-unused-vars
  const { program, type, ...rest } = result
  return { ...program, ...rest }
}

/**
 * Gets the Babel parser options for the given language.
 * @param lang - The language of the code (optional).
 * @param options - The parser options (optional).
 * @returns The Babel parser options for the given language.
 */
export function getBabelParserOptions(
  lang?: string,
  options: ParserOptions = {},
): ParserOptions {
  const plugins: ParserPlugin[] = [...(options.plugins || [])]
  if (isTs(lang)) {
    if (!hasPlugin(plugins, 'typescript')) {
      plugins.push(
        lang === 'dts' ? ['typescript', { dts: true }] : 'typescript',
      )
    }

    if (
      !hasPlugin(plugins, 'decorators')
      && !hasPlugin(plugins, 'decorators-legacy')
    ) {
      plugins.push('decorators-legacy')
    }

    if (
      !hasPlugin(plugins, 'importAttributes')
      && !hasPlugin(plugins, 'importAssertions')
      && !hasPlugin(plugins, 'deprecatedImportAssert')
    ) {
      plugins.push('importAttributes', 'deprecatedImportAssert')
    }

    if (!hasPlugin(plugins, 'explicitResourceManagement')) {
      plugins.push('explicitResourceManagement')
    }

    if (REGEX_LANG_JSX.test(lang!) && !hasPlugin(plugins, 'jsx')) {
      plugins.push('jsx')
    }
  }
  else if (!hasPlugin(plugins, 'jsx')) {
    plugins.push('jsx')
  }
  return {
    sourceType: 'module',
    ...options,
    plugins,
  }
}

function hasPlugin(
  plugins: ParserPlugin[],
  plugin: Exclude<ParserPlugin, any[]>,
) {
  return plugins.some(p => (Array.isArray(p) ? p[0] : p) === plugin)
}

/**
 * Checks if the given language (ts, mts, cjs, dts, tsx...) is TypeScript.
 * @param lang - The language to check.
 * @returns A boolean indicating whether the language is TypeScript.
 */
export function isTs(lang?: string): boolean {
  return !!lang && (lang === 'dts' || REGEX_LANG_TS.test(lang))
}
