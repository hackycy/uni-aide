export { babelParse } from 'ast-kit'

/**
 * 根据配置文件扩展名选择 Babel 解析语言。
 */
export function languageForFile(filePath: string): 'ts' | 'js' {
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase()
  return ext === 'ts' || ext === 'mts' || ext === 'cts' ? 'ts' : 'js'
}
