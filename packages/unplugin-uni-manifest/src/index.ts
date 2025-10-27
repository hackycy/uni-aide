import type { UnpluginInstance } from 'unplugin'
import type { Options } from './core/options'
import { createUnplugin } from 'unplugin'

export const Starter: UnpluginInstance<Options | undefined, false>
  = createUnplugin(() => {
    const name = '@uni-aide/unplugin-uni-manifest'

    return {
      name,
      enforce: 'pre',
    }
  })
