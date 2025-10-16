declare module '~uni-pages' {
  import type { PageMetaDatum } from '@uni-aide/types/pages'
  import type { SubPackage } from '@uni-aide/types/pages'

  export const pages: PageMetaDatum[]
  export const subPackages: SubPackage[]
}
