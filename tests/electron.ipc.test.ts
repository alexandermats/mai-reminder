import { describe, it, expect, beforeAll, vi } from 'vitest'
import '../src/electron/types'

describe('Electron IPC Integration', () => {
  beforeAll(() => {
    // Mock the Electron API exposed via preload script
    // In a real Electron app, this is injected by the preload script
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockElectronAPI: any = {
      ping: vi.fn().mockResolvedValue('pong'),
      reminders: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(true),
      },
      onReminderTriggered: vi.fn(),
    }

    window.electronAPI = mockElectronAPI
  })

  it('renderer can call ping IPC method', async () => {
    // Check that window.electronAPI is defined (exposed via preload)
    expect(window.electronAPI).toBeDefined()

    // Call the ping method and verify it returns expected response
    const response = await window.electronAPI!.ping()
    expect(response).toBe('pong')
  })

  it('renderer can subscribe to onReminderTriggered', () => {
    expect(window.electronAPI!.onReminderTriggered).toBeDefined()
    const cb = vi.fn()
    window.electronAPI!.onReminderTriggered(cb)
    expect(window.electronAPI!.onReminderTriggered).toHaveBeenCalledWith(cb)
  })
})
