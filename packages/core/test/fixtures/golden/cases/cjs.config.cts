function wrap(config: any) {
  return config
}

module.exports = wrap({
  // cjs comment
  pages: [
    {
      path: 'pages/index/index',
      // #ifdef H5
      style: { navigationStyle: 'custom' },
      // #endif
    },
  ],
})
