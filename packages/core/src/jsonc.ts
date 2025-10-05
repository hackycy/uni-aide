import type { DefineChain, DefineChainInternal } from './types'
import process from 'node:process'
import { stringify } from 'comment-json'
import { loadConfig } from 'unconfig'
import { isDefineChain } from './types'
import { isObject } from './utils'

/**
 * 创建支持链式调用的条件编译对象
 */
export function define<T = any>(baseData: T): DefineChain<T> {
  const createDefineChain = (data: T, conditionals: Array<{ type: 'ifdef' | 'ifndef', condition: string, data: any }>): DefineChainInternal<T> => {
    return {
      __internal: {
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

export async function loadDefineConfig(name: string, cwd = process.cwd()): Promise<[Record<string, any>, string[]]> {
  const { config, sources } = await loadConfig({
    sources: [
      {
        files: name,
        extensions: ['ts', 'mts', 'js', 'mjs'],
      },
    ],
    cwd,
    defaults: {},
  })

  return [config, sources]
}

/**
 * 递归处理配置对象，将 DefineChain 转换为带注释标记的普通对象
 */
function processConfig(config: any): any {
  if (Array.isArray(config)) {
    return config.map(item => processConfig(item))
  }

  if (config && isObject(config)) {
    if (isDefineChain(config)) {
      // 处理 DefineChain 对象
      const { base, conditionals } = config.__internal
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

  // 后处理：移除最后一个有效属性的逗号
  const result = processedLines.join('\n')
  return removeTrailingCommas(result)
}

/**
 * 移除 JSON 对象中最后一个属性的尾随逗号
 */
function removeTrailingCommas(jsonString: string): string {
  const lines = jsonString.split('\n')
  const stack: number[] = [] // 记录每个对象/数组的起始行

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 记录对象/数组的开始
    if (trimmed.endsWith('{') || trimmed.endsWith('[')) {
      stack.push(i)
    }

    // 处理对象/数组的结束
    if (trimmed === '}' || trimmed === '},' || trimmed === ']' || trimmed === '],') {
      if (stack.length > 0) {
        const startIdx = stack.pop()!

        // 向前查找最后一个有效属性（不是注释）
        for (let j = i - 1; j > startIdx; j--) {
          const prevLine = lines[j]
          const prevTrimmed = prevLine.trim()

          // 跳过注释和空行
          if (prevTrimmed.startsWith('//') || prevTrimmed === '') {
            continue
          }

          // 如果找到有逗号的属性行，移除逗号
          if (prevLine.includes(':') && prevLine.endsWith(',')) {
            lines[j] = prevLine.slice(0, -1)
          }
          break
        }
      }
    }
  }

  return lines.join('\n')
}
