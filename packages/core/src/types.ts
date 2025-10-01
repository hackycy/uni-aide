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
   * 内部数据，包含基础数据和条件编译信息
   */
  __defineData: {
    base: T
    conditionals: Array<{
      type: 'ifdef' | 'ifndef'
      condition: string
      data: any
    }>
  }
}
