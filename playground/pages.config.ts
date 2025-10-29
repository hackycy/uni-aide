import { defineConfig } from '@uni-aide/unplugin-uni-pages'

const title = 'UNI_APP'

const OUT_SIDE_PAGES: any = [
  {
    path: 'pages/about/about',
    style: {
      // #ifdef MP-ALIPAY
      navigationBarTitleText: 'About Page',
      // #endif
    },
  },
]

export default defineConfig({
  pages: [
    {
      path: 'pages/index/index',
      style: {
        navigationBarTitleText: title,
        // #ifdef H5
        navigationStyle: 'custom',
        // #endif

        // #ifdef MP-WEIXIN
        enablePullDownRefresh: true,
        // #endif
      },
    },
    ...OUT_SIDE_PAGES,
  ],
  globalStyle: {
    navigationBarTextStyle: 'black',
    navigationBarTitleText: 'uni-app',
    navigationBarBackgroundColor: '#F8F8F8',
    backgroundColor: '#F8F8F8',
  },
})
