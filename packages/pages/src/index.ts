import type { PagesConfig } from '@vite-plugin-uni/types/pages'
import type { Plugin } from 'vite'
import type { UniPagesOptions } from './types'

export * from './types'

/**
 * define helper
 */
export function defineUniPages(config: PagesConfig): PagesConfig {
  return config
}

export async function VitePluginUniPages(_options: UniPagesOptions = {}): Promise<Plugin> {
  return {
    name: '@vite-plugin-uni/pages',
    enforce: 'pre',
  }
}

export default VitePluginUniPages
