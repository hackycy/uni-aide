const toString = Object.prototype.toString

export function is(val: unknown, type: string): boolean {
  return toString.call(val) === `[object ${type}]`
}

export function isString(val: any): boolean {
  return is(val, 'String')
}

export function isObject(val: any): boolean {
  return val !== null && is(val, 'Object')
}

export function isArray(val: any): boolean {
  return Array.isArray(val)
}
