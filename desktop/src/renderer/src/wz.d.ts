import type { WzApi } from '../../preload'

declare global {
  interface Window {
    wz: WzApi
  }
}

export {}
