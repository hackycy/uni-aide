import type * as t from '@babel/types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { babelParse } from 'ast-kit'
import MagicString from 'magic-string'
import { loadConfig } from 'unconfig'

const AVAILABLE_CONFIG_EXTENSIONS = ['ts', 'mts', 'js', 'mjs']
const COMMENT_SYMBOL_PREFIX = '__uni_aide_comment__'

export interface ParseOptions {
  /**
   * 工作目录
   * @default process.cwd()
   */
  cwd?: string

  /**
   * 默认配置对象
   */
  defaults?: any
}

/**
 * 解析配置文件
 * @description https://ast-explorer.dev/
 */
export async function parse(name: string, options: ParseOptions = {}) {
  const cwd = options.cwd || process.cwd()

  const preprocessJson = await loadConfigFile(name, cwd, options.defaults)

  const resultCode = `export default ${preprocessJson}`
  const ast = babelParse(resultCode, 'ts', {
    sourceType: 'module',
    cache: false,
  })

  const s = new MagicString(resultCode)

  // 找到 export default 对应的节点
  const exportDefaultNode = ast.body.find(node => node.type === 'ExportDefaultDeclaration') as t.ExportDefaultDeclaration | undefined
  if (!exportDefaultNode) {
    throw new Error('internal parser error: config file must have export default')
  }

  // 配置对象
  let configObject: t.ObjectExpression | undefined

  if (exportDefaultNode.declaration.type === 'ObjectExpression') {
    // export default { ... }
    configObject = exportDefaultNode.declaration
  }

  if (!configObject) {
    throw new Error('internal parser error: could not find config object')
  }

  reverseComments(configObject, s)

  // 移除export default
  s.remove(exportDefaultNode.start!, exportDefaultNode.declaration.start!)

  return s.toString()
}

/**
 * 加载转换注释后的配置文件JSON字符串，用于二次处理
 */
export async function loadConfigFile(name: string, cwd: string, defaults?: any) {
  // 查找配置文件
  const configPath = findConfigFile(cwd, name)

  if (!configPath) {
    throw new Error(`Config file not found: ${name}`)
  }

  const configExt = path.extname(configPath).toLowerCase()
  const transformedCode = transformComments(configPath)

  // 生成临时文件
  const tempFilename = `${name}.timestamp-${Date.now()}`
  const tempFilePath = path.join(cwd, `${tempFilename}${configExt}`)
  fs.writeFileSync(tempFilePath, transformedCode, 'utf-8')

  // 加载临时文件
  const { config } = await loadConfig({
    sources: [
      {
        files: tempFilename,
        extensions: AVAILABLE_CONFIG_EXTENSIONS,
      },
    ],
    cwd,
    defaults,
  })

  // 删除临时文件
  fs.promises.rm(tempFilePath).catch(() => {})

  return JSON.stringify(config, null, 2)
}

/**
 * 查找配置文件
 */
export function findConfigFile(root: string, name: string) {
  const candidates = AVAILABLE_CONFIG_EXTENSIONS.map(ext => `${name}.${ext}`)
  for (const candidate of candidates) {
    const filePath = path.join(root, candidate)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }
  return null
}

/**
 * 反向转换注释标记为条件编译注释
 */
export function reverseComments(node: t.Node, s: MagicString) {
  if (node.type === 'ObjectExpression') {
    for (const prop of node.properties) {
      if (prop.type !== 'ObjectProperty') {
        continue
      }

      const k = getPropertyKey(prop)
      if (!k) {
        continue
      }

      if (k.startsWith(COMMENT_SYMBOL_PREFIX) && prop.value.type === 'StringLiteral') {
        // 替换为注释
        s.overwrite(prop.start!, prop.end!, `//${prop.value.value}`)
        // 如果有尾随逗号则删除
        const nextChar = s.original.charAt(prop.end!)
        if (nextChar === ',') {
          s.remove(prop.end!, prop.end! + 1)
        }
      }
      else if (prop.value.type === 'ObjectExpression' || prop.value.type === 'ArrayExpression') {
        reverseComments(prop.value, s)
      }
    }
  }
  else if (node.type === 'ArrayExpression') {
    for (let i = 0; i < node.elements.length; i++) {
      const elem = node.elements[i]
      if (!elem) {
        continue
      }

      if (elem.type === 'ObjectExpression') {
        reverseComments(elem, s)
      }
      else if (elem.type === 'ArrayExpression') {
        // 判断是否是注释标记数组
        if (elem.elements.length === 2
          && elem.elements[0]
          && elem.elements[0].type === 'StringLiteral'
          && (elem.elements[0] as t.StringLiteral).value.startsWith(COMMENT_SYMBOL_PREFIX)
          && elem.elements[1]
          && elem.elements[1].type === 'StringLiteral') {
          const commentValue = (elem.elements[1] as t.StringLiteral).value
          s.overwrite(elem.start!, elem.end!, `//${commentValue}`)
          // 如果有尾随逗号则删除
          const nextChar = s.original.charAt(elem.end!)
          if (nextChar === ',') {
            s.remove(elem.end!, elem.end! + 1)
          }
        }
        else {
          reverseComments(elem, s)
        }
      }
    }
  }
}

/**
 * 解析配置文件中的条件编译注释位置信息，并将其转换为带注释标记的配置对象
 */
export function transformComments(source: string) {
  const code = fs.readFileSync(source, 'utf-8')
  const ast = babelParse(code, 'ts', {
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
        s.overwrite(comment.start!, comment.end!, `"${COMMENT_SYMBOL_PREFIX}${line}": "${comment.value}",`)
      }
      else if (parentNode === 'array') {
        s.overwrite(comment.start!, comment.end!, `['${COMMENT_SYMBOL_PREFIX}${line}', "${comment.value}"],`)
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
