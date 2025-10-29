import type { UnpluginFactory } from 'unplugin'
import type { Options } from '../types'
import { createUnplugin } from 'unplugin'
import { RESOLVED_VIRTUAL_MODULE_ID, VIRTUAL_MODULE_ID } from './constants'
import { Context } from './context'

export const unpluginFactory: UnpluginFactory<Options | undefined> = (
  options = {},
) => {
  const ctx: Context = new Context(options)

  return {
    name: '@uni-aide/unplugin-uni-pages',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return ctx.resolveVirtualModule()
      }
    },
    vite: {
      async configResolved(config) {
        ctx.setRoot(config.root)
        ctx.writePagesJSON()

        ctx.setupWatcher()
      },
    },
    webpack() {
      ctx.writePagesJSON()

      ctx.setupWatcher()
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
