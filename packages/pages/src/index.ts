import type { PagesConfig } from '@vite-plugin-uni/types/pages'
import type { Plugin } from 'vite'
import type { UniPagesOptions } from './types'
import process from 'node:process'
import { loadDefineConfig } from '@vite-plugin-uni/core'
import { PAGE_CONFIG_FILE } from './const'

export * from './types'
export * from '@vite-plugin-uni/types/pages'

/**
 * define helper
 */
export function defineUniPages(config: PagesConfig) {
  return config
}

export async function VitePluginUniPages(_options: UniPagesOptions = {}): Promise<Plugin> {
  let root: string = process.cwd()

  return {
    name: '@vite-plugin-uni/pages',
    enforce: 'pre',
    async configResolved(config) {
      root = config.root

      const [_, sources] = await loadDefineConfig(PAGE_CONFIG_FILE, root)
      config.logger.info(`[vite-plugin-uni/pages] config resolved: ${sources}`)
    },
  }
}

export default VitePluginUniPages
