import type { GlobalStyle } from './globalStyle'

export interface PageMetaDatum {
  /**
   * 配置页面路径
   */
  path: string
  type?: string
  /**
   * 配置页面窗口表现，配置项参考下方 pageStyle
   */
  style?: GlobalStyle
  [x: string]: any
}
