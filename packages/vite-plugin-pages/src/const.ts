import type { UserPagesConfig } from '@uni-aide/types/pages'

export const PAGE_CONFIG_FILE = 'pages.config'

export const PAGE_JSON_FILE = 'pages.json'

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
