import { describe, expect, it } from 'vitest'
import { buildJsonc, define } from '../src/index'

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
