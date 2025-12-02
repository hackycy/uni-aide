import { Buffer } from 'node:buffer'
import fs from 'node:fs'

/**
 * 快速比对字符串和文件内容是否相等
 * @param {string} contentStr - 内存中的字符串
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} 比较结果，true 表示内容相等，false 表示不相等
 */
export async function compareStringWithFile(contentStr: string, filePath: string): Promise<boolean> {
  try {
    // 1. 【极速检查】比对“字节”长度
    // Buffer.byteLength 计算 UTF-8 字节长度很快，不需要真的分配内存
    const strByteLen = Buffer.byteLength(contentStr, 'utf8')

    const fileStats = await fs.promises.stat(filePath)

    // 如果字节大小都不一样，直接返回 false
    if (strByteLen !== fileStats.size) {
      return false
    }

    // 2. 【深度检查】流式比对内容
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, {
        encoding: 'utf8', // 假设文件是 UTF-8 文本
        highWaterMark: 64 * 1024, // 每次读 64KB
      })

      let comparedBytes = 0 // 记录目前比对到了字符串的哪个位置
      let match = true

      stream.on('data', (chunk) => {
        // chunk 是文件里读出来的一段字符串
        if (!match)
          return // 已经发现不匹配，跳过后续处理

        // 从原字符串中截取对应长度的一段进行比对
        const subStr = contentStr.slice(comparedBytes, comparedBytes + chunk.length)

        if (subStr !== chunk) {
          match = false
          stream.destroy() // 发现不一样，立即停止读取文件，节省 I/O
        }

        comparedBytes += chunk.length
      })

      stream.on('end', () => resolve(match))
      stream.on('error', err => reject(err))
      stream.on('close', () => resolve(match)) // destroy 后会触发 close
    })
  }
  catch {
    return false
  }
}
