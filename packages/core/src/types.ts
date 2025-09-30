/**
 * 条件编译块标记
 */
export interface ConditionalBlock {
  __conditional: true
  condition: string
  type: 'ifdef' | 'ifndef'
  data: any
}

/**
 * 条件编译构建器
 */
export interface ConditionalBuilder {
  ifdef: (condition: string, data: any) => ConditionalBlock
  ifndef: (condition: string, data: any) => ConditionalBlock
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
