import type * as t from '@babel/types'
import fs from 'node:fs'
import { babelParse } from 'ast-kit'
import MagicString from 'magic-string'

/**
 * 解析配置文件中的条件编译注释位置信息，并将其转换为带注释标记的配置对象
 *
 * @description https://ast-explorer.dev/
 */
export function parseConditionalComments(source: string) {
  const code = fs.readFileSync(source, 'utf-8')
  const ast = babelParse(code, 'typescript', {
    attachComment: true,
    sourceType: 'module',
    cache: false,
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

  if (ast.comments && ast.comments.length > 0) {
    ast.comments.forEach((comment) => {
      if (comment.type !== 'CommentLine') {
        return
      }

      const line = comment.loc!.start.line
      // 查找该注释所属的节点是对象还是数组
      const parentNode = findCommentParentType(configObject!, line)

      if (parentNode === 'object') {
        s.overwrite(comment.start!, comment.end!, `"__comment_${line}__": "${comment.value}",`)
      }
      else if (parentNode === 'array') {
        s.overwrite(comment.start!, comment.end!, `["__comment_${line}__", "${comment.value}"],`)
      }
    })
  }

  return s.toString()
}

/**
 * 查找注释所属的节点是对象还是数组，其余情况返回 null
 */
function findCommentParentType(node: t.Node, line: number): 'object' | 'array' | null {
  if (node.type === 'ObjectExpression') {
    for (const prop of node.properties) {
      if (prop.type !== 'ObjectProperty') {
        continue
      }

      const k = getPropertyKey(prop)
      if (!k) {
        continue
      }

      // 检查注释位置是否在该属性范围内
      if (prop.loc && line >= prop.loc.start.line && line <= prop.loc.end.line) {
        // 如果属性值是对象或数组，继续深入查找
        if (prop.value.type === 'ObjectExpression') {
          return findCommentParentType(prop.value, line) || 'object'
        }
        else if (prop.value.type === 'ArrayExpression') {
          return findCommentParentType(prop.value, line) || 'array'
        }

        return 'object'
      }
    }
  }

  else if (node.type === 'ArrayExpression') {
    for (let i = 0; i < node.elements.length; i++) {
      const elem = node.elements[i]
      if (!elem || !elem.loc) {
        continue
      }

      // 检查注释位置是否在该元素范围内
      if (line >= elem.loc.start.line && line <= elem.loc.end.line) {
        if (elem.type === 'ObjectExpression') {
          return findCommentParentType(elem, line) || 'object'
        }
        else if (elem.type === 'ArrayExpression') {
          return findCommentParentType(elem, line) || 'array'
        }

        return 'array'
      }
    }
  }

  return null
}

/**
 * 获取属性的键名
 */
function getPropertyKey(prop: t.ObjectProperty | t.ObjectMethod): string | null {
  if (prop.key.type === 'Identifier') {
    // 普通标识符，如: { name: 'value' }
    return prop.key.name
  }
  if (prop.key.type === 'StringLiteral') {
    // 字符串字面量，如: { 'my-key': 'value' }
    return prop.key.value
  }
  return null
}
