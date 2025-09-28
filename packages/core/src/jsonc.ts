import type { ConditionalBlock } from './types'
import { assign, parse, stringify } from 'comment-json'
import { loadConfig } from 'unconfig'
import { isArray, isConditionalBlock, isObject } from './utils'

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

export async function loadDefineConfig(name: string): Promise<Record<string, any>> {
  const { config } = await loadConfig({
    sources: [
      {
        files: `${name}.config`,
        extensions: ['ts', 'mts', 'js', 'mjs'],
      },
    ],
    defaults: {},
  })

  return config
}

export function buildJsonc(config: any): string {
  // 递归处理对象，处理条件编译块
  function processObject(obj: any): any {
    if (isArray(obj)) {
      return obj.map(processObject)
    }

    if (isObject(obj)) {
      const result: any = {}

      for (const [key, value] of Object.entries(obj)) {
        if (isConditionalBlock(value)) {
          // 处理条件编译块 - 展开到当前对象
          const conditionalBlock = value as ConditionalBlock

          // 构建带注释的 JSON 字符串
          const dataKeys = Object.keys(conditionalBlock.data)
          if (dataKeys.length > 0) {
            const jsonLines: string[] = ['{']
            jsonLines.push(`  // #${conditionalBlock.type} ${conditionalBlock.condition}`)

            dataKeys.forEach((dataKey, index) => {
              const dataValue = JSON.stringify(conditionalBlock.data[dataKey])
              const comma = index < dataKeys.length - 1 ? ',' : ''
              jsonLines.push(`  "${dataKey}": ${dataValue}${comma}`)
            })

            jsonLines.push('  // #endif')
            jsonLines.push('}')

            // 使用 comment-json 解析带注释的 JSON
            const conditionalObj = parse(jsonLines.join('\n'))

            // 直接将条件编译的属性展开到当前对象
            assign(result, conditionalObj)
          }
        }
        else {
          result[key] = processObject(value)
        }
      }

      return result
    }

    return obj
  }

  // 处理配置
  const processedConfig = processObject(config)

  // 直接使用 comment-json 的 stringify，它会保留注释
  return stringify(processedConfig, null, 2)
}
