import type { UserPagesConfig } from '@uni-aide/types/pages'
import type { Logger, Plugin } from 'vite'
import type { UniPagesOptions } from './types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { findConfigFile, parse } from '@uni-aide/core'
import { DEFAULT_PAGES_CONFIG, PAGE_CONFIG_FILE, PAGE_JSON_FILE } from './const'

export * from './types'
export * from '@uni-aide/types/pages'

let logger: Logger | null = null
function setLogger(l: Logger) {
  logger = l
}

/**
 * define helper
 */
export function defineConfig(config: UserPagesConfig) {
  return config
}

async function writePagesJSON(root: string, jsonPath: string, defaults?: any) {
  try {
    const jsonc = await parse(PAGE_CONFIG_FILE, {
      cwd: root,
      defaults,
    })

    await fs.promises.writeFile(jsonPath, jsonc, { encoding: 'utf-8' })
    logger?.info(`Generated ${jsonPath}`)
  }
  catch {
    logger?.error(`Failed to generate ${jsonPath}`)
  }
}

function checkPagesJsonFileSync(jsonPath: string) {
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
  const root = process.env.VITE_ROOT_DIR || process.cwd()
  const resolvedPagesJSONPath: string = path.join(
    root,
    typeof options.outDir === 'string' ? options.outDir : 'src',
    PAGE_JSON_FILE,
  )

  // pages.json文件检查
  checkPagesJsonFileSync(resolvedPagesJSONPath)

  let watchedFiles: string[] = []

  return {
    name: '@uni-aide/vite-plugin-pages',
    enforce: 'pre',
    async configResolved(config) {
      setLogger(config.logger)

      const sourceConfigPath = findConfigFile(root, PAGE_CONFIG_FILE)
      if (!sourceConfigPath) {
        logger?.warn(`Config file not found: ${PAGE_CONFIG_FILE}`)
        return
      }

      watchedFiles = [sourceConfigPath]
      await writePagesJSON(root, resolvedPagesJSONPath)
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

        await writePagesJSON(root, resolvedPagesJSONPath)
      }
    },
  }
}

export default VitePluginUniPages
