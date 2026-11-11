export interface SfcBlockSource {
  type: string
  lang?: string
  attrs?: Record<string, string | true>
  content: string
}

export interface RouteBlockSource extends SfcBlockSource {
  type: 'route'
  attrs: Record<string, string | true>
}

interface OpenTag {
  name: string
  attrs: Record<string, string | true>
  lang?: string
  selfClosing: boolean
  templateRcdata: boolean
  end: number
}

interface CloseTag {
  start: number
  end: number
}

const RAW_TEXT_TAGS = new Set(['script', 'style', 'title', 'textarea'])
const TAG_NAME_RE = /^[a-z][^\s/>]*/i

function isWhitespace(char: string | undefined): boolean {
  return char === ' ' || char === '\n' || char === '\t' || char === '\f' || char === '\r'
}

function isTagStart(char: string | undefined): boolean {
  return char !== undefined && /[a-z]/i.test(char)
}

function isDirectiveName(name: string): boolean {
  const first = name[0]
  return first === ':' || first === '@' || first === '#' || first === '.' || name.startsWith('v-')
}

/**
 * 解析顶层开标签。语义对齐 `@vue/compiler-sfc` 3.4.21：
 * - 引号内的 `>` 不结束标签；
 * - 无引号属性值包含 `/`，只有属性名位置的 `/` 才是自闭合；
 * - `lang=""` 记为布尔属性，但 `block.lang` 保留空串。
 */
function readOpenTag(code: string, start: number): OpenTag | null {
  let quote: string | undefined
  let tagEnd = -1

  for (let index = start + 1; index < code.length; index++) {
    const char = code[index]
    if (quote) {
      if (char === quote) {
        quote = undefined
      }
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '>') {
      tagEnd = index
      break
    }
  }

  if (tagEnd < 0) {
    return null
  }

  const inner = code.slice(start + 1, tagEnd)
  const nameMatch = TAG_NAME_RE.exec(inner)
  if (!nameMatch) {
    return null
  }

  const name = nameMatch[0]
  const attrs: Record<string, string | true> = {}
  let lang: string | undefined
  let selfClosing = false
  let langRcdata = false
  let index = name.length

  while (index < inner.length) {
    while (index < inner.length && isWhitespace(inner[index])) {
      index++
    }
    if (index >= inner.length) {
      break
    }

    if (inner[index] === '/') {
      let next = index + 1
      while (next < inner.length && isWhitespace(inner[next])) {
        next++
      }
      selfClosing = next === inner.length
      break
    }

    const nameStart = index
    while (
      index < inner.length
      && !isWhitespace(inner[index])
      && inner[index] !== '='
      && inner[index] !== '/'
      && inner[index] !== '>'
    ) {
      index++
    }
    if (index === nameStart) {
      index++
      continue
    }

    const attrName = inner.slice(nameStart, index)
    while (index < inner.length && isWhitespace(inner[index])) {
      index++
    }

    let value: string | undefined
    if (inner[index] === '=') {
      index++
      while (index < inner.length && isWhitespace(inner[index])) {
        index++
      }

      const quoteChar = inner[index]
      if (quoteChar === '"' || quoteChar === '\'') {
        const valueStart = ++index
        while (index < inner.length && inner[index] !== quoteChar) {
          index++
        }
        value = inner.slice(valueStart, index)
        if (index < inner.length) {
          index++
        }
      }
      else {
        const valueStart = index
        while (index < inner.length && !isWhitespace(inner[index])) {
          index++
        }
        value = inner.slice(valueStart, index)
      }
    }

    if (isDirectiveName(attrName)) {
      continue
    }

    attrs[attrName] = value === undefined || value === '' ? true : value
    if (attrName === 'lang') {
      lang = value
      if (value && value !== 'html') {
        langRcdata = true
      }
    }
  }

  return {
    name,
    attrs,
    lang,
    selfClosing,
    templateRcdata: name === 'template' && !selfClosing && langRcdata,
    end: tagEnd + 1,
  }
}

/**
 * SFC 根对非 template 块使用 RCDATA：闭合标签不区分大小写，
 * 且只看第一个 `</name` 后跟空白或 `>`。
 */
function findRawClose(code: string, from: number, name: string): CloseTag | null {
  let index = from

  while (index < code.length) {
    const tagStart = code.indexOf('</', index)
    if (tagStart < 0) {
      return null
    }

    let cursor = tagStart + 2
    let offset = 0
    while (
      offset < name.length
      && cursor < code.length
      && (code.charCodeAt(cursor) | 32) === name.charCodeAt(offset)
    ) {
      cursor++
      offset++
    }

    if (offset === name.length) {
      const next = code[cursor]
      if (next === undefined || next === '>' || isWhitespace(next)) {
        const end = code.indexOf('>', cursor)
        return end < 0 ? null : { start: tagStart, end: end + 1 }
      }
    }

    index = tagStart + 2
  }

  return null
}

/**
 * template 按 HTML 嵌套解析：跳过注释、插值与 rawtext 元素，
 * 只有同名闭合标签会减少深度（大小写不敏感）。
 */
function findTemplateClose(code: string, from: number): CloseTag | null {
  let depth = 1
  let index = from

  while (index < code.length) {
    const tagStart = code.indexOf('<', index)
    const interpolationStart = code.indexOf('{{', index)

    if (interpolationStart >= 0 && (tagStart < 0 || interpolationStart < tagStart)) {
      const interpolationEnd = code.indexOf('}}', interpolationStart + 2)
      index = interpolationEnd < 0 ? code.length : interpolationEnd + 2
      continue
    }

    if (tagStart < 0) {
      return null
    }

    if (code.startsWith('<!--', tagStart)) {
      const commentEnd = code.indexOf('-->', tagStart + 4)
      if (commentEnd < 0) {
        return null
      }
      index = commentEnd + 3
      continue
    }

    if (code[tagStart + 1] === '/') {
      let cursor = tagStart + 2
      const nameStart = cursor
      while (cursor < code.length && !isWhitespace(code[cursor]) && code[cursor] !== '>') {
        cursor++
      }
      const name = code.slice(nameStart, cursor)
      while (cursor < code.length && code[cursor] !== '>') {
        cursor++
      }
      if (cursor >= code.length) {
        return null
      }
      if (name.toLowerCase() === 'template') {
        depth--
        if (depth === 0) {
          return { start: tagStart, end: cursor + 1 }
        }
      }
      index = cursor + 1
      continue
    }

    if (!isTagStart(code[tagStart + 1])) {
      index = tagStart + 1
      continue
    }

    const open = readOpenTag(code, tagStart)
    if (!open) {
      index = tagStart + 1
      continue
    }

    if (RAW_TEXT_TAGS.has(open.name) && !open.selfClosing) {
      const close = findRawClose(code, open.end, open.name)
      index = close ? close.end : code.length
      continue
    }

    if (open.name === 'template' && !open.selfClosing) {
      depth++
    }
    index = open.end
  }

  return null
}

/**
 * 轻量提取顶层 `<route>` 块，行为对齐 `@vue/compiler-sfc` 3.4.21
 * （`ignoreEmpty: true`、未闭合块内容为空串）。
 */
export function extractRouteBlocks(code: string): RouteBlockSource[] {
  const blocks: RouteBlockSource[] = []
  let index = 0

  while (index < code.length) {
    const tagStart = code.indexOf('<', index)
    if (tagStart < 0) {
      break
    }

    if (code.startsWith('<!--', tagStart)) {
      const commentEnd = code.indexOf('-->', tagStart + 4)
      index = commentEnd < 0 ? code.length : commentEnd + 3
      continue
    }

    if (code[tagStart + 1] === '/') {
      const end = code.indexOf('>', tagStart + 2)
      index = end < 0 ? code.length : end + 1
      continue
    }

    if (!isTagStart(code[tagStart + 1])) {
      index = tagStart + 1
      continue
    }

    const open = readOpenTag(code, tagStart)
    if (!open) {
      index = tagStart + 1
      continue
    }

    const close = open.selfClosing
      ? { start: open.end, end: open.end }
      : open.name === 'template'
        ? (open.templateRcdata ? findRawClose(code, open.end, 'template') : findTemplateClose(code, open.end))
        : findRawClose(code, open.end, open.name)

    if (open.name === 'route') {
      const hasSrc = 'src' in open.attrs
      const raw = open.selfClosing
        ? ''
        : close
          ? code.slice(open.end, close.start)
          : code.slice(open.end)

      if (raw.trim() || hasSrc) {
        blocks.push({
          type: 'route',
          lang: open.lang,
          attrs: open.attrs,
          content: close ? raw : '',
        })
      }
    }

    if (!close) {
      break
    }
    index = close.end
  }

  return blocks
}
