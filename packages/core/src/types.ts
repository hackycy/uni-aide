/**
 * 条件编译块标记
 */
export interface ConditionalBlock {
  __conditional: true
  condition: string
  type: 'ifdef' | 'ifndef'
  data: any
}
