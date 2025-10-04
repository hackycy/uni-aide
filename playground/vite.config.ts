// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
import Uni from '@uni-helper/plugin-uni'
import UniPages from '@vite-plugin-uni/pages'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [Uni(), UniPages()],
})
