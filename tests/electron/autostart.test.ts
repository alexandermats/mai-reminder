import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSetLoginItemSettings = vi.fn()

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: mockSetLoginItemSettings,
  },
}))

describe('AutoStart Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls app.setLoginItemSettings with true when enabled', async () => {
    const { setAutoStart } = await import('../../electron/autostart')

    setAutoStart(true)

    expect(mockSetLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
  })

  it('calls app.setLoginItemSettings with false when disabled', async () => {
    const { setAutoStart } = await import('../../electron/autostart')

    setAutoStart(false)

    expect(mockSetLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false })
  })
})
