import { defineConfig } from '@uni-aide/vite-plugin-pages'

const title = 'UNI_APP'

const OUT_SIDE_PAGES: any = [
  {
    // #ifdef MP-ALIPAY
    path: 'pages/about/about',
    style: {
      navigationBarTitleText: 'About Page',
    },
    // #endif
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
