<template>
  <view class="content">
    <view class="text-area">
      <text class="title">{{ title }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";

const title = ref("User");
</script>

<route lang="json">
{
  "style": {
    "navigationBarTitleText": "User"
  }
}
</route>

<route lang="json" part="tabBar">
{
  "iconPath": "static/user.png",
  "selectedIconPath": "static/user-selected.png",
  "text": "我的"
}
</route>
