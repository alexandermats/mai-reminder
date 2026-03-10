import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElectronNotificationAdapter } from '../../src/electron/notificationAdapter'
import type { Reminder } from '../../src/types/reminder'

// --- Mocks ---

export const mockShow = vi.fn()
export const mockOnHandlers: Map<string, ((...args: unknown[]) => void)[]> = new Map()

type MockNotificationOptions = {
  title?: string
  body?: string
  actions?: { type: string; text: string }[]
  urgency?: 'low' | 'normal' | 'critical'
}

vi.mock('electron', () => {
  return {
    Notification: class MockNotification {
      public options: MockNotificationOptions

      constructor(options: MockNotificationOptions) {
        this.options = options
        lastConstructorOptions = options
      }

      show() {
        mockShow()
      }

      on(event: string, handler: (...args: unknown[]) => void) {
        const handlers = mockOnHandlers.get(event) ?? []
        handlers.push(handler)
        mockOnHandlers.set(event, handlers)
      }

      static isSupported() {
        return true
      }
    },
  }
})

/** Holds options from the most recently constructed MockNotification (set by mock above) */
let lastConstructorOptions: MockNotificationOptions | null = null

describe('ElectronNotificationAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnHandlers.clear()
    lastConstructorOptions = null
    // Default: macOS
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
  })

  const mockReminder = {
    id: '123',
    title: 'Do laundry',
    scheduledAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    recurrenceRule: undefined,
    priority: false,
  } as unknown as Reminder

  const mockPriorityReminder = {
    ...mockReminder,
    id: '456',
    priority: true,
  } as unknown as Reminder

  it('creates and shows a notification with the correct payload', () => {
    const adapter = new ElectronNotificationAdapter()
    adapter.showNotification(mockReminder)
    expect(mockShow).toHaveBeenCalled()
  })

  it('does not throw if the notification system fails', () => {
    mockShow.mockImplementationOnce(() => {
      throw new Error('OS error')
    })

    const adapter = new ElectronNotificationAdapter()
    expect(() => {
      adapter.showNotification(mockReminder)
    }).not.toThrow()
  })

  describe('macOS native action buttons', () => {
    it('creates a notification and shows it on macOS', () => {
      const adapter = new ElectronNotificationAdapter()
      adapter.showNotification(mockReminder)
      expect(mockShow).toHaveBeenCalled()
    })

    it('calls onAction with snooze-15m when action button 0 is pressed', () => {
      const onAction = vi.fn()
      const adapter = new ElectronNotificationAdapter(onAction)
      adapter.showNotification(mockReminder)

      // Simulate Electron firing the 'action' event with button index 0
      const actionHandlers = mockOnHandlers.get('action') ?? []
      expect(actionHandlers.length).toBeGreaterThan(0)
      actionHandlers[0](new Event('action'), 0)

      expect(onAction).toHaveBeenCalledWith(mockReminder.id, 'snooze-15m')
    })

    it('calls onAction with snooze-1h when action button 1 is pressed', () => {
      const onAction = vi.fn()
      const adapter = new ElectronNotificationAdapter(onAction)
      adapter.showNotification(mockReminder)

      const actionHandlers = mockOnHandlers.get('action') ?? []
      actionHandlers[0](new Event('action'), 1)

      expect(onAction).toHaveBeenCalledWith(mockReminder.id, 'snooze-1h')
    })

    it('calls onAction with snooze-1d when action button 2 is pressed', () => {
      const onAction = vi.fn()
      const adapter = new ElectronNotificationAdapter(onAction)
      adapter.showNotification(mockReminder)

      const actionHandlers = mockOnHandlers.get('action') ?? []
      actionHandlers[0](new Event('action'), 2)

      expect(onAction).toHaveBeenCalledWith(mockReminder.id, 'snooze-1d')
    })

    it('calls onAction with dismiss when action button 3 is pressed', () => {
      const onAction = vi.fn()
      const adapter = new ElectronNotificationAdapter(onAction)
      adapter.showNotification(mockReminder)

      const actionHandlers = mockOnHandlers.get('action') ?? []
      actionHandlers[0](new Event('action'), 3)

      expect(onAction).toHaveBeenCalledWith(mockReminder.id, 'dismiss')
    })
  })

  describe('DnD bypass for priority reminders (7-3)', () => {
    it('sets urgency:critical on Linux for a priority reminder', () => {
      vi.stubGlobal('process', { ...process, platform: 'linux' })

      const adapter = new ElectronNotificationAdapter()
      adapter.showNotification(mockPriorityReminder)

      expect(lastConstructorOptions).not.toBeNull()
      expect(lastConstructorOptions?.urgency).toBe('critical')
    })

    it('does not set urgency on macOS for a priority reminder', () => {
      // beforeEach already sets platform to darwin
      const adapter = new ElectronNotificationAdapter()
      adapter.showNotification(mockPriorityReminder)

      expect(lastConstructorOptions).not.toBeNull()
      expect(lastConstructorOptions?.urgency).toBeUndefined()
    })

    it('does not set urgency on Linux for a non-priority reminder', () => {
      vi.stubGlobal('process', { ...process, platform: 'linux' })

      const adapter = new ElectronNotificationAdapter()
      adapter.showNotification(mockReminder)

      expect(lastConstructorOptions).not.toBeNull()
      expect(lastConstructorOptions?.urgency).toBeUndefined()
    })
  })

  describe('Windows/Linux show-overlay flow', () => {
    beforeEach(() => {
      vi.stubGlobal('process', { ...process, platform: 'win32' })
    })

    it('calls onAction with show-app when notification body is clicked on Windows', () => {
      const onAction = vi.fn()
      const adapter = new ElectronNotificationAdapter(onAction)
      adapter.showNotification(mockReminder)

      // Simulate clicking the notification body
      const clickHandlers = mockOnHandlers.get('click') ?? []
      expect(clickHandlers.length).toBeGreaterThan(0)
      clickHandlers[0]()

      expect(onAction).toHaveBeenCalledWith(mockReminder.id, 'show-app')
    })

    it('does not call onAction on Windows click if no callback is provided', () => {
      const adapter = new ElectronNotificationAdapter()
      adapter.showNotification(mockReminder)

      const clickHandlers = mockOnHandlers.get('click') ?? []
      expect(() => clickHandlers[0]?.()).not.toThrow()
    })
  })
})
