# @uni-aide/unplugin-uni-manifest

[![npm version](https://img.shields.io/npm/v/@uni-aide/unplugin-uni-manifest.svg)](https://www.npmjs.com/package/@uni-aide/unplugin-uni-manifest)

使用 TypeScript / JavaScript 来编写 uni-app 的 manifest.json

## 安装

``` bash
pnpm add -D @uni-aide/unplugin-uni-manifest
```

## 使用

``` ts
// vite.config.ts
import Uni from '@dcloudio/vite-plugin-uni'
import UniManifest from '@uni-aide/unplugin-uni-manifest/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [UniManifest(), Uni()],
})
```

创建manifest.config.(ts|mts|js|mjs|cjs)

``` ts
import { defineConfig } from '@uni-aide/unplugin-uni-manifest'

export default defineConfig({
  // config here
})
```

> 快速迁移：只需将`manifest.json`对象拷贝至`defineConfig`参数内格式化即可，插件会重新输出带有**注释**的`manifest.json`
