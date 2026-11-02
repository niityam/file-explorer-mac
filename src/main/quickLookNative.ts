import { join } from 'path'
import { existsSync } from 'fs'

export interface QuickLookNative {
  initInterceptor(cb: (key: string) => void): void
  isOpen(): boolean
  close(): void
}

let nativeModule: QuickLookNative | null = null

if (process.platform === 'darwin' && !process.env['VITEST']) {
  const possiblePaths = [
    join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'quicklook.node'),
    join(__dirname, 'quicklook.node'),
    join(__dirname, 'native/quicklook.node'),
    join(__dirname, '../main/native/quicklook.node')
  ]
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        nativeModule = require(p) as QuickLookNative
        break
      } catch (e) {
        console.error('[quickLookNative] Failed to load', p, e)
      }
    }
  }
}

export function getQuickLookNative(): QuickLookNative | null {
  return nativeModule
}
