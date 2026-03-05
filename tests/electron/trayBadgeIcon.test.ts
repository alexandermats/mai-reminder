import { describe, expect, it } from 'vitest'
import {
  overlayCountBadgeOnBitmap,
  resolveBadgeText,
  resolveTrayIconSizePx,
} from '../../src/electron/trayBadgeIcon'

function containsRedPixel(bitmap: Buffer): boolean {
  for (let i = 0; i < bitmap.length; i += 4) {
    const b = bitmap[i]
    const g = bitmap[i + 1]
    const r = bitmap[i + 2]
    const a = bitmap[i + 3]
    if (a > 0 && r >= 180 && g <= 90 && b <= 90) return true
  }
  return false
}

describe('trayBadgeIcon', () => {
  it('draws no badge for zero count', () => {
    const size = 32
    const source = Buffer.alloc(size * size * 4, 0)
    const out = overlayCountBadgeOnBitmap(source, size, 0)
    expect(out.equals(source)).toBe(true)
  })

  it('draws a red badge for positive count', () => {
    const size = 32
    const source = Buffer.alloc(size * size * 4, 0)
    const out = overlayCountBadgeOnBitmap(source, size, 7)
    expect(containsRedPixel(out)).toBe(true)
  })

  it('caps large text based on icon size', () => {
    expect(resolveBadgeText(123, 32)).toBe('99+')
    expect(resolveBadgeText(123, 16)).toBe('99')
  })

  it('uses larger tray icon size on Windows', () => {
    expect(resolveTrayIconSizePx('win32')).toBe(32)
    expect(resolveTrayIconSizePx('darwin')).toBe(16)
    expect(resolveTrayIconSizePx('linux')).toBe(16)
  })
})
