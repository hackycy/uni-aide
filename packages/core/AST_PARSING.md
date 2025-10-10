# AST 解析条件编译注释功能

该功能允许从带有条件编译注释的配置文件中解析注释位置信息，并与实际配置值合并，生成包含 `define` 链式调用的配置对象。

## 功能说明

### 核心思路

1. **解析注释位置**：使用 `ast-kit` 的 `babelParse` 解析配置文件的 AST，提取所有 `// #ifdef`、`// #ifndef`、`// #endif` 注释的位置信息
2. **加载配置值**：使用 `loadDefineConfig` 加载配置文件，获取实际的运行时配置值（支持变量、函数调用等）
3. **合并信息**：将注释位置信息与配置值合并，生成包含 `define().ifdef().ifndef()` 链式调用的配置对象
4. **生成 JSONC**：使用 `buildJsonc` 将合并后的配置转换为带条件编译注释的 JSON 字符串

## 使用方法

### 基本用法

```typescript
import { buildJsonc, parseConfigFileWithConditionals } from '@uni-aide/core'

// 解析带条件编译注释的配置文件
const config = await parseConfigFileWithConditionals('./pages.config.ts')

// 转换为 JSONC 字符串
const jsonc = buildJsonc(config)

console.log(jsonc)
```

### 输入示例

配置文件 `pages.config.ts`:

```typescript
export default {
  pages: [
    {
      path: 'pages/index/index',
      style: {
        navigationBarTitleText: 'UNI_APP',

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
    navigationBarBackgroundColor: '@navBgColor',
    navigationBarTextStyle: '@navTxtStyle',

    // #ifdef H5
    enablePullDownRefresh: false,
    onReachBottomDistance: 50,
    // #endif
  },
}
```

### 输出示例

生成的 `pages.json`:

```json
{
  "pages": [
    {
      "path": "pages/index/index",
      "style": {
        "navigationBarTitleText": "UNI_APP",
        // #ifdef H5
        "navigationStyle": "custom",
        // #endif
        // #ifdef MP-WEIXIN
        "enablePullDownRefresh": true
        // #endif
      }
    }
  ],
  "globalStyle": {
    "navigationBarBackgroundColor": "@navBgColor",
    "navigationBarTextStyle": "@navTxtStyle",
    // #ifdef H5
    "enablePullDownRefresh": false,
    "onReachBottomDistance": 50
    // #endif
  }
}
```

## API

### parseConfigFileWithConditionals(filePath, cwd?)

解析配置文件并生成带条件编译的配置对象。

**参数：**
- `filePath`: 配置文件的完整路径或文件名
- `cwd`: 工作目录（可选，如果 `filePath` 只是文件名）

**返回：**
- `Promise<any>`: 处理后的配置对象（包含 `define` 链式调用）

### parseConditionalComments(filePath)

仅解析配置文件中的条件编译注释位置信息。

**参数：**
- `filePath`: 配置文件的完整路径

**返回：**
- `Map<string, ConditionalBlock[]>`: 属性路径到条件编译块的映射

### mergeConfigWithConditionals(config, conditionalMap)

将配置值与条件编译信息合并。

**参数：**
- `config`: 通过 `loadDefineConfig` 加载的配置对象
- `conditionalMap`: 属性路径到条件编译块的映射

**返回：**
- `any`: 处理后的配置对象（包含 `define` 链式调用）

## 支持的特性

- ✅ 支持 `#ifdef` 和 `#ifndef` 条件编译
- ✅ 支持嵌套对象
- ✅ 支持数组中的对象
- ✅ 支持变量引用（通过 `loadDefineConfig`）
- ✅ 支持函数调用（通过 `loadDefineConfig`）
- ✅ 自动处理多个条件编译块

## 与现有 API 的兼容性

新的 `parseConfigFileWithConditionals` 功能与现有的 `define().ifdef().ifndef()` API 完全兼容。

**现有方式（手动使用 define）：**

```typescript
import { define } from '@uni-aide/core'

export default {
  globalStyle: define({
    navigationBarBackgroundColor: '@navBgColor',
  }).ifdef('H5', {
    enablePullDownRefresh: false,
  }),
}
```

**新方式（使用注释）：**

```typescript
export default {
  globalStyle: {
    navigationBarBackgroundColor: '@navBgColor',

    // #ifdef H5
    enablePullDownRefresh: false,
    // #endif
  },
}
```

两种方式都会生成相同的 JSONC 输出，可以根据个人喜好选择使用。

## 注意事项

1. 配置文件必须有 `export default` 导出
2. 条件编译注释必须严格遵循格式：
   - 开始：`// #ifdef CONDITION` 或 `// #ifndef CONDITION`
   - 结束：`// #endif`
3. 注释必须正确闭合，每个 `#ifdef`/`#ifndef` 都要有对应的 `#endif`
4. 支持 `.ts`、`.mts`、`.js`、`.mjs` 格式的配置文件
