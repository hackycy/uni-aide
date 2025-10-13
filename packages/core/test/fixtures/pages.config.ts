// 配置对象外注释
const TITLE = 'UNI_APP2'

export default {
  pages: [
    {
      path: 'pages/index/index',
      style: {
        navigationBarTitleText: TITLE,

        // #ifdef H5
        navigationStyle: 'custom',
        // #endif

        // #ifdef MP-WEIXIN
        enablePullDownRefresh: true,
        // #endif
      },
    },
    // #ifdef MP-WEIXIN
    /* 1 */
    {},
    // #endif
  ],
  globalStyle: {
    navigationBarBackgroundColor: '@navBgColor',
    navigationBarTextStyle: '@navTxtStyle',
    backgroundColor: '@bgColor',
    backgroundTextStyle: '@bgTxtStyle',
    backgroundColorTop: '@bgColorTop',
    backgroundColorBottom: '@bgColorBottom',

    // #ifdef H5
    enablePullDownRefresh: false,
    onReachBottomDistance: 50,
    // #endif
  },
  easycom: {
    autoscan: true,
    custom: {
      '^wd-(.*)': 'wot-design-uni/components/wd-$1/wd-$1.vue',
    },
  },
}
