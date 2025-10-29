import type { UserPagesConfig } from '@uni-aide/types/pages'
import fs from 'node:fs'
import { DEFAULT_PAGES_CONFIG } from './core/constants'

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
