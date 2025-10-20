import type { Plugin } from 'vite'

/**
 * https://github.com/vueuse/vue-demi/blob/52e5e4fda8ddbe005f39e1fdcfec7ab07b3c7051/lib/v2/index.mjs#L32
 */
const MOCK_COMPONENT = `
// Vue 3 components mock
function createMockComponent(name) {
  return {
    setup() {
      throw new Error("[@uni-aide/vite-plugin-mock-component] " + name + " is not supported in Uni App. It's provided to avoid compiler errors.")
    }
  }
}

export var TransitionGroup = /*#__PURE__*/ createMockComponent('TransitionGroup')
`

export function VitePluginUniMockComponent(): Plugin {
  return {
    name: '@uni-aide/vite-plugin-mock-component',
    transform(code, id) {
      if (!id.endsWith('@dcloudio/uni-mp-vue/dist/vue.runtime.esm.js')) {
        return
      }

      return code += MOCK_COMPONENT
    },
  }
}

export default VitePluginUniMockComponent
