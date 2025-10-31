import type { UnpluginFactory } from 'unplugin'
import type { Options } from '../types'
import { createUnplugin } from 'unplugin'
import { Context } from './context'

export const unpluginFactory: UnpluginFactory<Options | undefined> = (
  options = {},
) => {
  const ctx: Context = new Context(options)

  return {
    name: '@uni-aide/unplugin-uni-manifest',
    enforce: 'pre',
    vite: {
      async configResolved(config) {
        ctx.setRoot(config.root)
        await ctx.writeManifestJSON()

        // Setup watcher in dev mode or build watch mode
        if (config.command === 'serve' || config.build.watch) {
          ctx.setupWatcher()
        }
      },
    },
    webpack(compiler) {
      ctx.writeManifestJSON()

      // Only setup watcher in watch mode (development)
      if (compiler.options.watch) {
        ctx.setupWatcher()
      }
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
