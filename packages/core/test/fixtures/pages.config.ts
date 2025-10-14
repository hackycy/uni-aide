// 配置对象外注释
const TITLE = 'UNI_APP2'

const refresh = () => true

function dynamicPages(render: boolean) {
  if (render) {
    return {
      // 不支持该写法
      // #ifdef MP-WEIXIN
      path: 'pages/index/index',
      // #endif
    }
  }
}

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
        enablePullDownRefresh: refresh(),
        // #endif
      },
    },
    // comment
    // #ifdef MP-WEIXIN
    dynamicPages(true),
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
