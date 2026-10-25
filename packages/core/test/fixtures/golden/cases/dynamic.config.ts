const TITLE = 'UNI_APP'

const refresh = () => true

function dynamicPage() {
  return {
    // inside dynamic page
    path: 'pages/dyn/index',
  }
}

export default {
  pages: [
    {
      path: 'pages/index/index',
      style: {
        navigationBarTitleText: TITLE,
        // #ifdef H5
        enablePullDownRefresh: refresh(),
        // #endif
      },
    },
    // #ifdef MP-WEIXIN
    dynamicPage(),
    // #endif
  ],
}
