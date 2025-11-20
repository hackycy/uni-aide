<template>
  <view>Login</view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";

onShow(() => {
  console.log("Login page is shown");
});
</script>

<route lang="jsonc">
{
  "style": {
    "navigationBarTitleText": "Login Page",
    // #ifdef H5
    "navigationStyle": "custom"
    // #endif
  }
}
</route>