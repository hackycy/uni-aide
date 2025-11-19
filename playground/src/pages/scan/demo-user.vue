<template>
  <view class="content">
    <view class="text-area">
      <text class="title">{{ title }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";

const title = ref("Scan Demo User");
</script>

<route lang="json">
{
  "style": {
    "navigationBarTitleText": "Scan Demo User Page"
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
