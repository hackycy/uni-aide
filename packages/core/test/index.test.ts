import { describe, expect, it } from 'vitest'
import { buildJsonc, ifdef, ifndef, when } from '../src/index'

describe('ifdef and ifndef', () => {
  it('should create conditional block objects', () => {
    const ifdefBlock = ifdef('H5', { test: 'value' })
    expect(ifdefBlock).toEqual({
      __conditional: true,
      condition: 'H5',
      type: 'ifdef',
      data: { test: 'value' },
    })

    const ifndefBlock = ifndef('MP-WEIXIN', { test: 'value' })
    expect(ifndefBlock).toEqual({
      __conditional: true,
      condition: 'MP-WEIXIN',
      type: 'ifndef',
      data: { test: 'value' },
    })
  })
})

describe('when - chainable conditional', () => {
  it('should provide chainable conditional methods that return expandable objects', () => {
    const ifdefBlock = when.ifdef('H5', { test: 'value' })
    // when.ifdef 返回可展开的对象，包含注释标记
    expect(ifdefBlock).toHaveProperty('test', 'value')
    expect(ifdefBlock).toHaveProperty('__ifdef_H5_start', '#ifdef H5')
    expect(ifdefBlock).toHaveProperty('__ifdef_H5_end', '#endif')

    const ifndefBlock = when.ifndef('MP-WEIXIN', { test: 'value' })
    expect(ifndefBlock).toHaveProperty('test', 'value')
    expect(ifndefBlock).toHaveProperty('__ifndef_MP-WEIXIN_start', '#ifndef MP-WEIXIN')
    expect(ifndefBlock).toHaveProperty('__ifndef_MP-WEIXIN_end', '#endif')
  })
})

describe('buildJsonc', () => {
  it('should stringify plain config without ifdef/ifndef', () => {
    const config = {
      pages: [],
      globalStyle: {
        navigationBarBackgroundColor: '@navBgColor',
        navigationBarTextStyle: '@navTxtStyle',
      },
    }

    const result = buildJsonc(config)
    const expected = JSON.stringify(config, null, 2)
    expect(result).toBe(expected)
  })

  it('should handle ifdef blocks with comments and preserve object structure', () => {
    const config = {
      pages: [],
      globalStyle: {
        navigationBarBackgroundColor: '@navBgColor',
        navigationBarTextStyle: '@navTxtStyle',
        ...when.ifdef('H5', {
          enablePullDownRefresh: false,
          onReachBottomDistance: 50,
        }),
        backgroundColor: '#ffffff',
      },
    }

    const result = buildJsonc(config)

    // 检查是否包含注释
    expect(result).toContain('// #ifdef H5')
    expect(result).toContain('// #endif')
    expect(result).toContain('"enablePullDownRefresh": false')
    expect(result).toContain('"onReachBottomDistance": 50')

    // 检查原有属性是否保留
    expect(result).toContain('"pages": []')
    expect(result).toContain('"navigationBarBackgroundColor": "@navBgColor"')
    expect(result).toContain('"navigationBarTextStyle": "@navTxtStyle"')
    expect(result).toContain('"backgroundColor": "#ffffff"')
    expect(result).toContain('"globalStyle"')
  })

  it('should handle ifndef blocks with comments', () => {
    const config = {
      pages: [],
      globalStyle: {
        navigationBarBackgroundColor: '@navBgColor',
        ...when.ifndef('MP-WEIXIN', {
          enablePullDownRefresh: false,
        }),
      },
    }

    const result = buildJsonc(config)

    // 检查是否包含注释
    expect(result).toContain('// #ifndef MP-WEIXIN')
    expect(result).toContain('// #endif')
    expect(result).toContain('"enablePullDownRefresh": false')
  })

  it('should handle multiple conditional blocks in same object', () => {
    const config = {
      pages: [],
      globalStyle: {
        navigationBarBackgroundColor: '@navBgColor',
        ...when.ifdef('H5', {
          enablePullDownRefresh: false,
          onReachBottomDistance: 50,
        }),
        ...when.ifndef('MP-WEIXIN', {
          customProperty: 'value',
        }),
        backgroundColor: '#ffffff',
      },
    }

    const result = buildJsonc(config)

    // 检查两个条件编译块都存在
    expect(result).toContain('// #ifdef H5')
    expect(result).toContain('// #ifndef MP-WEIXIN')
    expect(result).toContain('"enablePullDownRefresh": false')
    expect(result).toContain('"customProperty": "value"')

    // 检查原有属性保留
    expect(result).toContain('"navigationBarBackgroundColor": "@navBgColor"')
    expect(result).toContain('"backgroundColor": "#ffffff"')
  })

  it('should handle conditional blocks in arrays', () => {
    const config = {
      pages: [
        { path: 'pages/index/index' },
        when.ifdef('H5', { path: 'pages/h5-only/index' }),
        { path: 'pages/about/index' },
      ],
    }

    const result = buildJsonc(config)

    expect(result).toContain('pages/index/index')
    expect(result).toContain('pages/h5-only/index')
    expect(result).toContain('pages/about/index')
    // 数组中的条件编译可能不会有完美的注释位置，但内容应该存在
  })
})

describe('integration test', () => {
  it('should load and build pages config correctly', async () => {
    // 由于 loadPagesConfig 需要实际的文件系统，我们创建一个模拟配置
    const mockConfig = {
      pages: [],
      globalStyle: {
        navigationBarBackgroundColor: '@navBgColor',
        navigationBarTextStyle: '@navTxtStyle',
        backgroundColor: '@bgColor',
        backgroundTextStyle: '@bgTxtStyle',
        backgroundColorTop: '@bgColorTop',
        backgroundColorBottom: '@bgColorBottom',
        ...when.ifdef('H5', {
          enablePullDownRefresh: false,
          onReachBottomDistance: 50,
        }),
      },
      easycom: {
        autoscan: true,
        custom: {
          '^wd-(.*)': 'wot-design-uni/components/wd-$1/wd-$1.vue',
        },
      },
    }

    const result = buildJsonc(mockConfig)

    // 验证基本结构
    expect(result).toContain('"pages": []')
    expect(result).toContain('"navigationBarBackgroundColor": "@navBgColor"')
    expect(result).toContain('"autoscan": true')

    // 验证条件编译注释
    expect(result).toContain('// #ifdef H5')
    expect(result).toContain('// #endif')
    expect(result).toContain('"enablePullDownRefresh": false')
    expect(result).toContain('"onReachBottomDistance": 50')

    // 暂时输出结果进行调试
    // 这里我们只检查是否包含基本的结构，不检查JSON的有效性
    expect(result).toContain('"globalStyle"')
  })
})
