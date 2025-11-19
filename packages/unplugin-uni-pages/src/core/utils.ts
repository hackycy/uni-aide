import type { SFCBlock, SFCDescriptor, SFCParseOptions } from '@vue/compiler-sfc'
import type { ScanPageRouteBlock } from '../types'
import { jsoncParse } from '@uni-aide/core'
import { parse as VueParser } from '@vue/compiler-sfc'
import { DEFAULT_SEQ } from './constants'

export function parseSFC(code: string, options?: SFCParseOptions): SFCDescriptor {
  return (
    VueParser(code, {
      pad: 'space',
      ...options,
    }).descriptor
    // for @vue/compiler-sfc ^2.7
    || (VueParser as any)({
      source: code,
      ...options,
    })
  )
}

/**
 * Replace backslash to slash
 *
 * @category String
 */
export function slash(str: string) {
  return str.replace(/\\/g, '/')
}

export function getRouteSfcBlock(sfc?: SFCDescriptor): SFCBlock[] | undefined {
  return sfc?.customBlocks.filter(b => b.type === 'route')
}

export function parseSeq(seq: any): number {
  const n = Number(seq)
  return Number.isNaN(n) ? DEFAULT_SEQ : n
}

/**
 * Define a non-writable and non-configurable property on an object
 */
export function forbiddenOverwritePagePath(obj: Record<string, any>, key: 'path' | 'pagePath', value: string) {
  Object.defineProperty(obj, key, {
    value,
    writable: false,
    configurable: false,
    enumerable: true,
  })
  return obj
}

export function parseCustomBlock(block: SFCBlock, filePath: string): ScanPageRouteBlock | null {
  if (!block) {
    return null
  }

  const lang: ScanPageRouteBlock['lang'] = (block.lang ?? 'json') as ScanPageRouteBlock['lang']
  let content: Record<string, any> | undefined

  if (lang === 'json') {
    try {
      content = JSON.parse(block.content) as Record<string, any>
    }
    catch (err: any) {
      throw new Error(`Invalid JSON format of <${block.type}> content in ${filePath}\n${err.message}`)
    }
  }
  else if (lang === 'jsonc' || lang === 'json5') {
    try {
      content = jsoncParse(block.content) as Record<string, any>
    }
    catch (err: any) {
      throw new Error(`Invalid ${lang.toUpperCase()} format of <${block.type}> content in ${filePath}\n${err.message}`)
    }
  }

  return {
    lang,
    part: `${block.attrs?.part ?? 'page'}` as ScanPageRouteBlock['part'],
    seq: parseSeq(block.attrs?.seq),
    root: `${block.attrs?.root || ''}` || undefined,
    content: content || {},
  }
}

export function extsToGlob(extensions: string[]) {
  return extensions.length > 1 ? `{${extensions.join(',')}}` : (extensions[0] || '')
}
