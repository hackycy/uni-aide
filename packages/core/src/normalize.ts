import type { Diagnostic, Path } from './types'
import { ConfigError } from './errors'

export function formatPath(path: Path): string {
  if (path.length === 0) {
    return '$'
  }
  return `$${path
    .map(segment =>
      typeof segment === 'number'
        ? `[${segment}]`
        : `[${JSON.stringify(segment)}]`,
    )
    .join('')}`
}

type NormalizeResult
  = | { drop: true }
    | { drop: false, value: unknown }

/**
 * 发射前的值归一化（ticket 08）。原地修改运行时值，保持容器引用稳定，
 * 使 CommentIndex 的对象引用在归一化后依然有效。
 */
export function normalizeValue(root: unknown, file: string): Diagnostic[] {
  const warnings: Diagnostic[] = []
  const ancestors = new Set<object>()

  walk(root, [], 0)
  return warnings

  function warn(code: string, message: string, path: Path): void {
    warnings.push({
      severity: 'warning',
      code,
      message,
      file,
      path,
    })
  }

  function fatal(code: string, message: string, path: Path, cause?: unknown): never {
    throw new ConfigError({ code, file, path, cause, message })
  }

  function normalizeLeaf(
    value: unknown,
    path: Path,
    inArray: boolean,
    depth: number,
  ): NormalizeResult {
    const type = typeof value
    if (type === 'undefined' || type === 'function' || type === 'symbol') {
      warn(
        'dropped-value',
        `${type} value at ${formatPath(path)} is ${inArray ? 'replaced with null' : 'dropped'}`,
        path,
      )
      return inArray ? { drop: false, value: null } : { drop: true }
    }
    return { drop: false, value: walk(value, path, depth + 1) }
  }

  function walk(value: unknown, path: Path, depth: number): unknown {
    if (depth > 64) {
      fatal('circular-reference', `value nesting too deep at ${formatPath(path)}`, path)
    }
    if (value === null) {
      return null
    }

    const type = typeof value
    if (type === 'bigint') {
      fatal('bigint-value', `BigInt at ${formatPath(path)} is not serializable`, path)
    }
    if (type === 'number') {
      if (!Number.isFinite(value as number)) {
        warn(
          'non-finite-number',
          `non-finite number at ${formatPath(path)} is replaced with null`,
          path,
        )
        return null
      }
      return value
    }
    if (type !== 'object') {
      return value
    }

    const object = value as object

    if (object instanceof RegExp || object instanceof Map || object instanceof Set) {
      fatal(
        'unserializable-value',
        `${object.constructor.name} at ${formatPath(path)} is not serializable`,
        path,
      )
    }

    if (ancestors.has(object)) {
      fatal('circular-reference', `circular reference at ${formatPath(path)}`, path)
    }

    const toJSON = (object as { toJSON?: unknown }).toJSON
    if (typeof toJSON === 'function') {
      let serialized: unknown
      try {
        serialized = (toJSON as () => unknown).call(object)
      }
      catch (error) {
        fatal('evaluation-failed', `toJSON() failed at ${formatPath(path)}`, path, error)
      }
      if (serialized === object) {
        fatal('circular-reference', `circular reference at ${formatPath(path)}`, path)
      }
      ancestors.add(object)
      try {
        return walk(serialized, path, depth + 1)
      }
      finally {
        ancestors.delete(object)
      }
    }

    ancestors.add(object)
    try {
      if (Array.isArray(object)) {
        for (let index = 0; index < object.length; index++) {
          const result = normalizeLeaf(object[index], [...path, index], true, depth)
          object[index] = result.drop ? null : result.value
        }
      }
      else {
        for (const key of Object.keys(object)) {
          const result = normalizeLeaf(
            (object as Record<string, unknown>)[key],
            [...path, key],
            false,
            depth,
          )
          if (result.drop) {
            delete (object as Record<string, unknown>)[key]
          }
          else {
            (object as Record<string, unknown>)[key] = result.value
          }
        }
      }
    }
    finally {
      ancestors.delete(object)
    }

    return object
  }
}
