import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
const mockRegister = vi.fn()
const mockUnregisterAll = vi.fn()

vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  },
  globalShortcut: {
    register: mockRegister,
    unregisterAll: mockUnregisterAll,
    isRegistered: vi.fn().mockReturnValue(false),
  },
}))

describe('Global Shortcut Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers the global shortcut when required', async () => {
    // This will fail initially because the module doesn't exist or isn't implemented
    const { registerGlobalShortcuts } = await import('../../electron/shortcuts')

    registerGlobalShortcuts('CommandOrControl+Shift+Space')

    expect(mockRegister).toHaveBeenCalledWith(
      expect.stringMatching(/CommandOrControl\+Shift\+Space/i),
      expect.any(Function)
    )
  })

  it('unregisters all shortcuts on cleanup', async () => {
    const { unregisterGlobalShortcuts } = await import('../../electron/shortcuts')

    unregisterGlobalShortcuts()

    expect(mockUnregisterAll).toHaveBeenCalled()
  })
})
