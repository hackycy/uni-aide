import { define, defineConfig } from '@uni-aide/vite-plugin-pages'

const title = 'UNI_APP'

export default defineConfig({
  pages: [
    {
      path: 'pages/index/index',
      style: define({
        navigationBarTitleText: title,
      }).ifdef('H5', {
        navigationStyle: 'custom',
      }).ifdef('MP-WEIXIN', {
        enablePullDownRefresh: true,
      }),
    },
  ],
  globalStyle: {
    navigationBarTextStyle: 'black',
    navigationBarTitleText: 'uni-app',
    navigationBarBackgroundColor: '#F8F8F8',
    backgroundColor: '#F8F8F8',
  },
},
)
