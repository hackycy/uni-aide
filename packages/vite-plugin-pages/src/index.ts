import type { UserPagesConfig } from '@uni-aide/types/pages'
import type { Plugin } from 'vite'
import type { UniPagesOptions } from './types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { findConfigFile, parse } from '@uni-aide/core'
import { PAGE_CONFIG_FILE, PAGE_JSON_FILE } from './const'

export * from './types'
export * from '@uni-aide/types/pages'

/**
 * define helper
 */
export function defineConfig(config: UserPagesConfig) {
  return config
}

async function writePagesJSON(root: string, jsonPath: string, defaults?: any) {
  const jsonc = await parse(PAGE_CONFIG_FILE, {
    cwd: root,
    defaults,
  })

  await fs.promises.writeFile(jsonPath, jsonc, { encoding: 'utf-8' })
}

export async function VitePluginUniPages(options: UniPagesOptions = {}): Promise<Plugin> {
  let root = process.cwd()
  let resolvedPagesJSONPath: string = ''
  let watchedFiles: string[] = []

  return {
    name: '@uni-aide/vite-plugin-pages',
    enforce: 'pre',
    async configResolved(config) {
      root = config.root
      resolvedPagesJSONPath = path.join(
        config.root,
        options.outDir ?? 'src',
        PAGE_JSON_FILE,
      )

      const sourceConfigPath = findConfigFile(root, PAGE_CONFIG_FILE)
      if (!sourceConfigPath) {
        config.logger.warn(`Config file not found: ${PAGE_CONFIG_FILE}`)
        return
      }

      watchedFiles = [sourceConfigPath]
      try {
        await writePagesJSON(root, resolvedPagesJSONPath)
      }
      catch (err) {
        config.logger.error(`Failed to process ${PAGE_CONFIG_FILE}: ${err}`)
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
          await writePagesJSON(root, resolvedPagesJSONPath)
        }
        catch (err) {
          server.config.logger.error(`Failed to process ${PAGE_CONFIG_FILE}: ${err}`)
        }
      }
    },
  }
}

export default VitePluginUniPages
