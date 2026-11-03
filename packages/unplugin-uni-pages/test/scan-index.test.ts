import type { ScanPageRouteBlock } from '../src/types'
import { describe, expect, it } from 'vitest'
import { ScanIndex } from '../src/core/scan-index'

function routeBlock(part: ScanPageRouteBlock['part'], seq = 0): ScanPageRouteBlock {
  return {
    part,
    seq,
    content: {},
    file: '/tmp/page.vue',
  }
}

describe('scan index', () => {
  it('同一文件的多个 part 分别进入三张派生表', () => {
    const index = new ScanIndex()
    index.set({
      file: '/tmp/page.vue',
      routePath: 'pages/page',
      blocks: [routeBlock('page'), routeBlock('tabBar')],
    })

    expect(index.pages.get('pages/page')?.part).toBe('page')
    expect(index.tabBar.get('pages/page')?.part).toBe('tabBar')
    expect(index.subPackages.size).toBe(0)
  })

  it('同一 part 的多个块后者覆盖前者', () => {
    const index = new ScanIndex()
    const first = routeBlock('page', 1)
    const second = routeBlock('page', 2)
    index.set({
      file: '/tmp/page.vue',
      routePath: 'pages/page',
      blocks: [first, second],
    })

    expect(index.pages.get('pages/page')).toBe(second)
  })

  it('替换文件记录后，旧分类的 key 消失', () => {
    const index = new ScanIndex()
    index.set({
      file: '/tmp/page.vue',
      routePath: 'pages/page',
      blocks: [routeBlock('page')],
    })
    index.set({
      file: '/tmp/page.vue',
      routePath: 'pages/page',
      blocks: [routeBlock('subPackage')],
    })

    expect(index.pages.has('pages/page')).toBe(false)
    expect(index.subPackages.has('pages/page')).toBe(true)
  })

  it('空记录不产生派生项', () => {
    const index = new ScanIndex()
    index.set({
      file: '/tmp/page.vue',
      routePath: 'pages/page',
      blocks: [],
    })

    expect(index.pages.size).toBe(0)
    expect(index.subPackages.size).toBe(0)
    expect(index.tabBar.size).toBe(0)
    expect(index.has('/tmp/page.vue')).toBe(true)
  })

  it('delete 移除记录与派生项', () => {
    const index = new ScanIndex()
    index.set({
      file: '/tmp/page.vue',
      routePath: 'pages/page',
      blocks: [routeBlock('page')],
    })

    expect(index.delete('/tmp/page.vue')).toBe(true)
    expect(index.delete('/tmp/page.vue')).toBe(false)
    expect(index.pages.size).toBe(0)
  })

  it('deleteUnder 只删除目录下的记录', () => {
    const index = new ScanIndex()
    index.set({
      file: '/tmp/pages/a.vue',
      routePath: 'pages/a',
      blocks: [routeBlock('page')],
    })
    index.set({
      file: '/tmp/pages/ab.vue',
      routePath: 'pages/ab',
      blocks: [routeBlock('page')],
    })
    index.set({
      file: '/tmp/pages/a/index.vue',
      routePath: 'pages/a/index',
      blocks: [routeBlock('page')],
    })

    expect(index.deleteUnder('/tmp/pages/a')).toBe(true)
    expect(index.has('/tmp/pages/a.vue')).toBe(true)
    expect(index.has('/tmp/pages/a/index.vue')).toBe(false)
    expect(index.has('/tmp/pages/ab.vue')).toBe(true)
  })

  it('deleteUnder 在没有 route 块时返回 false', () => {
    const index = new ScanIndex()
    index.set({
      file: '/tmp/pages/a.vue',
      routePath: 'pages/a',
      blocks: [],
    })

    expect(index.deleteUnder('/tmp/pages')).toBe(false)
    expect(index.has('/tmp/pages/a.vue')).toBe(false)
  })

  it('replaceAll 重建索引', () => {
    const index = new ScanIndex()
    index.set({
      file: '/tmp/old.vue',
      routePath: 'pages/old',
      blocks: [routeBlock('page')],
    })
    index.replaceAll([
      {
        file: '/tmp/new.vue',
        routePath: 'pages/new',
        blocks: [routeBlock('page')],
      },
    ])

    expect(index.has('/tmp/old.vue')).toBe(false)
    expect(index.has('/tmp/new.vue')).toBe(true)
    expect(index.pages.has('pages/new')).toBe(true)
  })
})
