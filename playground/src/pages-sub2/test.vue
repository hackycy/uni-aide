<template>
  <view>Pages Sub2</view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";

onShow(() => {
  console.log("onShow");
});
</script>

<route lang="jsonc" part="subPackage">
{
  "style": {
    "navigationBarTitleText": "Pages Sub2",
    // #ifdef H5
    "navigationStyle": "custom"
    // #endif
  }
}
</route>