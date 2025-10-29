import type { UserPagesConfig } from '@uni-aide/types/pages'

export const PAGES_CONFIG_FILE = 'pages.config'

export const PAGES_JSON_FILE = 'pages.json'

/* https://cn.vite.dev/guide/api-plugin.html#virtual-modules-convention */
export const VIRTUAL_MODULE_ID = '~uni-pages'
export const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`

/**
 * {@link https://github.com/dcloudio/uni-preset-vue/blob/vite-alpha/src/pages.json}
 */
export const DEFAULT_PAGES_CONFIG: UserPagesConfig = {
  pages: [
    {
      path: 'pages/index/index',
      style: {
        navigationBarTitleText: 'uni-app',
      },
    },
  ],
  globalStyle: {
    navigationBarTextStyle: 'black',
    navigationBarTitleText: 'uni-app',
    navigationBarBackgroundColor: '#F8F8F8',
    backgroundColor: '#F8F8F8',
  },
}
