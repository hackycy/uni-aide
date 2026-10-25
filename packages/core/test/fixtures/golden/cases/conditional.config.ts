export default {
  globalStyle: {
    // #ifdef H5
    enablePullDownRefresh: false,
    // #endif
    // #ifdef MP-WEIXIN || MP-QQ
    navigationStyle: 'custom',
    // #endif
    // #ifndef APP-PLUS
    backgroundColor: '#fff',
    // #endif
  },
  pages: [
    // #ifdef H5
    { path: 'pages/h5/index' },
    // #else
    { path: 'pages/default/index' },
    // #endif
  ],
}
