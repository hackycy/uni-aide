import type { ConditionalBlock } from './types'

const toString = Object.prototype.toString

export function is(val: unknown, type: string): boolean {
  return toString.call(val) === `[object ${type}]`
}

export function isObject(val: any): val is Record<any, any> {
  return val !== null && is(val, 'Object')
}

/**
 * 检查对象是否为条件编译块
 */
export function isConditionalBlock(obj: any): obj is ConditionalBlock {
  return isObject(obj) && obj.__conditional === true
}
