import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { Context } from '../src/core/context'

interface Result {
  pages: number
  cold: number
  change: number
  config: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function format(ms: number): string {
  return `${ms.toFixed(1)} ms`
}

function pageContent(index: number, version: number): string {
  const rows = Array.from(
    { length: 90 },
    (_, line) => `    <text>Row ${index}-${line} ${'x'.repeat(24)}</text>`,
  )

  return [
    '<template>',
    '  <view class="page">',
    ...rows,
    '  </view>',
    '</template>',
    '',
    '<route lang="jsonc">',
    `{ "style": { "navigationBarTitleText": "Page ${index} v${version}" } }`,
    '</route>',
    '',
  ].join('\n')
}

function configContent(version: number): string {
  return `export default { globalStyle: { navigationBarTitleText: "Bench ${version}" } }\n`
}

async function measure(pages: number): Promise<Result> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `uni-pages-bench-${pages}-`))
  const pagesDir = path.join(root, 'src/pages')
  const configPath = path.join(root, 'pages.config.ts')

  fs.mkdirSync(pagesDir, { recursive: true })
  fs.writeFileSync(configPath, configContent(0), 'utf-8')

  const files: string[] = []
  for (let index = 0; index < pages; index++) {
    const filePath = path.join(pagesDir, `page-${index}/index.vue`)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, pageContent(index, 0), 'utf-8')
    files.push(filePath)
  }

  const ctx = new Context({
    scanDir: ['src/pages'],
    outDir: 'src',
  })
  await ctx.setRoot(root)

  try {
    const coldStart = performance.now()
    await ctx.writePagesJSON()
    const cold = performance.now() - coldStart

    const outputPath = path.join(root, 'src/pages.json')
    const targetIndex = Math.floor(files.length / 2)
    const target = files[targetIndex]
    const changes: number[] = []
    for (let iteration = 0; iteration < 20; iteration++) {
      const version = iteration + 1
      fs.writeFileSync(target, pageContent(targetIndex, version), 'utf-8')
      const start = performance.now()
      ctx.notifyFileEvent(target)
      await ctx.flush()
      changes.push(performance.now() - start)

      const output = fs.readFileSync(outputPath, 'utf-8')
      if (!output.includes(`Page ${targetIndex} v${version}`)) {
        throw new Error(`change iteration ${iteration} did not reach pages.json`)
      }
    }

    const configs: number[] = []
    for (let iteration = 0; iteration < 10; iteration++) {
      const version = iteration + 1
      fs.writeFileSync(configPath, configContent(version), 'utf-8')
      const start = performance.now()
      ctx.notifyFileEvent(configPath)
      await ctx.flush()
      configs.push(performance.now() - start)

      const output = fs.readFileSync(outputPath, 'utf-8')
      if (!output.includes(`Bench ${version}`)) {
        throw new Error(`config iteration ${iteration} did not reach pages.json`)
      }
    }

    return {
      pages,
      cold,
      change: median(changes),
      config: median(configs),
    }
  }
  finally {
    await ctx.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

function assertTarget(result: Result): void {
  const changeTarget = result.pages >= 1000 ? 80 : 30
  const failures: string[] = []

  if (result.change > changeTarget) {
    failures.push(`change ${format(result.change)} > ${changeTarget} ms`)
  }
  if (result.config > changeTarget) {
    failures.push(`config ${format(result.config)} > ${changeTarget} ms`)
  }
  if (failures.length > 0) {
    console.error(`strict benchmark failed for ${result.pages} pages: ${failures.join(', ')}`)
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
  const results = [await measure(300), await measure(1000)]

  console.log('\n| pages | cold write | change (median) | config change (median) |')
  console.log('|---:|---:|---:|---:|')
  for (const result of results) {
    console.log(
      `| ${result.pages} | ${format(result.cold)} | ${format(result.change)} | ${format(result.config)} |`,
    )
  }
  console.log('\nchange/config 不含 30 ms 防抖窗口；cold 包含首次全量扫描与 SFC 解析。')

  if (process.env.BENCH_STRICT === '1') {
    results.forEach(assertTarget)
  }
}

await main()
