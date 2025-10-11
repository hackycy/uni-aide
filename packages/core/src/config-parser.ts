import type * as t from '@babel/types'

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
 */
export function parseConditionalComments(_source: string): Map<string, ConditionalBlock[]> {
  const propertyMap = new Map<string, ConditionalBlock[]>()

  return propertyMap
}

/**
 * 获取属性的键名
 */
export function getPropertyKey(prop: t.ObjectProperty | t.ObjectMethod): string | null {
  if (prop.key.type === 'Identifier') {
    return prop.key.name
  }
  if (prop.key.type === 'StringLiteral') {
    return prop.key.value
  }
  return null
}
