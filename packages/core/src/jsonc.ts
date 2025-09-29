import type { ConditionalBlock, ConditionalBuilder } from './types'
import process from 'node:process'
import { stringify } from 'comment-json'
import { loadConfig } from 'unconfig'

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

/**
 * 链式调用的条件编译构建器 - 直接返回可展开的对象
 */
export const when: ConditionalBuilder = {
  ifdef: (condition: string, data: any) => {
    // 直接返回数据，但添加特殊的注释标记
    const result = { ...data }

    // 在每个属性前后添加注释标记
    const keys = Object.keys(result)
    if (keys.length > 0) {
      // 添加开始注释标记到第一个属性
      const firstKey = keys[0]
      const originalValue = result[firstKey]
      result[`__ifdef_${condition}_start`] = `#ifdef ${condition}`

      // 重新排序：注释 -> 原始属性
      delete result[firstKey]
      result[firstKey] = originalValue

      // 添加结束注释标记
      result[`__ifdef_${condition}_end`] = `#endif`
    }

    return result
  },
  ifndef: (condition: string, data: any) => {
    const result = { ...data }

    const keys = Object.keys(result)
    if (keys.length > 0) {
      const firstKey = keys[0]
      const originalValue = result[firstKey]
      result[`__ifndef_${condition}_start`] = `#ifndef ${condition}`

      delete result[firstKey]
      result[firstKey] = originalValue

      result[`__ifndef_${condition}_end`] = `#endif`
    }

    return result
  },
}

export async function loadDefineConfig(name: string, cwd = process.cwd()): Promise<Record<string, any>> {
  const { config } = await loadConfig({
    sources: [
      {
        files: `${name}.config`,
        extensions: ['ts', 'mts', 'js', 'mjs'],
      },
    ],
    cwd,
    defaults: {},
  })

  return config
}

export function buildJsonc(config: any): string {
  // 直接使用 comment-json 生成，然后替换注释标记
  const jsonString = stringify(config, null, 2)

  // 先找到并标记所有需要处理的位置
  const lines = jsonString.split('\n')

  // 处理注释标记的替换
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 处理开始标记
    const startMatch = line.match(/^(\s*)"(__(?:ifdef|ifndef)_[^_]+_start)":\s*"([^"]+)",?/)
    if (startMatch) {
      const [, indent, , commentText] = startMatch
      lines[i] = `${indent}// ${commentText}`
      continue
    }

    // 处理结束标记
    const endMatch = line.match(/^(\s*)"(__(?:ifdef|ifndef)_[^_]+_end)":\s*"([^"]+)"(,?)/)
    if (endMatch) {
      const [, indent, , commentText, comma] = endMatch
      lines[i] = `${indent}// ${commentText}`

      // 如果原来有逗号，需要给前一个有效属性加上逗号
      if (comma) {
        // 往前找到最后一个属性行
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j].includes(':') && !lines[j].includes('//')) {
            if (!lines[j].includes(',')) {
              lines[j] = `${lines[j]},`
            }
            break
          }
        }
      }
    }
  }

  return lines.join('\n')
}
