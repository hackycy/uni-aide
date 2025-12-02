<template>
  <view>Scan Ignore</view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';

onShow(() => {
  console.log('Scan Ignore Page');
});
</script>

<route lang="jsonc" part="subPackage">
{
  "style": {
    "navigationBarTitleText": "Scan Ignore Page",
    // #ifdef H5
    "navigationStyle": "custom"
    // #endif
  }
}
</route>