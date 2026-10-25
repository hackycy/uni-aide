const toString = Object.prototype.toString

export function is(val: unknown, type: string): boolean {
  return toString.call(val) === `[object ${type}]`
}

export function isString(val: any): boolean {
  return is(val, 'String')
}

export function isArray(val: any): boolean {
  return Array.isArray(val)
}

/**
 * 不依赖 locale 的字符串比较，保证跨环境输出顺序一致。
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}
