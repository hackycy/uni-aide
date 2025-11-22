// @ts-check
import path from 'node:path'
import process from 'node:process'
import { checkManifestJsonFileSync } from '@uni-aide/unplugin-uni-manifest'
import { checkPagesJsonFileSync } from '@uni-aide/unplugin-uni-pages'

try {
  checkPagesJsonFileSync(path.join(process.cwd(), 'src', 'pages.json'))
  checkManifestJsonFileSync(path.join(process.cwd(), 'src', 'manifest.json'))
}
catch {
  // ignore
}
