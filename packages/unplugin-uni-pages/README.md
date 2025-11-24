# @uni-aide/unplugin-uni-pages

[![npm version](https://img.shields.io/npm/v/@uni-aide/unplugin-uni-pages.svg)](https://www.npmjs.com/package/@uni-aide/unplugin-uni-pages)

使用 TypeScript / JavaScript 来编写 uni-app 的 pages.json

## 安装

``` bash
pnpm add -D @uni-aide/unplugin-uni-pages
```

## 使用

``` ts
// vite.config.ts
import Uni from '@dcloudio/vite-plugin-uni'
import UniPages from '@uni-aide/unplugin-uni-pages/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [UniPages(), Uni()],
})
```

``` js
// vue.config.js
module.exports = {
  configureWebpack: {
    plugins: [
      require('@uni-aide/unplugin-uni-pages/webpack')({
        outDir: __dirname,
        configSource: __dirname,
      }),
    ],
  },
}
```

> 注意非cli项目输出路径及配置路径均需配置且需要为绝对路径

创建pages.config.(ts|mts|js|mjs|cjs)

``` ts
import { defineConfig } from '@uni-aide/unplugin-uni-pages'

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
  ],
  globalStyle: {
    navigationBarTextStyle: 'black',
    navigationBarTitleText: '@uni-aide',
  },
})
```

导入虚拟模块即可访问所有页面的元数据

``` ts
// env.d.ts
/// <reference types="@uni-aide/unplugin-uni-pages/client" />

import { pages, subPackages } from '~uni-pages'

console.log(pages, subPackages)
```

> 快速迁移：只需将`pages.json`对象拷贝至`defineConfig`参数内格式化即可，插件会重新输出带有**注释**的`pages.json`

## 页面自动发现

配置中添加`scanDir`需要扫描目录

``` ts
import Uni from '@dcloudio/vite-plugin-uni'
import UniPages from '@uni-aide/unplugin-uni-pages/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    UniPages({
      // 注意仅支持目录
      scanDir: ['src/pages'],
      // 排除的页面，如['**/components/**/*.*']
      exclude: [],
    }),
    Uni()
  ],
})
```

然后在页面代码中自定义块用于路由数据，未定义自定义块的页面会被忽略

``` vue
<!-- index.vue -->
<!-- lang 设置解析器，仅支持解析JSON、JSON5、JSONC，默认为JSON -->
<!-- seq 设定排序，由小到大排序，默认都为Number最大值，当需要设置首页的页面可设置seq进行排序至首个元素 -->
<!-- part 设定页面定义所属区域，如page、subPackage、tabBar，当为tabBar需要定义两个自定义块，一个为页面一个为tab配置 -->

<!-- 1、普通页面 -->
<route lang="json" seq="0">
{
  "style": { "navigationBarTitleText": "@uni-aide" }
}
</route>

<!-- TabBar配置 (需配合1一起定义) -->
<route lang="jsonc" part="tabBar" seq="0">
{
  "iconPath": "static/home.png",
  "selectedIconPath": "static/home-selected.png",
  "text": "首页"
}
</route>

<!-- 分包页面 -->
<route lang="jsonc" part="subPackage" seq="0">
{
  "style": { "navigationBarTitleText": "@uni-aide" }
}
</route>
```

> subPackage会自动识别并分配目录，只会遵循目录并生成pages.json

## 致谢

本项目的部分代码也源自或复制自以下项目:
- [vite-plugin-uni-pages](https://github.com/uni-helper/vite-plugin-uni-pages)
