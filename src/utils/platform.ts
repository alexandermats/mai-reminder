import '../electron/types'

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean
    }
  }
}

export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!window.electronAPI
}

export const isCapacitorNative = (): boolean => {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform()
}
