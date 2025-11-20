import type { UnpluginFactory } from 'unplugin'
import type { Options } from '../types'
import { MagicString } from '@uni-aide/core'
import { createUnplugin } from 'unplugin'
import { FILE_EXTENSIONS, RESOLVED_VIRTUAL_MODULE_ID, VIRTUAL_MODULE_ID } from './constants'
import { Context } from './context'
import { getRouteSfcBlock, parseSFC } from './utils'

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
    transform(code, id) {
      if (!FILE_EXTENSIONS.find(ext => id.endsWith(ext))) {
        return null
      }

      const sfc = parseSFC(code, { filename: id })
      const routeBlocks = getRouteSfcBlock(sfc)

      if (!routeBlocks || routeBlocks.length === 0) {
        return null
      }

      const ms = new MagicString(code)
      // ignore route custom blocks content
      for (const block of routeBlocks) {
        ms.remove(block.loc.start.offset, block.loc.end.offset)
      }

      if (ms.hasChanged()) {
        return {
          code: ms.toString(),
          map: ms.generateMap({
            source: id,
            includeContent: true,
            file: `${id}.map`,
          }),
        }
      }
    },
    vite: {
      async configResolved(config) {
        ctx.setRoot(config.root)
        await ctx.writePagesJSON()

        // Setup watcher in dev mode or build watch mode
        if (config.command === 'serve' || config.build.watch) {
          ctx.setupWatcher()
        }
      },
    },
    webpack(compiler) {
      ctx.writePagesJSON()

      // Only setup watcher in watch mode (development)
      if (compiler.options.watch) {
        ctx.setupWatcher()
      }
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
