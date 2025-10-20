# @uni-aide/vite-plugin-mock-component

[![npm version](https://img.shields.io/npm/v/@uni-aide/vite-plugin-mock-component.svg)](https://www.npmjs.com/package/@uni-aide/vite-plugin-mock-component)

Mock `UniApp` 平台（微信小程序）部份组件Api差异 [@uni-app#4604](https://github.com/dcloudio/uni-app/issues/4604)

## 安装

``` bash
pnpm add -D @uni-aide/vite-plugin-mock-component
```

## 使用

``` ts
// vite.config.ts
import UniMockComponent from '@uni-aide/vite-plugin-mock-component'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    UniMockComponent(),
  ],
})
```
