<template>
  <view>Comment</view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';

onShow(() => {
  console.log('Comment page is shown');
});
</script>

<route lang="jsonc" part="subPackage">
{
  "style": {
    "navigationBarTitleText": "Comment Page",
    // #ifdef H5
    "navigationStyle": "custom"
    // #endif
  }
}
</route>