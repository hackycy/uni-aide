<template>
  <view class="content">
    <view class="text-area">
      <text class="title">{{ title }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";

const title = ref("Scan Demo");
</script>

<route lang="json">
{
  "style": {
    "navigationBarTitleText": "Scan Demo Page"
  }
}
</route>

<route lang="json" part="tabBar">
{
  "iconPath": "static/home.png",
  "selectedIconPath": "static/home-selected.png",
  "text": "首页"
}
</route>
