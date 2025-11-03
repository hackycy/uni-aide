import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/manifest/index.ts',
    './src/pages/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
})
