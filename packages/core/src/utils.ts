const toString = Object.prototype.toString

export function is(val: unknown, type: string): boolean {
  return toString.call(val) === `[object ${type}]`
}

export function isObject(val: any): boolean {
  return val !== null && is(val, 'Object')
}

export function isArray(val: any): boolean {
  return Array.isArray(val)
}
