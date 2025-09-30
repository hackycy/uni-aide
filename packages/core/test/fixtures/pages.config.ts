import { define } from '../../src/index'

export default {
  pages: [
    define({
      name: 'IndexPage',
      path: '/pages/index/index',
      style: define({
        navigationBarTitleText: '首页',
      }).ifdef('H5', {
        navigationStyle: 'custom',
      }),
    }).ifndef('H5', {
      meta: {
        auth: false,
      },
    }),
  ],
  globalStyle: define({
    // 导航栏配置
    navigationBarBackgroundColor: '@navBgColor',
    navigationBarTextStyle: '@navTxtStyle',

    // 页面背景配置
    backgroundColor: '@bgColor',
    backgroundTextStyle: '@bgTxtStyle',
    backgroundColorTop: '@bgColorTop',
    backgroundColorBottom: '@bgColorBottom',
  }).ifdef('H5', {
    // H5平台特有配置
    enablePullDownRefresh: false,
    onReachBottomDistance: 50,
  }).ifndef('MP-WEIXIN', {
    // 非微信小程序特有配置
    enablePullDownRefresh: true,
    backgroundColorTop: '#ffffff',
  }),
  easycom: {
    autoscan: true,
    custom: {
      '^wd-(.*)': 'wot-design-uni/components/wd-$1/wd-$1.vue',
    },
  },
}
