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
