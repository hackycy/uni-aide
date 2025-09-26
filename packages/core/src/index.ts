import { assign, parse, stringify } from 'comment-json'
import { loadConfig } from 'unconfig'

/**
 * 定义页面配置的类型安全函数
 */
export function definePage<T extends Record<string, any>>(config: T): T {
  return config
}

/**
 * 条件编译块标记
 */
interface ConditionalBlock {
  __conditional: true
  condition: string
  type: 'ifdef' | 'ifndef'
  data: any
}

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
 * 加载页面配置文件
 */
export async function loadPagesConfig(configPath?: string): Promise<any> {
  const { config } = await loadConfig<any>({
    sources: [
      {
        files: configPath || 'pages.config',
        extensions: ['ts', 'mts', 'js', 'mjs'],
      },
    ],
    defaults: {},
  })

  return config
}

/**
 * 检查对象是否为条件编译块
 */
function isConditionalBlock(obj: any): obj is ConditionalBlock {
  return obj && typeof obj === 'object' && obj.__conditional === true
}

/**
 * 将配置转换为 JSON 字符串，处理条件编译注释
 */
export function buildPagesJson(config: any): string {
  // 递归处理对象，处理条件编译块
  function processObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(processObject)
    }

    if (obj && typeof obj === 'object') {
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
