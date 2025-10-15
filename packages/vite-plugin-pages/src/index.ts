import type { UserPagesConfig } from '@uni-aide/types/pages'
import type { Plugin } from 'vite'
import type { UniPagesOptions } from './types'
import fs from 'node:fs'
import { DEFAULT_PAGES_CONFIG } from './const'
import { PageContext } from './context'

export * from './types'
export * from '@uni-aide/types/pages'

/**
 * define helper
 */
export function defineConfig(config: UserPagesConfig) {
  return config
}

export function checkPagesJsonFileSync(jsonPath: string) {
  try {
    fs.accessSync(jsonPath, fs.constants.F_OK)
  }
  catch {
    // 文件不存在，创建新文件

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(DEFAULT_PAGES_CONFIG, null, 2), { encoding: 'utf-8' })
    }
    catch {
      // ignore
    }
  }
}

export async function VitePluginUniPages(options: UniPagesOptions = {}): Promise<Plugin> {
  let ctx: PageContext

  return {
    name: '@uni-aide/vite-plugin-pages',
    enforce: 'pre',
    async configResolved(config) {
      ctx = new PageContext(options, config.root)
      ctx.setLogger(config.logger)

      await ctx.writePagesJSON()
    },
    configureServer(server) {
      ctx.setupViteServer(server)
    },
  }
}

export default VitePluginUniPages
