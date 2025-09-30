import type { ConditionalBlock, ConditionalBuilder, DefineChain } from './types'
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
 * 创建支持链式调用的条件编译对象
 */
export function define<T = any>(baseData: T): DefineChain<T> {
  const createDefineChain = (data: T, conditionals: Array<{ type: 'ifdef' | 'ifndef', condition: string, data: any }>): DefineChain<T> => {
    return {
      __defineData: {
        base: data,
        conditionals,
      },
      ifdef: (condition: string, conditionalData: Record<string, any>) => {
        return createDefineChain(data, [
          ...conditionals,
          { type: 'ifdef', condition, data: conditionalData },
        ])
      },
      ifndef: (condition: string, conditionalData: Record<string, any>) => {
        return createDefineChain(data, [
          ...conditionals,
          { type: 'ifndef', condition, data: conditionalData },
        ])
      },
    }
  }

  return createDefineChain(baseData, [])
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

/**
 * 检查对象是否为 DefineChain 对象
 */
function isDefineChain(obj: any): obj is DefineChain {
  return obj && typeof obj === 'object' && obj.__defineData && Array.isArray(obj.__defineData.conditionals)
}

/**
 * 递归处理配置对象，将 DefineChain 转换为带注释标记的普通对象
 */
function processConfig(config: any): any {
  if (Array.isArray(config)) {
    return config.map(item => processConfig(item))
  }

  if (config && typeof config === 'object') {
    if (isDefineChain(config)) {
      // 处理 DefineChain 对象
      const { base, conditionals } = config.__defineData
      const result: any = processConfig(base) // 递归处理基础数据

      // 为每个条件编译块添加注释标记
      conditionals.forEach((conditional, index) => {
        const { type, condition, data } = conditional
        const uniqueId = `${type}_${condition}_${index}`

        // 添加开始注释标记
        result[`__${uniqueId}_start`] = `#${type} ${condition}`

        // 添加条件编译的数据
        Object.keys(data).forEach((key) => {
          result[key] = processConfig(data[key])
        })

        // 添加结束注释标记
        result[`__${uniqueId}_end`] = `#endif`
      })

      return result
    }
    else {
      // 递归处理普通对象
      const result: any = {}
      Object.keys(config).forEach((key) => {
        result[key] = processConfig(config[key])
      })
      return result
    }
  }

  return config
}

export function buildJsonc(config: any): string {
  // 先处理配置对象，将 DefineChain 转换为带注释标记的普通对象
  const processedConfig = processConfig(config)

  // 使用 comment-json 生成 JSON 字符串
  const jsonString = stringify(processedConfig, null, 2)

  // 处理注释标记的替换
  const lines = jsonString.split('\n')
  const processedLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 处理开始标记 - 支持新旧两种标记格式
    const startMatch = line.match(/^(\s*)"(__(?:ifdef|ifndef)_[^_]+(?:_\d+)?_start)":\s*"([^"]+)",?/)
    if (startMatch) {
      const [, indent, , commentText] = startMatch
      processedLines.push(`${indent}// ${commentText}`)
      continue
    }

    // 处理结束标记 - 支持新旧两种标记格式
    const endMatch = line.match(/^(\s*)"(__(?:ifdef|ifndef)_[^_]+(?:_\d+)?_end)":\s*"([^"]+)"(,?)/)
    if (endMatch) {
      const [, indent, , commentText, comma] = endMatch
      processedLines.push(`${indent}// ${commentText}`)

      // 如果原来有逗号，需要给前一个有效属性加上逗号
      if (comma && processedLines.length > 0) {
        // 往前找到最后一个属性行
        for (let j = processedLines.length - 1; j >= 0; j--) {
          const prevLine = processedLines[j]
          if (prevLine.includes(':') && !prevLine.includes('//')) {
            if (!prevLine.includes(',')) {
              processedLines[j] = `${prevLine},`
            }
            break
          }
        }
      }
      continue
    }

    processedLines.push(line)
  }

  return processedLines.join('\n')
}
