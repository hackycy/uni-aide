declare module '~uni-pages' {
  import type { PageMetaDatum } from './src/index'
  import type { SubPackage } from './src/index'

  export const pages: PageMetaDatum[]
  export const subPackages: SubPackage[]
}
