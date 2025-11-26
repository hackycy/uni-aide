// eslint-disable-next-line ts/no-require-imports
const { defineConfig } = require('@uni-aide/unplugin-uni-pages')

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

module.exports = defineConfig({
  pages: [
    ...OUT_SIDE_PAGES,
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
  ],
  globalStyle: {
    navigationBarTextStyle: 'black',
    navigationBarTitleText: 'uni-app',
    navigationBarBackgroundColor: '#F8F8F8',
    backgroundColor: '#F8F8F8',
  },
  tabBar: {
    color: '#cdcdcd',
    selectedColor: '#8b5cf6',
    borderStyle: 'white',
    backgroundColor: '#ffffff',
  },
  subPackages: [
    {
      root: 'pages-sub',
      pages: [
        {
          path: 'test',
          style: {
            navigationBarTitleText: 'Pages Sub Test',
          },
        },
      ],
    },
  ],
})
