import type { UserManifestConfig } from '.'
import fs from 'node:fs'
import { DEFAULT_MANIFEST_CONFIG } from './core/constants'

/**
 * define helper
 */
export function defineConfig(config: UserManifestConfig): UserManifestConfig {
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
