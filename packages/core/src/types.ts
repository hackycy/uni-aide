/**
 * 支持链式调用的条件编译对象（用户接口）
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
}

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
 * 内部实现类型，包含数据存储
 */
export interface DefineChainInternal<T = any> extends DefineChain<T> {
  __internal: DefineData<T>
}

/**
 * 获取 DefineChain 对象的内部数据（仅用于测试和内部使用）
 */
export function getDefineData<T = any>(defineChain: DefineChain<T>): DefineData<T> {
  return (defineChain as DefineChainInternal<T>).__internal
}

/**
 * 检查对象是否为 DefineChain 对象
 */
export function isDefineChain(obj: any): obj is DefineChainInternal {
  return obj && typeof obj === 'object' && obj.__internal && Array.isArray(obj.__internal.conditionals)
}
