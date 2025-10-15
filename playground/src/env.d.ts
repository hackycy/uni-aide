/// <reference types="vite/client" />
/// <reference types="@uni-aide/vite-plugin-pages/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, any>
  export default component
}
