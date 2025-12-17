<template>
  <view>SubPackage B Goods</view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';

onShow(() => {
  console.log('OneCard Order List');
});
</script>

<route lang="jsonc" part="subPackage">
{
  "style": {
    "navigationBarTitleText": "OneCard Order List",
    // #ifdef H5
    "navigationStyle": "custom"
    // #endif
  }
}
</route>