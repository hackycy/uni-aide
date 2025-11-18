import type { SFCBlock, SFCDescriptor, SFCParseOptions } from '@vue/compiler-sfc'
import type { ScanPageRouteBlock } from '../types'
import { parse as VueParser } from '@vue/compiler-sfc'

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

export function getRouteSfcBlock(sfc?: SFCDescriptor): SFCBlock | undefined {
  return sfc?.customBlocks.find(b => b.type === 'route')
}

export function parseCustomBlock(block: SFCBlock): ScanPageRouteBlock | null {
  console.log('[unplugin-uni-pages] Found route block in', block.attrs)
  return null
}

export function extsToGlob(extensions: string[]) {
  return extensions.length > 1 ? `{${extensions.join(',')}}` : (extensions[0] || '')
}
