import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseConditionalComments } from '../src/config-parser'

describe('parseConditionalComments', () => {
  const fixturesDir = resolve(__dirname, 'fixtures')

  it('should parse conditional comments in TypeScript config file', () => {
    const configPath = resolve(fixturesDir, 'pages-with-comments.config.ts')
    const result = parseConditionalComments(configPath)

    // 应该包含转换后的注释标记
    expect(result).toContain('__comment_10__')
    expect(result).toContain('__comment_12__')
    expect(result).toContain('__comment_14__')
    expect(result).toContain('__comment_16__')
    expect(result).toContain('__comment_28__')
    expect(result).toContain('__comment_31__')

    // 应该包含条件编译指令内容
    expect(result).toContain('#ifdef H5')
    expect(result).toContain('#endif')
    expect(result).toContain('#ifdef MP-WEIXIN')

    // 验证对象中的注释转换格式
    expect(result).toMatch(/"__comment_\d+__":\s*"\s*#ifdef H5"/)
    expect(result).toMatch(/"__comment_\d+__":\s*"\s*#endif"/)

    // 确保原始代码结构保持不变（除了注释）
    expect(result).toContain('navigationBarTitleText')
    expect(result).toContain('navigationStyle')
    expect(result).toContain('enablePullDownRefresh')
  })

  it('should parse conditional comments in JavaScript config file', () => {
    const configPath = resolve(fixturesDir, 'pages-with-comments.config.js')
    const result = parseConditionalComments(configPath)

    // 验证基本解析功能
    expect(result).toContain('__comment_')
    expect(result).toContain('export default')
  })

  it('should handle object properties with conditional comments', () => {
    const configPath = resolve(fixturesDir, 'pages-with-comments.config.ts')
    const result = parseConditionalComments(configPath)

    // 在 style 对象中的条件编译注释应该被正确转换
    // 注释应该变成对象的属性
    expect(result).toMatch(/"__comment_\d+__":\s*"\s*#ifdef H5",/)
    expect(result).toMatch(/"__comment_\d+__":\s*"\s*#endif",/)
  })

  it('should handle array elements with conditional comments', () => {
    const configPath = resolve(fixturesDir, 'pages-with-comments.config.ts')
    const result = parseConditionalComments(configPath)

    // pages 数组中包含对象，对象内的注释应该被转换为对象属性格式
    // 而不是数组元素格式
    expect(result).toContain('__comment_')
  })

  it('should preserve code structure', () => {
    const configPath = resolve(fixturesDir, 'pages-with-comments.config.ts')
    const result = parseConditionalComments(configPath)

    // 验证导出语句
    expect(result).toContain('export default')

    // 验证主要配置项
    expect(result).toContain('pages')
    expect(result).toContain('globalStyle')
    expect(result).toContain('easycom')

    // 验证嵌套结构保持完整
    expect(result).toContain('navigationBarBackgroundColor')
    expect(result).toContain('autoscan')
    expect(result).toContain('custom')
  })

  it('should throw error when file does not exist', () => {
    // 使用一个不存在的路径来测试错误处理
    expect(() => {
      parseConditionalComments(resolve(fixturesDir, 'non-existent.ts'))
    }).toThrow()
  })

  it('should throw error when no export default found', () => {
    const configPath = resolve(fixturesDir, 'no-export-default.config.ts')

    expect(() => {
      parseConditionalComments(configPath)
    }).toThrow('config file must have export default')
  })

  it('should handle comments in array elements', () => {
    const configPath = resolve(fixturesDir, 'array-comments.config.ts')
    const result = parseConditionalComments(configPath)

    // 数组中的注释应该被转换为数组元素格式
    expect(result).toContain('__comment_')
    expect(result).toContain('#ifdef H5')
    expect(result).toContain('#ifdef MP-WEIXIN')

    // 验证数组结构保持完整
    expect(result).toContain('pages')
    expect(result).toContain('subPackages')
  })

  it('should handle CallExpression export default (like defineConfig)', () => {
    const configPath = resolve(fixturesDir, 'define-config.config.ts')
    const result = parseConditionalComments(configPath)

    // 应该能够正确解析 export default defineConfig(...) 格式
    expect(result).toContain('__comment_')
    expect(result).toContain('#ifdef H5')
    expect(result).toContain('#ifndef MP-WEIXIN')
    expect(result).toContain('navigationStyle')
    expect(result).toContain('navigationBarBackgroundColor')
  })

  it('should handle nested objects and arrays', () => {
    const configPath = resolve(fixturesDir, 'pages-with-comments.config.ts')
    const result = parseConditionalComments(configPath)

    // 验证深层嵌套结构
    // pages -> array -> object -> style -> object -> 条件注释
    expect(result).toContain('style')
    expect(result).toContain('path')

    // globalStyle 对象中的条件注释
    expect(result).toContain('navigationBarBackgroundColor')
    expect(result).toContain('@navBgColor')
  })

  it('should correctly identify comment parent type as object', () => {
    const configPath = resolve(fixturesDir, 'pages-with-comments.config.ts')
    const result = parseConditionalComments(configPath)

    // 在 style 对象中的注释应该使用对象格式
    // "__comment_N__": "comment content"
    const objectCommentPattern = /"__comment_\d+__":\s*"/
    expect(result).toMatch(objectCommentPattern)
  })

  it('should handle multiple conditional compilation directives', () => {
    const configPath = resolve(fixturesDir, 'pages-with-comments.config.ts')
    const result = parseConditionalComments(configPath)

    // 文件中有多个 #ifdef 和 #endif
    const ifdefMatches = result.match(/#ifdef/g)
    const endifMatches = result.match(/#endif/g)

    expect(ifdefMatches).toBeTruthy()
    expect(endifMatches).toBeTruthy()
    expect(ifdefMatches!.length).toBeGreaterThan(0)
    expect(endifMatches!.length).toBeGreaterThan(0)
  })

  it('should preserve original property values', () => {
    const configPath = resolve(fixturesDir, 'pages-with-comments.config.ts')
    const result = parseConditionalComments(configPath)

    // 确保原始值没有被修改
    expect(result).toContain('pages/index/index')
    expect(result).toContain('UNI_APP')
    expect(result).toContain('wot-design-uni/components')
    expect(result).toContain('@navBgColor')
    expect(result).toContain('@navTxtStyle')
  })
})
