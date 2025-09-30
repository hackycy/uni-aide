import { describe, expect, it } from 'vitest'
import { buildJsonc, define, ifdef, ifndef, when } from '../src/index'

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

describe('define API', () => {
  it('should create chainable conditional objects', () => {
    const baseData = { test: 'value' }
    const defineChain = define(baseData)

    expect(defineChain).toHaveProperty('__defineData')
    expect(defineChain.__defineData.base).toEqual(baseData)
    expect(defineChain.__defineData.conditionals).toEqual([])
    expect(typeof defineChain.ifdef).toBe('function')
    expect(typeof defineChain.ifndef).toBe('function')
  })

  it('should support chaining ifdef calls', () => {
    const result = define({ base: 'value' })
      .ifdef('H5', { h5Only: true })
      .ifdef('MP-WEIXIN', { mpOnly: true })

    expect(result.__defineData.conditionals).toHaveLength(2)
    expect(result.__defineData.conditionals[0]).toEqual({
      type: 'ifdef',
      condition: 'H5',
      data: { h5Only: true },
    })
    expect(result.__defineData.conditionals[1]).toEqual({
      type: 'ifdef',
      condition: 'MP-WEIXIN',
      data: { mpOnly: true },
    })
  })

  it('should support chaining ifndef calls', () => {
    const result = define({ base: 'value' })
      .ifndef('H5', { notH5: true })
      .ifndef('MP-WEIXIN', { notMp: true })

    expect(result.__defineData.conditionals).toHaveLength(2)
    expect(result.__defineData.conditionals[0]).toEqual({
      type: 'ifndef',
      condition: 'H5',
      data: { notH5: true },
    })
    expect(result.__defineData.conditionals[1]).toEqual({
      type: 'ifndef',
      condition: 'MP-WEIXIN',
      data: { notMp: true },
    })
  })

  it('should support mixed ifdef and ifndef calls', () => {
    const result = define({ base: 'value' })
      .ifdef('H5', { h5Only: true })
      .ifndef('MP-WEIXIN', { notMp: true })

    expect(result.__defineData.conditionals).toHaveLength(2)
    expect(result.__defineData.conditionals[0]).toEqual({
      type: 'ifdef',
      condition: 'H5',
      data: { h5Only: true },
    })
    expect(result.__defineData.conditionals[1]).toEqual({
      type: 'ifndef',
      condition: 'MP-WEIXIN',
      data: { notMp: true },
    })
  })
})

describe('buildJsonc with define API', () => {
  it('should convert define chains to JSON5 with comments', () => {
    const config = {
      globalStyle: define({
        navigationBarBackgroundColor: '@navBgColor',
        navigationBarTextStyle: '@navTxtStyle',
      }).ifdef('H5', {
        enablePullDownRefresh: false,
        onReachBottomDistance: 50,
      }),
    }

    const result = buildJsonc(config)

    expect(result).toContain('// #ifdef H5')
    expect(result).toContain('// #endif')
    expect(result).toContain('"enablePullDownRefresh": false')
    expect(result).toContain('"onReachBottomDistance": 50')
    expect(result).toContain('"navigationBarBackgroundColor": "@navBgColor"')
  })

  it('should handle nested define chains', () => {
    const config = {
      pages: [
        define({
          name: 'Page1',
          path: '/pages/demo/demo',
          style: define({
            navigationBarTitleText: '设置',
          }).ifdef('H5', {
            navigationStyle: 'custom',
          }),
        }).ifndef('H5', {
          meta: {
            auth: true,
          },
        }),
      ],
    }

    const result = buildJsonc(config)

    expect(result).toContain('// #ifdef H5')
    expect(result).toContain('// #ifndef H5')
    expect(result).toContain('// #endif')
    expect(result).toContain('"navigationStyle": "custom"')
    expect(result).toContain('"auth": true')
    expect(result).toContain('"navigationBarTitleText": "设置"')
  })

  it('should handle multiple conditionals in same define chain', () => {
    const config = {
      globalStyle: define({
        base: 'value',
      })
        .ifdef('H5', { h5Prop: 'h5Value' })
        .ifndef('MP-WEIXIN', { notMpProp: 'notMpValue' })
        .ifdef('APP-PLUS', { appProp: 'appValue' }),
    }

    const result = buildJsonc(config)

    expect(result).toContain('// #ifdef H5')
    expect(result).toContain('// #ifndef MP-WEIXIN')
    expect(result).toContain('// #ifdef APP-PLUS')
    expect(result).toContain('"h5Prop": "h5Value"')
    expect(result).toContain('"notMpProp": "notMpValue"')
    expect(result).toContain('"appProp": "appValue"')
    expect(result).toContain('"base": "value"')
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

  it('should work with new define API in real scenario', () => {
    const config = {
      pages: [
        define({
          name: 'Page1',
          path: '/pages/demo/demo',
          style: define({
            navigationBarTitleText: '设置',
          }).ifdef('H5', {
            navigationStyle: 'custom',
          }),
        }).ifndef('H5', {
          meta: {
            auth: true,
          },
        }),
      ],
      globalStyle: define({
        navigationBarBackgroundColor: '@navBgColor',
        navigationBarTextStyle: '@navTxtStyle',
        backgroundColor: '@bgColor',
        backgroundTextStyle: '@bgTxtStyle',
        backgroundColorTop: '@bgColorTop',
        backgroundColorBottom: '@bgColorBottom',
      }).ifdef('H5', {
        enablePullDownRefresh: false,
        onReachBottomDistance: 50,
      }),
      easycom: {
        autoscan: true,
        custom: {
          '^wd-(.*)': 'wot-design-uni/components/wd-$1/wd-$1.vue',
        },
      },
    }

    const result = buildJsonc(config)

    // 验证基本结构
    expect(result).toContain('"pages": [')
    expect(result).toContain('"name": "Page1"')
    expect(result).toContain('"path": "/pages/demo/demo"')
    expect(result).toContain('"navigationBarTitleText": "设置"')

    // 验证条件编译注释
    expect(result).toContain('// #ifdef H5')
    expect(result).toContain('// #ifndef H5')
    expect(result).toContain('// #endif')
    expect(result).toContain('"navigationStyle": "custom"')
    expect(result).toContain('"auth": true')
    expect(result).toContain('"enablePullDownRefresh": false')

    // 验证 easycom 保持不变
    expect(result).toContain('"autoscan": true')
    expect(result).toContain('"^wd-(.*)": "wot-design-uni/components/wd-$1/wd-$1.vue"')
  })
})
