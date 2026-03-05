import { describe, expect, it } from 'vitest'
import { buildTrayBadgeSvg, resolveTrayIconSizePx } from '../../src/electron/trayBadgeIcon'

describe('trayBadgeIcon', () => {
  it('renders badge text for regular counts', () => {
    const svg = buildTrayBadgeSvg('data:image/png;base64,AAA', 32, 7)
    expect(svg).toContain('>7</text>')
    expect(svg).toContain('fill="#d32f2f"')
  })

  it('caps large badge text at 99+', () => {
    const svg = buildTrayBadgeSvg('data:image/png;base64,AAA', 32, 123)
    expect(svg).toContain('>99+</text>')
  })

  it('uses larger tray icon size on Windows', () => {
    expect(resolveTrayIconSizePx('win32')).toBe(32)
    expect(resolveTrayIconSizePx('darwin')).toBe(16)
    expect(resolveTrayIconSizePx('linux')).toBe(16)
  })
})
