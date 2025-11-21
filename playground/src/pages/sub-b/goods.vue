<template>
  <view>SubPackage B Goods</view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';

onShow(() => {
  console.log('SubPackage B Goods');
});
</script>

<route lang="jsonc" part="subPackage">
{
  "style": {
    "navigationBarTitleText": "SubPackage B Goods",
    // #ifdef H5
    "navigationStyle": "custom"
    // #endif
  }
}
</route>