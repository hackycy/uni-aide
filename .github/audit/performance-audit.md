# 一、三个包的职责与数据流

**`@uni-aide/core`**（纯解析层，与插件无关）
`parseConfig` = 读配置 → Babel 解析 AST → jiti 求值 → `normalizeValue` → `analyze`（AST 与运行时值对齐，捕获注释锚点、条件编译 region）→ `collectComments` / `buildCommentIndex`（注释侧表，以对象引用为 key）→ `validateRegions`。输出 `{ value, comments, orderHints, diagnostics }`。`emitJSONC` 按 orderHints 重新序列化并回填注释。

**`unplugin-uni-pages`**
- `configResolved`/`webpack()`：`writePagesJSON()` = parseConfig → `scan()`（glob 扫描 `scanDir`，用 SFC 的 `<route>` 自定义块补充页面）→ 合并/排序/冲突检测 → 二次 region 校验 → emit → 比对后原子写。
- `transform`：对每个 `.vue/.nvue/.uvue` 用 `parseSFC` 找 `<route>` 块并用 MagicString 删除。
- `load('~uni-pages')`：读 `pages.json` 产出 `pages/subPackages` 虚拟模块。
- watcher：chokidar 监听配置文件 + scanDir，**每个 add/change/unlink 事件都跑一整轮上述管线**。

**`unplugin-uni-manifest`**：只监听配置文件，事件 → `parseConfig` → emit → 比对 → 写文件，逻辑简单。

---

# 二、实测数据

环境：Windows 11 / Node 24 / tsx，合成页面每个 ~3.8KB，`pages.config.cts` 1.8KB。300 页与 1000 页两组：

| 阶段 | 300 页 | 1000 页 | 说明 |
|---|---:|---:|---|
| **`writePagesJSON()`（一次事件全流程）** | **152 ms** | **1345 ms** | 开发时每次保存页面的实际成本 |
| `scan()` | 139 ms | 1295 ms | 占总时间 92%~96% |
| ├ globSync | 36 ms | 112 ms | 同步阻塞 |
| ├ 顺序 readFile | 82 ms | 273 ms | 并行只需 13 / 45 ms |
| ├ parseSFC | 0~3 ms* | ~600–850 ms* | *见下方 LRU 说明 |
| └ 其它（map/过滤/块解析） | ~18 ms | ~80 ms | |
| `parseConfig()` | 7.3 ms | 7.5 ms | 与页数无关 |
| ├ 其中 jiti 求值（无缓存） | 7.5–8 ms | 同左 | **占 95%** |
| ├ Babel 解析 | 0.2–0.3 ms | 同左 | |
| └ 注释分析/对齐 | <0.5 ms | 同左 | |
| 合并+排序+region 校验+emit+比对 | ~6 ms | ~42 ms | |
| `manifest writeManifestJSON()` | 12.4 ms | 同左 | 输出文件存在时；jiti 仍占 8 ms |
| `emitJSONC` / `walkCommentEntries` / `compareStringWithFile` | 0.05 / 0.01 / 0.15 ms | — | 完全不是瓶颈 |
| transform 钩子（冷启动，每文件） | ~0.8–1.2 ms 解析 | 同左 | 1000 页冷启动额外 ~0.86 s |
| transform 加 `code.includes('<route')` 守卫 | 0.001 ms/文件 | 同左 | ~800× 便宜 |

\* **SFC 解析的超线性来自 Vue 自带缓存**：`@vue/compiler-sfc` 内部有 LRU(max=500) 的 parse 缓存（`compiler-sfc.cjs.js:1746`）。≤500 页时第二次扫描几乎全部命中缓存（300 页的 139ms 里解析≈0）；>500 页时每次扫描都在抖动淘汰，解析重新变回 0.6–0.8/文件，所以 3.3 倍页数带来 9.3 倍耗时。

**结论：core 本身很快（Babel+注释分析+发射合计 <1ms），性能问题几乎全部在插件的 I/O 编排上——每次事件全量扫描 + 每次求值不缓存。**

---

# 三、瓶颈排序（按收益）

### P0 `scan()` 全量重扫（最大头，10–65× 收益）
`context.ts:709-774`：每个事件都 `globSync` 整个 scanDir → **顺序** `await readFile` 每个文件 → 每个文件 `parseSFC`。而 chokidar 回调本来就带着变更文件路径（`handleFileChange(filePath)`，`context.ts:99`），目前这个路径只用来过滤、没有用于增量。

- 改为：启动时全扫一次；之后对 `add/change/unlink` 只读+解析该文件，更新 `scanPagesMap/scanSubPackagesMap/scanTabBarMap`（实测单文件 read+SFC+块解析仅 **0.31 ms**）。
- 预期：300 页 152 → **~15 ms**；1000 页 1345 → **~50 ms**（剩余主要是 emit/排序）。
- 若仍保留全扫路径：`Promise.all` 并发读（82→13 ms / 273→45 ms）、`globSync` 换异步 glob（避免阻塞事件循环）。

### P1 配置解析不缓存（每个事件白付 7.5–8 ms）
`context.ts:187` 每次 `writePagesJSON` 都重新 `parseConfig`；`evaluate.ts:38-45` 用 `fsCache:false, moduleCache:false` 且每次 `createJiti`。实测：

| 配置 | 当前 | `fsCache:true` | 全缓存 |
|---|---:|---:|---:|
| evaluateConfig | 8.0 ms | 3.6 ms | 0.57 ms |

- watcher 本来就监听配置文件（`context.ts:71-97`），可以按文件内容/mtime 缓存 `ParseConfigResult`，只有配置变化时才重解析。
- 注意 `moduleCache:false` 会让配置的整个依赖图**每次重新执行**——缓存整份结果同时也消除了重复副作用。
- manifest 同理：12.4 → ~1 ms（改配置不频繁，优先级低于 pages）。

### P1 watcher 无防抖、且锁冲突时直接丢弃事件
`context.ts:93-108` + `context.ts:172-180`：`handleFileChange` 不 await，多个事件并发；`lockfile.lock(..., { retries: 0 })` 失败就 `return`。生成要 150 ms~1.3 s，这段窗口内的变更事件**被静默丢弃，也不会补跑**（git checkout、多文件保存时最终产物可能过期）。建议：30~50 ms 防抖 + "生成中置脏标记、结束后补跑一轮"，顺带合并掉突发事件。

### P2 transform 钩子对每个 SFC 做完整解析
`unplugin.ts:27-44`：`enforce:'pre'`，每个 `.vue/.nvue/.uvue` 都 `parseSFC`（冷启动 0.8–1.2 ms/文件，1000 页 ≈0.86 s），只为了找 `<route>`；随后 Vue 插件还要再解析一遍。而且我们的解析会占用同一个 500 条 LRU，**项目 >500 页时会把 Vue 自己的缓存条目挤掉**，放大二次解析成本。

- 最低成本修复：`if (!code.includes('<route')) return null`，无 route 块的组件（通常占多数）零解析成本。
- 更进一步：扫描/提取只需要自定义块，可用轻量块提取替代完整 SFC 解析（实测块解析 ~0.01 ms/文件），transform 仍保留 MagicString+sourcemap（20 ms/300 文件，可接受）。

### P3 排序/合并的二次复杂度（1000 页时 ~40 ms 残留的一部分）
`context.ts:521-559` 排序比较器里 `tabBar.list.find` + `indexOf`；`context.ts:452-470` 每个扫描路径都对 `subPackages` 做 `findIndex`（O(N·P)）。预建 `Map<path, item>` 即可线性化。优先级低。

---

# 四、顺带发现的非性能问题（会影响正确性，建议单独处理）

1. **输出文件不存在时静默不生成**：实测 `proper-lockfile` 对不存在的目标文件抛 `ENOENT`（它先 `realpath`），两个插件都 `catch { return }`（`pages/context.ts:176-180`、`manifest/context.ts:90-94`）。新建项目或删掉 `pages.json` 后迁移到 `pages.config.ts` 时，插件会**什么都不做且无任何提示**。测试 helpers 预先创建了输出文件，掩盖了这个问题。
2. **使用包导出的 `defineConfig` 时配置注释全部丢失**：`analyze.ts:397-400` 把 import/require 来的函数调用视为 opaque，导致整个配置对象不可对齐。实测对比——本地定义的 `defineConfig` 注释完整保留；`import { defineConfig } from '@uni-aide/unplugin-uni-pages'`（README 推荐写法）输出的 JSON 无任何注释，仅条件编译指令会打印 `directive-unresolved` 警告。golden 用例只覆盖了本地 `defineConfig`，所以测试没发现。当前 `playground/src/pages.json` 里的注释是旧版本产物，不能作为现状证据。
3. **chokidar v4 已移除 glob 支持**（README v4 迁移说明），`ignored: this.options.exclude` 传入的 glob 字符串在 watcher 中不生效——排除目录仍会被监听并触发全量重生成（与 P0 叠加）。
4. `writePagesJSON` 里 `findConfigFile` 被调了两次（`context.ts:183` 和 core 内部），可忽略。

如果只做两件事，我建议：**增量扫描 + 配置结果缓存**，能把开发时每次保存的 152 ms/1345 ms 降到 ~15 ms/~50 ms。需要的话我可以按这个顺序做一版实现（先补性能基准测试作为验收标准）。
