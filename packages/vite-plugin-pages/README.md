# @uni-aide/vite-plugin-pages

[![npm version](https://img.shields.io/npm/v/@uni-aide/vite-plugin-pages.svg)](https://www.npmjs.com/package/@uni-aide/vite-plugin-pages)

使用 TypeScript / JavaScript 来编写 uni-app 的 pages.json

## 安装

``` bash
pnpm add -D @uni-aide/vite-plugin-pages
```

## 使用

``` ts
// vite.config.ts
import Uni from '@dcloudio/vite-plugin-uni'
import UniPages from '@uni-aide/vite-plugin-pages'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [UniPages(), Uni()],
})
```

创建pages.config.(ts|mts|js|mjs|cjs)

``` ts
import { defineConfig } from '@uni-aide/vite-plugin-pages'

export default defineConfig({
  // config here
})
```

导入虚拟模块即可访问所有页面的元数据

``` ts
// env.d.ts
/// <reference types="@uni-aide/vite-plugin-pages/client" />

import { pages, subPackages } from '~uni-pages'
console.log(pages, subPackages)
```

> 快速迁移：只需将`pages.json`对象拷贝至`defineConfig`参数内格式化即可，插件会重新输出带有**注释**的`pages.json`
