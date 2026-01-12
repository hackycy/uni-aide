import type { Buffer } from 'node:buffer'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'

const { open, rename, stat } = fsPromises

export interface AtomicWriteOptions {
  encoding?: BufferEncoding | null
  mode?: number
  fsync?: boolean // 是否在 rename 前 fsync，默认 true
}

export async function atomicWriteFile(
  targetPath: string,
  data: string | Buffer,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const encoding = options.encoding ?? 'utf8'
  const doFsync = options.fsync ?? true

  const dir = path.dirname(targetPath)
  const base = path.basename(targetPath)

  // 生成同目录的临时文件名：target + .随机串
  const tmpPath = path.join(dir, `${base}.${Date.now()}.tmp`)

  let fd: fsPromises.FileHandle | null = null
  try {
    // 尝试继承原文件的 mode（权限）
    let mode = options.mode
    if (mode == null) {
      try {
        const st = await stat(targetPath)
        mode = st.mode
      }
      catch {
        // 文件不存在就用默认 0o666，受 umask 影响
        mode = 0o666
      }
    }

    // 1. 打开临时文件（不存在才创建），写之前先 truncate
    fd = await open(tmpPath, 'w', mode)

    // 2. 写入内容
    if (typeof data === 'string') {
      await fd.writeFile(data, { encoding })
    }
    else {
      await fd.writeFile(data)
    }

    // 3. 确保写入落盘（可选）
    if (doFsync) {
      await fd.sync()
    }

    // 4. 先关临时文件再 rename（避免句柄占用）
    await fd.close()
    fd = null

    // 5. 原子替换：rename tmp → 目标文件
    await rename(tmpPath, targetPath)
  }
  catch (err) {
    // 失败时清理临时文件
    try {
      if (fd) {
        await fd.close()
      }
    }
    catch {}
    try {
      await fsPromises.unlink(tmpPath)
    }
    catch {}
    throw err
  }
}
