function defineConfig(config: any) {
  return config
}

const enabled = true

export default defineConfig({
  // config comment
  pages: [
    {
      path: 'pages/index/index',
      // #ifdef H5
      style: { navigationStyle: 'custom' },
      // #endif
    },
  ],
  enabled,
})
