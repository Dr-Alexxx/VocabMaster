import { capacitorApi } from './capacitor-api.js'

export function getPlatformApi() {
  return window.Capacitor?.isNativePlatform?.() ? capacitorApi : null
}
