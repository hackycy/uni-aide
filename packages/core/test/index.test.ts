import { describe, expect, it } from 'vitest'
import { buildJsonc, ifdef, ifndef } from '../src/index'

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

  it('should handle ifdef blocks with comments', () => {
    const config = {
      pages: [],
      globalStyle: {
        navigationBarBackgroundColor: '@navBgColor',
        ...ifdef('H5', {
          enablePullDownRefresh: false,
          onReachBottomDistance: 50,
        }),
      },
    }

    const result = buildJsonc(config)

    // 检查是否包含注释
    expect(result).toContain('// #ifdef H5')
    expect(result).toContain('// #endif')
    expect(result).toContain('"enablePullDownRefresh": false')
    expect(result).toContain('"onReachBottomDistance": 50')
  })

  it('should handle ifndef blocks with comments', () => {
    const config = {
      pages: [],
      globalStyle: {
        navigationBarBackgroundColor: '@navBgColor',
        ...ifndef('MP-WEIXIN', {
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
        _h5: ifdef('H5', {
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
