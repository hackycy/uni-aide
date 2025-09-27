import type { ConditionalBlock } from './types'

/**
 * ifdef 条件编译函数
 * 返回一个特殊标记对象，在 buildPagesJson 中处理
 */
export function ifdef(condition: string, data: any): ConditionalBlock {
  return {
    __conditional: true,
    condition,
    type: 'ifdef',
    data,
  }
}

/**
 * ifndef 条件编译函数
 */
export function ifndef(condition: string, data: any): ConditionalBlock {
  return {
    __conditional: true,
    condition,
    type: 'ifndef',
    data,
  }
}
