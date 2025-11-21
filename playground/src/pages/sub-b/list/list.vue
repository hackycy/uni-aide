<template>
  <view>SubPackage List</view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';

onShow(() => {
  console.log('SubPackage List page is shown');
});
</script>

<route lang="jsonc" part="subPackage">
{
  "style": {
    "navigationBarTitleText": "SubPackage List Page",
    // #ifdef H5
    "navigationStyle": "custom"
    // #endif
  }
}
</route>