import type { UserManifestConfig } from '@vite-plugin-uni/types/manifest'
import type { Plugin } from 'vite'
import type { UniManifestOptions } from './types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { buildJsonc, loadDefineConfig } from '@vite-plugin-uni/core'
import { MANIFEST_CONFIG_FILE, MANIFEST_JSON_FILE } from './const'

export * from './types'
export { define } from '@vite-plugin-uni/core'
export * from '@vite-plugin-uni/types/manifest'

/**
 * define helper
 */
export function defineConfig(config: UserManifestConfig) {
  return config
}

async function writeManifestJSON(path: string, json: string) {
  await fs.promises.writeFile(path, json, { encoding: 'utf-8' })
}

export async function VitePluginUniManifest(options: UniManifestOptions = {}): Promise<Plugin> {
  let root = process.cwd()
  let resolvedManifestJSONPath: string = ''
  let watchedFiles: string[] = []

  return {
    name: '@vite-plugin-uni/manifest',
    enforce: 'pre',
    async configResolved(config) {
      root = config.root
      resolvedManifestJSONPath = path.join(
        config.root,
        options.outDir ?? 'src',
        MANIFEST_JSON_FILE,
      )

      const [defineConfig, sources] = await loadDefineConfig(MANIFEST_CONFIG_FILE, config.root)
      watchedFiles = sources
      await writeManifestJSON(resolvedManifestJSONPath, buildJsonc(defineConfig))
    },
    configureServer(server) {
      if (watchedFiles && watchedFiles.length > 0) {
        server.watcher.add(watchedFiles)
      }

      server.watcher.on('add', handleFileChange)
      server.watcher.on('change', handleFileChange)
      server.watcher.on('unlink', handleFileChange)

      async function handleFileChange(file: string) {
        if (!watchedFiles.includes(file)) {
          return
        }

        try {
          const [config] = await loadDefineConfig(MANIFEST_CONFIG_FILE, root)
          await writeManifestJSON(resolvedManifestJSONPath, buildJsonc(config))
        }
        catch (err) {
          server.config.logger.error(`Failed to process ${MANIFEST_CONFIG_FILE}: ${err}`)
        }
      }
    },
  }
}

export default VitePluginUniManifest
