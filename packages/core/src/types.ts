/**
 * 内部数据符号，用于存储条件编译信息
 */
export const DEFINE_DATA_SYMBOL = Symbol('defineData')

/**
 * 内部数据类型定义
 */
export interface DefineData<T = any> {
  base: T
  conditionals: Array<{
    type: 'ifdef' | 'ifndef'
    condition: string
    data: any
  }>
}

/**
 * 支持链式调用的条件编译对象
 */
export interface DefineChain<T = any> {
  /**
   * 如果定义了某个条件编译标记，则包含指定的数据
   */
  ifdef: (condition: string, data: Record<string, any>) => DefineChain<T>

  /**
   * 如果没有定义某个条件编译标记，则包含指定的数据
   */
  ifndef: (condition: string, data: Record<string, any>) => DefineChain<T>

  /**
   * 内部数据存储（使用 Symbol 隐藏实现细节）
   */
  [DEFINE_DATA_SYMBOL]: DefineData<T>
}

/**
 * 获取 DefineChain 对象的内部数据（仅用于测试）
 */
export function getDefineData<T = any>(defineChain: DefineChain<T>): DefineData<T> {
  return defineChain[DEFINE_DATA_SYMBOL]
}
