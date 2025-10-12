import { inspect } from 'node:util'
import { parse } from 'comment-json'

console.log(inspect(parse(
  `
{
  // #ifdef APP-PLUS
  "name": "hello",
  // #endif

  "pages": [
    // #ifdef MP-WEIXIN
  ]
}
`,
), { showHidden: true, depth: null }))
