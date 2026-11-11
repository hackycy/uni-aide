# uni-aide 性能审计（2026-11-03 复审更新）

> 复审基线：`3f4beff pref(pages): incremental scan with event-driven index`
> 环境：Windows 11 / Node 24.18 / tsx；合成页面每个约 3.8KB，`pages.config.ts` 约 1.8KB；300 页与 1000 页两组。
> 上一版的 P0（全量重扫）已落地并达标。本文档标注每项现状，并补充复审中新发现的问题。

---

# 一、三个包的职责与数据流

**`@uni-aide/core`**（纯解析层，与插件无关）
`parseConfig` = 读配置 → Babel 解析 AST → jiti 求值 → `normalizeValue` → `analyze`（AST 与运行时值对齐，捕获注释锚点、条件编译 region）→ `collectComments` / `buildCommentIndex`（注释侧表，以对象引用为 key）→ `validateRegions`。输出 `{ value, comments, orderHints, diagnostics }`。`emitJSONC` 按 orderHints 重新序列化并回填注释。
注意：`evaluateConfig` 目前每次调用都新建 jiti 且 `fsCache:false, moduleCache:false`（`evaluate.ts:38-45`），配置的整个依赖图会在每次生成时重新执行。

**`unplugin-uni-pages`**
- `configResolved` / `webpack()`：`writePagesJSON()` 只在初始化触发**一次全量扫描**。
- watcher：`add/change/unlink/unlinkDir` → `notifyFileEvent` / `notifyDirectoryRemoved` 写入 dirty 集合 → **30 ms 合并** → 串行 drain：`reconcile` 只读取/解析变更文件并更新 `ScanIndex`（按文件保存 route 块），需要时再 `generatePagesJSON`。
- `generatePagesJSON`：每次重新 `parseConfig` → 合并扫描结果 → 排序 → region 校验 → emit → 比对后原子写（输出缺失时会创建）。配置变更复用索引，只重新生成。
- `transform`：对每个 `.vue/.nvue/.uvue` 仍完整 `parseSFC` 查找 `<route>` 块并用 MagicString 删除。
- `load('~uni-pages')`：读 `pages.json` 产出虚拟模块。

**`unplugin-uni-manifest`**：只监听配置文件，事件 → `parseConfig` → emit → 比对 → 写文件。仍无防抖/队列，锁 `retries:0`，且不创建缺失的输出文件。

---

# 二、实测数据

## 2.1 当前基准

| 阶段 | 300 页 | 1000 页 |
|---|---:|---:|
| 冷启动首次写（`writePagesJSON()`，含全量扫描） | 665 ms | 1341 ms |
| 单页 change（median，不含 30 ms 防抖窗口） | 17.0 ms | 20.3 ms |
| 配置 change（median） | 15.3 ms | 16.6 ms |

- 多次运行波动约 ±2 ms；`BENCH_STRICT=1` 通过（阈值 30 / 80 ms）。
- 修复前对照：单页保存 152 ms（300 页）/ 1345 ms（1000 页）。**开发时每次保存的成本问题已解决**，原 `writePagesJSON` 的耗时现在只剩冷启动一次。
- 上表为 R3 修复前的 Windows 基线；R3 修复后的 macOS 复测数据见 §三「R3 修复详情」。

## 2.2 冷启动拆分（1000 页）

| 阶段 | 耗时 |
|---|---:|
| `collectScanFiles`（异步 tinyglobby） | 44.8 ms |
| `loadScanEntries`（并发 32 读 + `parseSFC` + 块解析） | 1350.9 ms |

同步 glob 已换为异步 glob，读文件已并发化；剩余时间几乎全部是 `@vue/compiler-sfc` 解析。由于 Vite 会 `await configResolved`，这 1.35 s 会直接推迟 dev server 启动。

## 2.3 配置求值（playground 真实配置 `pages.config.cts`）

| 方案 | 耗时 |
|---|---:|
| 现状：每次 `createJiti`，`fsCache:false, moduleCache:false` | 8.16 ms |
| 复用 jiti 实例，`fsCache:false` | 6.74 ms |
| 复用 jiti 实例，`fsCache:true`（推荐，语义安全） | 3.04 ms |
| `moduleCache:true` 全缓存（不可直接使用，见 §四 R1） | 0.12 ms |

`parseConfig` 全流程中位数 **10.4 ms**（含 Babel/analyze/comments），与页数无关。

## 2.4 测试基线现状

- `@uni-aide/unplugin-uni-pages`：92/92 通过（新增 41 个 route 块提取等价性与 transform 守卫测试）。
- `@uni-aide/unplugin-manifest`：5/5 通过。
- `@uni-aide/core`：Windows 下 9 个 golden 用例全部失败；换行统一为 LF 后仍有 4 个失败（`conditional` / `dynamic` / `define-config` / `cjs`）。原因见 §五.3。
- 在修复 golden 基线前，不宜把「测试全绿」作为后续性能改动的验收标准。

---

# 三、上一版审计的修复状态

| 上一版条目 | 状态 | 说明 |
|---|---|---|
| P0 `scan()` 全量重扫 | ✅ 已修复 | 增量索引 + 30 ms 合并 + 串行队列，数据见 2.1 |
| P1 配置解析不缓存 | ❌ 仍在 | 每次生成仍 `parseConfig`，见 §四 R1 |
| P1 watcher 无防抖 / 锁冲突丢事件 | ⚠️ 部分修复 | pages 已修复；manifest 仍无防抖且 `retries:0` |
| P2 transform 每个 SFC 完整解析 | ✅ 已修复 | 已加 `includes('<route')` 守卫；冷启动扫描改用轻量块提取 |
| P3 排序/合并二次复杂度 | ❌ 仍在 | 现在整轮仅 20 ms，影响已小 |
| 非性能 1 输出缺失时静默不生成 | ⚠️ 部分修复 | pages 已修复；manifest 仍在 |
| 非性能 2 `defineConfig` 注释丢失 | ❌ 仍在，且范围更大 | CJS `require` 解构同样失效 |
| 非性能 3 chokidar v4 不支持 glob `ignored` | ✅ 已修复 | 改为 `ignored` 函数 + picomatch，含目录剪枝 |
| 非性能 4 `findConfigFile` 两次 | ❌ 仍在 | 纯 `existsSync`，可忽略 |

### R3 transform 钩子与冷启动扫描（✅ 已修复）

`unplugin.ts:27-44` 原为 `enforce:'pre'` 且每个 `.vue/.nvue/.uvue` 都 `parseSFC`，只为找 `<route>`；`readScanFile` 命中 `<route` 后也完整解析，1000 页冷启动 1.35 s 的主要成本来自这里。

- transform：增加 `if (!code.includes('<route')) return null` 守卫，无 route 的组件零解析成本；含 route 的文件仍走 `parseSFC`（`loc` 删除语义不变）。
- 冷启动：新增 `core/route-block.ts` 轻量顶层块提取器，只读取 `<route>` 的 `lang` / `attrs` / `content`，行为对齐 `@vue/compiler-sfc@3.4.21`（含 `template lang` RCDATA、`ignoreEmpty`、未闭合块、属性状态机等边界），由 41 个等价性/守卫测试锁定。
- 复测（macOS / Darwin 25.5 / Node 24.16；与本文 Windows 基线环境不同）：300 页 cold 268.8 → 89.2–99.1 ms，1000 页 522.4 → 63.8–66.2 ms；change/config 6.9–8.8 / 5.9–7.9 ms；`BENCH_STRICT=1` 通过。
- 共享 LRU 的副作用随之消失：扫描不再调用 `parseSFC`，只有 transform 对含 route 的模块解析。

---

# 四、仍存在的性能问题（按收益排序）

### R1 配置解析不缓存（每个事件白付 8–10 ms）

`context.ts:433` 每次 `generatePagesJSON` 都重新 `parseConfig`；`evaluate.ts:38-45` 每次新建 jiti 且关闭缓存，配置依赖图在每次保存时都会**重新执行**（包括副作用）。manifest 同理。

- 零风险第一步：复用 jiti 实例 + `fsCache:true`，求值 8.16 → **3.04 ms**（见 2.3）。
- ⚠️ **不能直接缓存整份 `ParseConfigResult`**：`generatePagesJSON` 会原地修改 `parsed.value`、`comments`、`orderHints`（`mergeScanContent`、`pushInjectedElement`、`indexScanComments`）。直接复用会让上一轮注入的扫描页面残留，删除页面后也不会消失。完整缓存需要先把合并改成不可变，或深拷贝值后重新跑 `analyze`/`collectComments`。

### R2 manifest 仍缺防抖/队列/锁重试，且不创建缺失输出

- `manifest/context.ts:52-58`：每个 `change/unlink` 直接 `writeManifestJSON`，无防抖；并发事件时后到的会被丢弃。
- `manifest/context.ts:86-94`：`retries:0`，锁冲突直接 `return`，本次变更静默丢失。
- 默认 `realpath:true` 且未 `mkdir`：输出文件不存在时 `proper-lockfile` 抛 `ENOENT`，被 catch 吞掉——**新建项目或删掉 `manifest.json` 后，插件什么都不做且无提示**（已用临时项目复现：`output exists: false`）。
- 建议直接复用 pages 的 `writeOutput` 逻辑（`mkdir` + `realpath:false` + 重试），并加同样的 30 ms 合并/脏标记。

### R4 排序/合并的二次复杂度（低优先）

- `context.ts:521-533`、`context.ts:764-802`：排序比较器里对每个 page 做 `tabBar.list.find` + `indexOf`（O(N·logN·T)）。
- `context.ts:695-703`：每个扫描分包路径都对 `subPackages` 做 `findIndex`（O(N·P)）。
- 1000 页整轮已经只有 20 ms，暂不构成瓶颈；预建 `Map<path, item>` 即可线性化。

### R5 模板/样式改动仍触发整轮生成（复审新增）

`reconcile` 只要旧/新文件有 route 块就置 `relevant=true`（`context.ts:392-405`），**不比较 route 内容**。实际开发中多数保存只改模板/样式，但仍要付 17–20 ms。

建议比较变更前后的 route 块**原文**（`comment-json` 的注释以 symbol 保存，不能只比 `JSON.stringify`），未变则跳过生成。

---

# 五、正确性问题（建议单独处理）

1. **`defineConfig` 注释全部丢失（README 推荐写法）**
   - ESM `import { defineConfig } from '@uni-aide/unplugin-uni-pages'` 与 CJS `const { defineConfig } = require(...)` 都失效。
   - `collectBindings`（`core/analyze.ts:133-168`）只记录 `ImportDeclaration`，不识别 require 解构；`resolveCall`（`core/analyze.ts:397-400`）把所有导入标识符视为 opaque，整个配置对象无法对齐。
   - 实测 playground：`pages.config.cts` 与 `manifest.config.ts` 的输出均 **0 行注释**；pages 侧仅产生 6 条 `directive-unresolved` 警告。golden 只覆盖了本地定义的 `defineConfig`。
   - 建议：记录 imported name + source 与 require 解构；对 `defineConfig` 这类单对象参数调用按 identity 对齐；补 ESM/CJS 两个 golden 用例。

2. **manifest 输出缺失时不生成**：见 §四 R2，已复现。两个插件的测试 helpers 都预先创建了输出文件，因此现有测试没有覆盖该场景。

3. **core golden 测试基线失真**
   - Windows 当前 checkout 下 `core.autocrlf=true` 且仓库没有 `.gitattributes`，expected 被检出为 CRLF，而 emitter 输出 LF → 9 个 golden 全部失败。
   - 把源文件和 expected 统一为 LF 后，仍有 4 个失败（`conditional` / `dynamic` / `define-config` / `cjs`）：expected 在「最后一个子节点后跟 `#endif`」时没有逗号，而 `emit.ts:247-278` 的 `hasAfterLast` 逻辑刻意补逗号。实现注释与基线相互矛盾，需要确认预期行为后统一。
   - 建议：添加 `.gitattributes`（至少 fixtures 固定 `eol=lf`），并重新生成或修正这 4 个基线。

4. **全量扫描失败后不会重试**
   `drainLoop` 在循环开头清空 `fullScanRequested`，`fullScan()` 抛异常（如临时 EACCES、glob 错误）后只打印日志并 `return`（`context.ts:328-368`）。后续文件事件只做局部 reconcile，索引可能长期不完整，直到 watcher error 或重启。

5. **webpack watch 的启动顺序与 vite 不一致**
   vite 已改为「先挂 watcher 再首扫」，webpack 仍是先 `writePagesJSON()` 再 `setupWatcher()`（`unplugin.ts:68-80`），首扫窗口（1000 页约 1.3 s）内的变更会被丢弃。

6. **启动时 scanDir 不存在 → 后续创建不触发事件**
   chokidar v4 对不存在的 watch target 不会监视父目录。实测：先 `setupWatcher`（`src/pages` 不存在），再创建 `src/pages/later/index.vue`，等待 2 s 后 pages.json 仍不包含该页面。可监听最近存在的祖先目录，出现后重新 `setupWatcher()`。

7. **配置文件改名/换后缀后 watcher 仍盯旧路径**
   `notifyFileEvent` 只和缓存的 `this.configPath` 比较（`context.ts:177-181`），`setupWatcher` 只在 `configResolved` 调用一次。`pages.config.ts → pages.config.cts`（git 切换分支）会触发生成，但新文件的后续编辑不再被监听。

8. **manifest 细节**：`close()` 未 await `stopWatcher()`（`manifest/context.ts:77-79`）；watcher 未监听 `add`。

9. `findConfigFile` 在生成路径中调两次（`context.ts:429` + core 内部），纯 `existsSync`，可忽略。

---

# 六、建议修复顺序

1. `defineConfig`（ESM + CJS require）注释丢失 —— README 主路径，正确性优先
2. manifest 对齐 pages：缺失输出创建、防抖/脏标记、锁重试
3. 修复 golden 基线 + 添加 `.gitattributes` —— 让测试重新可信
4. 配置求值缓存：先只做「复用 jiti + `fsCache:true`」（8.16 → 3.04 ms）；完整结果缓存需先去原地修改
5. route 内容比较，跳过模板类改动
6. 其余：全量扫描失败重试、webpack 顺序、scanDir 后创建、配置改名、排序线性化

---

# 附：复现命令

```bash
# 基准（BENCH_STRICT=1 时超过 30/80 ms 会返回非零退出码）
pnpm --filter @uni-aide/unplugin-uni-pages bench
BENCH_STRICT=1 pnpm --filter @uni-aide/unplugin-uni-pages bench

# 测试
pnpm --filter @uni-aide/core exec vitest run
pnpm --filter @uni-aide/unplugin-uni-pages exec vitest run
pnpm --filter @uni-aide/unplugin-uni-manifest exec vitest run
```
