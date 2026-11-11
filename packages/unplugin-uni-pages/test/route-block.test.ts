import { describe, expect, it } from 'vitest'
import { extractRouteBlocks } from '../src/core/route-block'
import { getRouteSfcBlock, parseCustomBlock, parseSFC } from '../src/core/utils'

function referenceBlocks(code: string): Array<{
  lang: string | undefined
  attrs: Record<string, string | true> | undefined
  content: string
}> {
  return getRouteSfcBlock(parseSFC(code, { filename: 'fixture.vue' }))
    ?.map(block => ({
      lang: block.lang,
      attrs: block.attrs,
      content: block.content.trim(),
    })) ?? []
}

function lightweightBlocks(code: string): Array<{
  lang: string | undefined
  attrs: Record<string, string | true> | undefined
  content: string
}> {
  return extractRouteBlocks(code).map(block => ({
    lang: block.lang,
    attrs: block.attrs,
    content: block.content.trim(),
  }))
}

// 每个语料同时给出期望的 route 块数量，避免“两边都为空”的假等价。
const FIXTURES: Array<[name: string, code: string, routes: number]> = [
  [
    '标准 template + route',
    '<template>\n  <view />\n</template>\n\n<route lang="jsonc">\n{ "a": 1 }\n</route>\n',
    1,
  ],
  [
    'route 位于 template 之前',
    '<route lang="json">\n{"a":1}\n</route>\n\n<route lang="json" part="tabBar" seq="0">\n{"b":2}\n</route>\n\n<template><view /></template>\n',
    2,
  ],
  [
    'template 内的 route 被忽略',
    '<template>\n  <route lang="json">{"fake":1}</route>\n  <template v-if="x"><view /></template>\n</template>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    'script 字符串中的 route 被忽略',
    '<template><view /></template>\n<script>const s = "<route lang=\\"json\\">x</route>"</script>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    '自定义块内的 route 被忽略',
    '<template><view /></template>\n<docs>\n<route lang="json">{"nested":1}</route>\n</docs>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    '大写 Route 不识别',
    '<template><view /></template>\n<route lang="json">{"b":2}</route>\n<Route lang="json">{"a":1}</Route>\n',
    1,
  ],
  [
    '大写 Route 按 RCDATA 吞掉后续内容',
    '<template><view /></template>\n<Route lang="json">{"a":1}</Route>\n<route lang="json">{"b":2}</route>\n',
    0,
  ],
  [
    '空块与纯空白块被忽略',
    '<template><view /></template>\n<route lang="json"></route>\n<route lang="json">   \n </route>\n',
    0,
  ],
  [
    '仅注释的块保留',
    '<template><view /></template>\n<route lang="json"><!--x--></route>\n',
    1,
  ],
  [
    '自闭合块与带 src 的自闭合块',
    '<template><view /></template>\n<route lang="json" />\n<route lang="json" src="./x.json" />\n',
    1,
  ],
  [
    '未闭合块（尾部非空）',
    '<template><view /></template>\n<route lang="json">{"a":1}\n',
    1,
  ],
  [
    '未闭合块（尾部空白）',
    '<template><view /></template>\n<route lang="json">   \n',
    0,
  ],
  [
    '内容包含标签与伪闭合',
    '<template><view /></template>\n<route lang="json">{"a":"<b>","c":"</routex>","d":"</ route>"}</route>\n',
    1,
  ],
  [
    '属性写法',
    '<template><view /></template>\n<route lang=\'json5\' part=\'subPackage\' seq=2 entry>{}</route>\n<route :part="p" lang="json">{}</route>\n',
    2,
  ],
  [
    '嵌套同名自定义块',
    '<template><view /></template>\n<docs><docs>x</docs><route lang="json">{}</route></docs>\n<route lang="json">{"real":1}</route>\n',
    2,
  ],
  [
    'template 闭合大小写',
    '<template><view /></TEMPLATE>\n<route lang="json">{}</route>\n',
    1,
  ],
  [
    'jsonc 注释',
    '<template><view /></template>\n<route lang="jsonc">\n{\n  // note\n  "a": 1\n}\n</route>\n',
    1,
  ],
  [
    '闭合标签带空白',
    '<template><view /></template>\n<route lang="json">{}</route >\n',
    1,
  ],
  [
    'script/template/style 顺序',
    '<script setup lang="ts">\nconst a = 1\n</script>\n<template><view /></template>\n<style scoped>.a{}</style>\n<route lang="json">{"a":1}</route>\n',
    1,
  ],
  [
    '自闭合 template',
    '<template />\n<route lang="json">{}</route>\n',
    1,
  ],
  [
    'style 中的 <',
    '<style>.a::before{content:"<"}</style>\n<route lang="json">{}</route>\n',
    1,
  ],
  [
    'template 内未闭合 div',
    '<template>\n<div>\n</template>\n<route lang="json">{}</route>\n',
    1,
  ],
  [
    '带 src 且有内容',
    '<template><view /></template>\n<route lang="json" src="./x.json">{"a":1}</route>\n',
    1,
  ],
  [
    'pug template 中的 <template> 文本',
    '<template lang="pug">\n  div\n  // <template>\n</template>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    'pug template 普通内容',
    '<template lang="pug">\n  div\n</template>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    '插值中的 <template>',
    '<template>\n  {{ "<template>" }}\n</template>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    'template 内 script rawtext',
    '<template>\n<script>const x = "<template>"</script>\n</template>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    'template 内 textarea rawtext',
    '<template>\n<textarea><template></textarea>\n</template>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    'part 空值',
    '<template><view /></template>\n<route lang="json" part="">{"a":1}</route>\n',
    1,
  ],
  [
    'lang 空值',
    '<template><view /></template>\n<route lang="">{"a":1}</route>\n',
    1,
  ],
  [
    '无引号 src=x/>',
    '<template><view /></template>\n<route lang="json" src=x/>{"a":1}\n',
    1,
  ],
  [
    'lang="HTML" 触发 RCDATA',
    '<template lang="HTML">\n  x <template>\n</template>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    '重复 lang 以先触发者为准',
    '<template lang="pug" lang="html">\n  x <template>\n</template>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    '自闭合 pug template',
    '<template lang="pug" />\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
  [
    'pug 中的 template 关键字',
    '<template lang="pug">\n  template\n    div\n</template>\n<route lang="json">{"real":1}</route>\n',
    1,
  ],
]

describe('extractRouteBlocks compiler-sfc 等价性', () => {
  for (const [name, code, routes] of FIXTURES) {
    it(name, () => {
      const actual = lightweightBlocks(code)
      expect(actual).toHaveLength(routes)
      expect(actual).toEqual(referenceBlocks(code))
    })
  }
})

describe('extractRouteBlocks 输出', () => {
  it('保留 lang / attrs / 原始内容', () => {
    const code = [
      '<template>',
      '  <view />',
      '</template>',
      '',
      '<route lang="jsonc" part="subPackage" seq="2">',
      '{ "style": { "navigationBarTitleText": "Hi" } }',
      '</route>',
    ].join('\n')

    expect(extractRouteBlocks(code)).toEqual([
      {
        type: 'route',
        lang: 'jsonc',
        attrs: {
          lang: 'jsonc',
          part: 'subPackage',
          seq: '2',
        },
        content: '\n{ "style": { "navigationBarTitleText": "Hi" } }\n',
      },
    ])
  })

  it('可被 parseCustomBlock 直接消费', () => {
    const code = '<template><view /></template>\n<route lang="json" seq="3">{"a":1}</route>\n'
    const [block] = extractRouteBlocks(code)

    expect(parseCustomBlock(block, '/tmp/page.vue')).toEqual({
      lang: 'json',
      part: 'page',
      seq: 3,
      content: { a: 1 },
      file: '/tmp/page.vue',
    })
  })
})
