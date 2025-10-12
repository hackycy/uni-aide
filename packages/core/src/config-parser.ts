import type * as t from '@babel/types'
import fs from 'node:fs'
import { babelParse } from 'ast-kit'
import MagicString from 'magic-string'

// type ConditionalType = 'ifdef' | 'ifndef'

/**
 * 条件编译块信息
 */
// interface ConditionalBlock {
//   type: ConditionalType
//   condition: string
//   startLine: number
//   endLine: number
// }

/**
 * 解析配置文件中的条件编译注释位置信息
 *
 * @description https://ast-explorer.dev/
 */
export function parseConditionalComments(source: string) {
  const code = fs.readFileSync(source, 'utf-8')
  const ast = babelParse(code, 'typescript', {
    attachComment: true,
    sourceType: 'module',
  })

  // 找到 export default 对应的节点
  const exportDefaultNode = ast.body.find(node => node.type === 'ExportDefaultDeclaration') as t.ExportDefaultDeclaration | undefined
  if (!exportDefaultNode) {
    throw new Error('config file must have export default')
  }

  // 配置对象
  let configObject: t.ObjectExpression | undefined

  if (exportDefaultNode.declaration.type === 'ObjectExpression') {
    // export default { ... }
    configObject = exportDefaultNode.declaration
  }
  else if (exportDefaultNode.declaration.type === 'CallExpression') {
    // export default fn({ ... })
    const callExpression = exportDefaultNode.declaration
    if (callExpression.arguments.length > 0 && callExpression.arguments[0].type === 'ObjectExpression') {
      configObject = callExpression.arguments[0]
    }
  }

  if (!configObject) {
    throw new Error('Could not find config object')
  }

  const s = new MagicString(code)
  // 条件编译注释替换
  if (ast.comments && ast.comments.length > 0) {
    ast.comments.forEach((comment) => {
      if (comment.type !== 'CommentLine') {
        return
      }

      const ifdefMatch = comment.value.trim().match(/^#(ifdef|ifndef)\s+(\S.*)$/)
      if (ifdefMatch) {
        // TODO
      }
    })
  }

  return `${s.toString()}`
}
