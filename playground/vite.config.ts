import UniManifest from '@uni-aide/vite-plugin-manifest'
import UniPages from '@uni-aide/vite-plugin-pages'
// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
import Uni from '@uni-helper/plugin-uni'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [UniPages(), UniManifest(), Uni()],
})
