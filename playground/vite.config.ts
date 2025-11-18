import UniManifest from '@uni-aide/unplugin-uni-manifest/vite'
import UniPages from '@uni-aide/unplugin-uni-pages/vite'
import Uni from '@uni-helper/plugin-uni'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    UniPages({
      scanDir: ['src/pages'],
    }),
    UniManifest(),
    Uni(),
  ],
})
