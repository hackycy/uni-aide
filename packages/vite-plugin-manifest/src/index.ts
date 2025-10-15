import type { UserManifestConfig } from '@uni-aide/types/manifest'
import type { Plugin } from 'vite'
import type { UniManifestOptions } from './types'
import fs from 'node:fs'
import { DEFAULT_MANIFEST_CONFIG } from './const'
import { ManifestContext } from './context'

export * from './types'
export * from '@uni-aide/types/manifest'

/**
 * define helper
 */
export function defineConfig(config: UserManifestConfig) {
  return config
}

export function checkManifestJsonFileSync(jsonPath: string) {
  try {
    fs.accessSync(jsonPath, fs.constants.F_OK)
  }
  catch {
    // 文件不存在，创建新文件

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(DEFAULT_MANIFEST_CONFIG, null, 2), { encoding: 'utf-8' })
    }
    catch {
      // ignore
    }
  }
}

export async function VitePluginUniManifest(options: UniManifestOptions = {}): Promise<Plugin> {
  let ctx: ManifestContext

  return {
    name: '@uni-aide/vite-plugin-manifest',
    enforce: 'pre',
    async configResolved(config) {
      ctx = new ManifestContext(options, config.root)
      ctx.setLogger(config.logger)

      await ctx.writeManifestJSON()
    },
    configureServer(server) {
      ctx.setupViteServer(server)
    },
  }
}

export default VitePluginUniManifest
