import { describe, expect, it, vi } from 'vitest'
import { unpluginFactory } from '../src/core/unplugin'
import * as utils from '../src/core/utils'

vi.mock('../src/core/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/utils')>()
  return {
    ...actual,
    parseSFC: vi.fn(actual.parseSFC),
  }
})

type TransformHook = (code: string, id: string) => unknown

function getTransform(): TransformHook {
  const plugin = unpluginFactory({}, {} as any) as {
    transform?: TransformHook | { handler: TransformHook }
  }
  const hook = plugin.transform
  if (!hook) {
    throw new Error('transform hook is missing')
  }
  return typeof hook === 'function' ? hook : hook.handler
}

const transform = getTransform()

describe('transform 快速守卫', () => {
  it('无 <route 的组件不调用 parseSFC', () => {
    const parseSFC = vi.mocked(utils.parseSFC)
    parseSFC.mockClear()

    expect(transform('<template><view /></template>', '/tmp/component.vue')).toBeNull()
    expect(parseSFC).not.toHaveBeenCalled()
  })

  it('含 route 的页面会解析并删除块内容', () => {
    const parseSFC = vi.mocked(utils.parseSFC)
    parseSFC.mockClear()

    const code = '<template>\n  <view />\n</template>\n\n<route lang="jsonc">\n{ "style": {} }\n</route>\n'
    expect(transform(code, '/tmp/page.vue')).toEqual({
      code: '<template>\n  <view />\n</template>\n\n<route lang="jsonc"></route>\n',
      map: expect.any(Object),
    })
    expect(parseSFC).toHaveBeenCalledTimes(1)
  })

  it('仅 script 字符串含 <route 时返回 null', () => {
    const code = '<template><view /></template>\n<script>const s = "<route>";</script>'
    expect(transform(code, '/tmp/component.vue')).toBeNull()
  })

  it('非页面扩展名直接返回 null', () => {
    expect(transform('<route lang="json">{}</route>', '/tmp/page.ts')).toBeNull()
  })
})
