# @vite-plugin-uni-helper/core

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

Core utilities for vite-plugin-uni-helper, providing configuration loading and conditional compilation support for uni-app projects.

## Features

- 📄 **Configuration Loading**: Load `pages.config.ts/js` using unconfig
- 🔀 **Conditional Compilation**: Support `ifdef`/`ifndef` for platform-specific configurations
- 📝 **Comment Generation**: Generate JSON with conditional compilation comments
- 🎯 **Type Safety**: Full TypeScript support with `definePage` helper

## Usage

### Basic Configuration

```typescript
import { definePage } from '@vite-plugin-uni-helper/core'

export default definePage({
  pages: [],
  globalStyle: {
    navigationBarBackgroundColor: '@navBgColor',
    navigationBarTextStyle: '@navTxtStyle',
  },
  easycom: {
    autoscan: true,
    custom: {
      '^wd-(.*)': 'wot-design-uni/components/wd-$1/wd-$1.vue',
    },
  },
})
```

### Conditional Compilation

```typescript
import { definePage, ifdef, ifndef } from '@vite-plugin-uni-helper/core'

export default definePage({
  pages: [],
  globalStyle: {
    navigationBarBackgroundColor: '@navBgColor',

    // H5 platform specific
    ...ifdef('H5', {
      enablePullDownRefresh: false,
      onReachBottomDistance: 50,
    }),

    // Non-WeChat mini-program platforms
    ...ifndef('MP-WEIXIN', {
      navigationStyle: 'custom',
    }),
  },
})
```

### Loading and Building Configuration

```typescript
import { buildPagesJson, loadPagesConfig } from '@vite-plugin-uni-helper/core'

// Load configuration from pages.config.ts/js
const config = await loadPagesConfig()

// Generate pages.json with conditional compilation comments
const pagesJson = buildPagesJson(config)
```

The generated `pages.json` will include conditional compilation comments:

```jsonc
{
  "pages": [],
  "globalStyle": {
    "navigationBarBackgroundColor": "@navBgColor",
    // #ifdef H5
    "enablePullDownRefresh": false,
    // #endif
    // #ifdef H5
    "onReachBottomDistance": 50,
    // #endif
    // #ifndef MP-WEIXIN
    "navigationStyle": "custom"
    // #endif
  }
}
```

## API

### `definePage<T>(config: T): T`

Type-safe configuration helper function.

### `ifdef(condition: string, data: object)`

Create conditional compilation block for specified platform.

### `ifndef(condition: string, data: object)`

Create conditional compilation block that excludes specified platform.

### `loadPagesConfig(configPath?: string): Promise<any>`

Load configuration from `pages.config.ts/js` files using unconfig.

### `buildPagesJson(config: any): string`

Convert configuration to JSON string with conditional compilation comments.

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg'/>
  </a>
</p>

## License

[MIT](./LICENSE) License © [Anthony Fu](https://github.com/antfu)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/pkg-placeholder?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/pkg-placeholder
[npm-downloads-src]: https://img.shields.io/npm/dm/pkg-placeholder?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/pkg-placeholder
[bundle-src]: https://img.shields.io/bundlephobia/minzip/pkg-placeholder?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=pkg-placeholder
[license-src]: https://img.shields.io/github/license/antfu/pkg-placeholder.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/antfu/pkg-placeholder/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/pkg-placeholder
