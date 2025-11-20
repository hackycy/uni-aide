<template>
  <view class="content">
    <view class="text-area">
      <text class="title">{{ title }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";

const title = ref("Home");
</script>

<route lang="json">
{
  "style": {
    "navigationBarTitleText": "Home"
  }
}
</route>

<route lang="json" part="tabBar" seq="0">
{
  "iconPath": "static/home.png",
  "selectedIconPath": "static/home-selected.png",
  "text": "首页"
}
</route>
