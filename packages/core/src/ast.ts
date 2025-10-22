import type * as t from '@babel/types'

/**
 * 查找注释所属的节点
 * 通过递归遍历 AST，找到包含该注释的最内层（最具体）的节点
 */
export function findCommentBelongsToNode(comment: t.Comment, ast: t.Program): t.Node | null {
  if (!comment.loc) {
    return null
  }

  let foundNode: t.Node | null = null
  let minRange = Number.POSITIVE_INFINITY

  /**
   * 递归遍历节点，找到包含注释的最小节点
   */
  function traverse(node: t.Node): void {
    if (!node.loc) {
      return
    }

    // 检查注释是否在当前节点的范围内
    const isCommentInNode = comment.loc!.start.line >= node.loc.start.line
      && comment.loc!.end.line <= node.loc.end.line
      && comment.loc!.start.column >= node.loc.start.column
      && comment.loc!.end.column <= node.loc.end.column

    if (isCommentInNode) {
      // 计算节点范围，找到最小的（最内层的）节点
      const range = (node.loc.end.line - node.loc.start.line) * 10000
        + (node.loc.end.column - node.loc.start.column)

      if (range < minRange) {
        minRange = range
        foundNode = node
      }
    }

    // 递归遍历子节点
    for (const key in node) {
      if (key === 'loc' || key === 'comments' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') {
        continue
      }

      const value = (node as any)[key]

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item && typeof item === 'object' && item.type) {
            traverse(item)
          }
        })
      }
      else if (value && typeof value === 'object' && value.type) {
        traverse(value)
      }
    }
  }

  // 从根节点开始遍历
  ast.body.forEach(node => traverse(node))

  return foundNode
}
