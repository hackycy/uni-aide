import UniManifest from '@uni-aide/unplugin-uni-manifest/vite'
import UniPages from '@uni-aide/vite-plugin-pages'
import Uni from '@uni-helper/plugin-uni'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [UniPages(), UniManifest(), Uni()],
})
