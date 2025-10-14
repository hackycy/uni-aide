import type { UserManifestConfig } from '@uni-aide/types/manifest'
import type { Logger, Plugin } from 'vite'
import type { UniManifestOptions } from './types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { findConfigFile, parse } from '@uni-aide/core'
import { DEFAULT_MANIFEST_CONFIG, MANIFEST_CONFIG_FILE, MANIFEST_JSON_FILE } from './const'

export * from './types'
export * from '@uni-aide/types/manifest'

let logger: Logger | null = null
function setLogger(l: Logger) {
  logger = l
}

/**
 * define helper
 */
export function defineConfig(config: UserManifestConfig) {
  return config
}

async function writeManifestJSON(root: string, jsonPath: string, defaults?: any) {
  try {
    const jsonc = await parse(MANIFEST_CONFIG_FILE, {
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

function checkManifestJsonFileSync(jsonPath: string) {
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
  const root = process.env.VITE_ROOT_DIR || process.cwd()
  const resolvedManifestJSONPath: string = path.join(
    root,
    typeof options.outDir === 'string' ? options.outDir : 'src',
    MANIFEST_JSON_FILE,
  )

  // manifest.json文件检查
  checkManifestJsonFileSync(resolvedManifestJSONPath)

  let watchedFiles: string[] = []

  return {
    name: '@uni-aide/vite-plugin-manifest',
    enforce: 'pre',
    async configResolved(config) {
      setLogger(config.logger)

      const sourceConfigPath = findConfigFile(root, MANIFEST_CONFIG_FILE)
      if (!sourceConfigPath) {
        logger?.warn(`Config file not found: ${MANIFEST_CONFIG_FILE}`)
        return
      }

      watchedFiles = [sourceConfigPath]
      await writeManifestJSON(root, resolvedManifestJSONPath, DEFAULT_MANIFEST_CONFIG)
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

        await writeManifestJSON(root, resolvedManifestJSONPath, DEFAULT_MANIFEST_CONFIG)
      }
    },
  }
}

export default VitePluginUniManifest
