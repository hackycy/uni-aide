import type * as t from '@babel/types'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { babelParse } from 'ast-kit'
import { define, loadDefineConfig } from './jsonc'

/**
 * 条件编译注释类型
 */
type ConditionalType = 'ifdef' | 'ifndef'

/**
 * 条件编译块信息
 */
interface ConditionalBlock {
  type: ConditionalType
  condition: string
  startLine: number
  endLine: number
}

/**
 * 解析配置文件中的条件编译注释位置信息
 *
 * @param filePath 配置文件路径
 * @returns 属性路径到条件编译块的映射
 */
export function parseConditionalComments(filePath: string): Map<string, ConditionalBlock[]> {
  const code = readFileSync(filePath, 'utf-8')
  const ast = babelParse(code, 'ts', { attachComment: true })

  // 查找 export default 语句
  const exportDefault = ast.body.find(
    node => node.type === 'ExportDefaultDeclaration',
  ) as t.ExportDefaultDeclaration | undefined

  if (!exportDefault) {
    throw new Error('No export default found in config file')
  }

  // 提取配置对象
  let configObject: t.ObjectExpression | undefined

  if (exportDefault.declaration.type === 'CallExpression') {
    // export default defineConfig({...}) 或 export default someFn({...})
    const callExpr = exportDefault.declaration
    if (callExpr.arguments.length > 0 && callExpr.arguments[0].type === 'ObjectExpression') {
      configObject = callExpr.arguments[0]
    }
  }
  else if (exportDefault.declaration.type === 'ObjectExpression') {
    // export default {...}
    configObject = exportDefault.declaration
  }

  if (!configObject) {
    throw new Error('Could not find config object')
  }

  // 收集所有条件编译块
  const comments = ast.comments || []
  const conditionalBlocks = extractConditionalBlocks(comments)

  // 收集属性的条件编译信息
  const propertyMap = new Map<string, ConditionalBlock[]>()
  collectPropertyConditionals(configObject, conditionalBlocks, [], propertyMap)

  return propertyMap
}

/**
 * 收集对象中所有属性的条件编译信息
 */
function collectPropertyConditionals(
  node: t.ObjectExpression,
  blocks: ConditionalBlock[],
  currentPath: string[],
  propertyMap: Map<string, ConditionalBlock[]>,
): void {
  for (const prop of node.properties) {
    if (prop.type !== 'ObjectProperty') {
      continue
    }

    const key = getPropertyKey(prop)
    if (!key) {
      continue
    }

    const propLine = prop.loc?.start.line
    if (!propLine) {
      continue
    }

    const propertyPath = [...currentPath, key]
    const propertyPathStr = propertyPath.join('.')

    // 查找该属性所在的所有条件编译块
    const propertyBlocks = blocks.filter(
      block => propLine > block.startLine && propLine < block.endLine,
    )

    // 记录属性的条件编译信息
    if (propertyBlocks.length > 0) {
      propertyMap.set(propertyPathStr, propertyBlocks)
    }

    // 递归处理嵌套对象
    if (prop.value.type === 'ObjectExpression') {
      collectPropertyConditionals(prop.value, blocks, propertyPath, propertyMap)
    }
    // 处理数组中的对象
    else if (prop.value.type === 'ArrayExpression') {
      prop.value.elements.forEach((element, index) => {
        if (element && element.type === 'ObjectExpression') {
          collectPropertyConditionals(
            element,
            blocks,
            [...propertyPath, `[${index}]`],
            propertyMap,
          )
        }
      })
    }
  }
}

/**
 * 合并配置值和条件编译信息，生成 define 链式调用结构
 *
 * @param config 通过 loadDefineConfig 加载的配置对象
 * @param conditionalMap 属性路径到条件编译块的映射
 * @returns 处理后的配置对象（包含 define 链式调用）
 */
export function mergeConfigWithConditionals(
  config: any,
  conditionalMap: Map<string, ConditionalBlock[]>,
): any {
  return processValueWithConditionals(config, [], conditionalMap)
}

/**
 * 递归处理配置值，应用条件编译信息
 */
function processValueWithConditionals(
  value: any,
  currentPath: string[],
  conditionalMap: Map<string, ConditionalBlock[]>,
): any {
  // 处理数组
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      processValueWithConditionals(item, [...currentPath, `[${index}]`], conditionalMap),
    )
  }

  // 处理对象
  if (value && typeof value === 'object' && value.constructor === Object) {
    return processObjectWithConditionals(value, currentPath, conditionalMap)
  }

  // 其他类型直接返回
  return value
}

/**
 * 处理对象，将条件编译信息转换为 define 链式调用
 */
function processObjectWithConditionals(
  obj: Record<string, any>,
  currentPath: string[],
  conditionalMap: Map<string, ConditionalBlock[]>,
): any {
  // 收集基础属性和条件属性
  const baseProps: Record<string, any> = {}
  const conditionalPropsMap = new Map<
    string,
    { type: ConditionalType, condition: string, data: Record<string, any> }
  >()

  for (const key in obj) {
    const propertyPath = [...currentPath, key]
    const propertyPathStr = propertyPath.join('.')
    const blocks = conditionalMap.get(propertyPathStr)

    // 递归处理值
    const processedValue = processValueWithConditionals(obj[key], propertyPath, conditionalMap)

    if (blocks && blocks.length > 0) {
      // 属性在条件编译块中
      // 目前只处理第一层条件块（最内层的）
      const block = blocks[blocks.length - 1]
      const mapKey = `${block.type}_${block.condition}`

      if (!conditionalPropsMap.has(mapKey)) {
        conditionalPropsMap.set(mapKey, {
          type: block.type,
          condition: block.condition,
          data: {},
        })
      }
      conditionalPropsMap.get(mapKey)!.data[key] = processedValue
    }
    else {
      // 基础属性
      baseProps[key] = processedValue
    }
  }

  // 如果没有条件属性，直接返回处理后的对象
  if (conditionalPropsMap.size === 0) {
    return baseProps
  }

  // 构建 define 链
  let result = define(baseProps)
  for (const { type, condition, data } of conditionalPropsMap.values()) {
    if (type === 'ifdef') {
      result = result.ifdef(condition, data)
    }
    else {
      result = result.ifndef(condition, data)
    }
  }

  return result
}

/**
 * 完整的流程：解析配置文件并生成带条件编译的配置对象
 *
 * @param filePath 配置文件的完整路径或文件名
 * @param cwd 工作目录（如果 filePath 只是文件名）
 * @returns 处理后的配置对象（包含 define 链式调用）
 */
export async function parseConfigFileWithConditionals(
  filePath: string,
  cwd?: string,
): Promise<any> {
  const path = await import('node:path')

  // 判断是完整路径还是文件名
  const isAbsolutePath = path.isAbsolute(filePath)
  const actualFilePath = isAbsolutePath ? filePath : path.resolve(cwd || process.cwd(), filePath)
  const directory = path.dirname(actualFilePath)

  // 获取不带扩展名的文件名
  const basename = path.basename(actualFilePath)
  const fileNameWithoutExt = basename.replace(/\.(ts|mts|js|mjs)$/, '')

  // 1. 解析注释位置信息
  const conditionalMap = parseConditionalComments(actualFilePath)

  // 2. 使用 loadDefineConfig 加载配置文件获取实际值
  const [config] = await loadDefineConfig(fileNameWithoutExt, directory)

  // 3. 合并配置值和条件编译信息
  return mergeConfigWithConditionals(config, conditionalMap)
}

/**
 * 解析配置文件，将带有条件编译注释的配置转换为 define 链式调用
 *
 * @param filePath 配置文件路径
 * @returns 处理后的配置对象
 */
export function parseConfigFile(filePath: string): any {
  const code = readFileSync(filePath, 'utf-8')
  const ast = babelParse(code, 'ts', { attachComment: true })

  // 查找 export default 语句
  const exportDefault = ast.body.find(
    node => node.type === 'ExportDefaultDeclaration',
  ) as t.ExportDefaultDeclaration | undefined

  if (!exportDefault) {
    throw new Error('No export default found in config file')
  }

  // 提取 defineConfig 的参数
  let configObject: t.ObjectExpression | undefined

  if (exportDefault.declaration.type === 'CallExpression') {
    // export default defineConfig({...})
    const callExpr = exportDefault.declaration
    if (callExpr.arguments.length > 0 && callExpr.arguments[0].type === 'ObjectExpression') {
      configObject = callExpr.arguments[0]
    }
  }
  else if (exportDefault.declaration.type === 'ObjectExpression') {
    // export default {...}
    configObject = exportDefault.declaration
  }

  if (!configObject) {
    throw new Error('Could not find config object')
  }

  // 收集所有条件编译块
  const comments = ast.comments || []
  const conditionalBlocks = extractConditionalBlocks(comments)

  // 处理配置对象
  return processNode(configObject, conditionalBlocks)
}

/**
 * 从注释数组中提取条件编译块
 */
function extractConditionalBlocks(comments: t.Comment[]): ConditionalBlock[] {
  const blocks: ConditionalBlock[] = []
  const stack: Partial<ConditionalBlock>[] = []

  for (const comment of comments) {
    const text = comment.value.trim()

    // 匹配 #ifdef 或 #ifndef
    const ifdefMatch = text.match(/^#(ifdef|ifndef)\s+(\S.*)$/)
    if (ifdefMatch) {
      const [, type, condition] = ifdefMatch
      stack.push({
        type: type as ConditionalType,
        condition: condition.trim(),
        startLine: comment.loc?.start.line || 0,
      })
      continue
    }

    // 匹配 #endif
    if (text.match(/^#endif$/)) {
      const block = stack.pop()
      if (block && block.type && block.condition !== undefined && block.startLine !== undefined && comment.loc) {
        blocks.push({
          type: block.type,
          condition: block.condition,
          startLine: block.startLine,
          endLine: comment.loc.end.line,
        })
      }
    }
  }

  return blocks
}

/**
 * 判断某一行是否在条件编译块中
 */
function getConditionalBlock(line: number, blocks: ConditionalBlock[]): ConditionalBlock | null {
  return blocks.find(block => line > block.startLine && line < block.endLine) || null
}

/**
 * 处理 AST 节点
 */
function processNode(node: t.Node, blocks: ConditionalBlock[]): any {
  if (node.type === 'ObjectExpression') {
    return processObjectExpression(node, blocks)
  }

  if (node.type === 'ArrayExpression') {
    return processArrayExpression(node, blocks)
  }

  return evaluateValue(node)
}

/**
 * 处理对象表达式
 */
function processObjectExpression(node: t.ObjectExpression, blocks: ConditionalBlock[]): any {
  // 收集所有属性及其所在的条件块
  const baseProps: Record<string, any> = {}
  const conditionalPropsMap = new Map<string, { type: ConditionalType, condition: string, data: Record<string, any> }>()

  for (const prop of node.properties) {
    if (prop.type !== 'ObjectProperty') {
      continue
    }

    const key = getPropertyKey(prop)
    if (!key) {
      continue
    }

    const propLine = prop.loc?.start.line
    if (!propLine) {
      continue
    }

    const block = getConditionalBlock(propLine, blocks)

    // 处理属性值
    let value: any
    if (prop.value.type === 'ObjectExpression') {
      value = processObjectExpression(prop.value, blocks)
    }
    else if (prop.value.type === 'ArrayExpression') {
      value = processArrayExpression(prop.value, blocks)
    }
    else {
      value = evaluateValue(prop.value)
    }

    if (block) {
      // 属性在条件编译块中
      const mapKey = `${block.type}_${block.condition}`
      if (!conditionalPropsMap.has(mapKey)) {
        conditionalPropsMap.set(mapKey, {
          type: block.type,
          condition: block.condition,
          data: {},
        })
      }
      conditionalPropsMap.get(mapKey)!.data[key] = value
    }
    else {
      // 基础属性
      baseProps[key] = value
    }
  }

  // 如果没有条件属性，直接返回基础对象
  if (conditionalPropsMap.size === 0) {
    return baseProps
  }

  // 构建 define 链
  let result = define(baseProps)
  for (const { type, condition, data } of conditionalPropsMap.values()) {
    if (type === 'ifdef') {
      result = result.ifdef(condition, data)
    }
    else {
      result = result.ifndef(condition, data)
    }
  }

  return result
}

/**
 * 处理数组表达式
 */
function processArrayExpression(node: t.ArrayExpression, blocks: ConditionalBlock[]): any[] {
  return node.elements
    .map((element: t.Expression | t.SpreadElement | null) => {
      if (!element || element.type === 'SpreadElement') {
        return null
      }
      return processNode(element, blocks)
    })
    .filter((v: any) => v !== null)
}

/**
 * 获取属性的键名
 */
function getPropertyKey(prop: t.ObjectProperty | t.ObjectMethod): string | null {
  if (prop.key.type === 'Identifier') {
    return prop.key.name
  }
  if (prop.key.type === 'StringLiteral') {
    return prop.key.value
  }
  return null
}

/**
 * 计算节点的值
 */
function evaluateValue(node: t.Node): any {
  switch (node.type) {
    case 'StringLiteral':
      return node.value
    case 'NumericLiteral':
      return node.value
    case 'BooleanLiteral':
      return node.value
    case 'NullLiteral':
      return null
    case 'Identifier':
      // 返回标识符名称
      return node.name
    case 'ObjectExpression': {
      const obj: any = {}
      for (const prop of node.properties) {
        if (prop.type === 'ObjectProperty') {
          const key = getPropertyKey(prop)
          if (key && prop.value) {
            obj[key] = evaluateValue(prop.value)
          }
        }
      }
      return obj
    }
    case 'ArrayExpression':
      return node.elements.map((el: t.Expression | t.SpreadElement | null) =>
        el && el.type !== 'SpreadElement' ? evaluateValue(el) : null,
      )
    case 'UnaryExpression':
      if (node.operator === '-' && node.argument.type === 'NumericLiteral') {
        return -node.argument.value
      }
      return undefined
    case 'TemplateLiteral':
      // 简单处理模板字符串
      if (node.expressions.length === 0) {
        return node.quasis.map(q => q.value.cooked).join('')
      }
      return undefined
    default:
      return undefined
  }
}
