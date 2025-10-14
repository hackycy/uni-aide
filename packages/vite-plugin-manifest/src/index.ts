import type { UserManifestConfig } from '@uni-aide/types/manifest'
import type { Plugin } from 'vite'
import type { UniManifestOptions } from './types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { findConfigFile, parse } from '@uni-aide/core'
import { DEFAULT_MANIFEST_CONFIG, MANIFEST_CONFIG_FILE, MANIFEST_JSON_FILE } from './const'

export * from './types'
export * from '@uni-aide/types/manifest'

/**
 * define helper
 */
export function defineConfig(config: UserManifestConfig) {
  return config
}

async function writeManifestJSON(root: string, jsonPath: string, defaults?: any) {
  const jsonc = await parse(MANIFEST_CONFIG_FILE, {
    cwd: root,
    defaults,
  })

  await fs.promises.writeFile(jsonPath, jsonc, { encoding: 'utf-8' })
}

export async function VitePluginUniManifest(options: UniManifestOptions = {}): Promise<Plugin> {
  let root = process.cwd()
  let resolvedManifestJSONPath: string = ''
  let watchedFiles: string[] = []

  return {
    name: '@uni-aide/vite-plugin-manifest',
    enforce: 'pre',
    async configResolved(config) {
      root = config.root
      resolvedManifestJSONPath = path.join(
        config.root,
        typeof options.outDir === 'string' ? options.outDir : 'src',
        MANIFEST_JSON_FILE,
      )

      const sourceConfigPath = findConfigFile(root, MANIFEST_CONFIG_FILE)
      if (!sourceConfigPath) {
        config.logger.warn(`Config file not found: ${MANIFEST_CONFIG_FILE}`)
        return
      }

      watchedFiles = [sourceConfigPath]
      try {
        await writeManifestJSON(root, resolvedManifestJSONPath, DEFAULT_MANIFEST_CONFIG)
      }
      catch (err) {
        config.logger.error(`Failed to process ${MANIFEST_CONFIG_FILE}: ${err}`)
      }
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
          await writeManifestJSON(root, resolvedManifestJSONPath, DEFAULT_MANIFEST_CONFIG)
        }
        catch (err) {
          server.config.logger.error(`Failed to process ${MANIFEST_CONFIG_FILE}: ${err}`)
        }
      }
    },
  }
}

export default VitePluginUniManifest
