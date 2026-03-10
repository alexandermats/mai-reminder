import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CapacitorNotificationAdapter } from '../src/services/capacitorNotificationAdapter'
import { useSettingsStore } from '../src/stores/settings'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  ReminderStatus,
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
} from '../src/types/reminder'
import type { Reminder } from '../src/types/reminder'

let isNativePlatformMock = true

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatformMock,
  },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: vi.fn(),
    cancel: vi.fn(),
    requestPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })),
    checkPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })),
    checkExactNotificationSetting: vi.fn(() => Promise.resolve({ exact_alarm: 'granted' })),
    createChannel: vi.fn(() => Promise.resolve()),
    registerActionTypes: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('../src/stores/settings', () => ({
  useSettingsStore: vi.fn(),
}))

describe('CapacitorNotificationAdapter (E9-05)', () => {
  let adapter: CapacitorNotificationAdapter

  const mockReminder: Reminder = {
    id: 'abc-123',
    title: 'Test Reminder',
    originalText: 'Test Reminder',
    language: ReminderLanguage.EN,
    scheduledAt: new Date(Date.now() + 10000),
    source: ReminderSource.TEXT,
    parserMode: ReminderParserMode.LOCAL,
    status: ReminderStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatformMock = true
    vi.mocked(useSettingsStore).mockReturnValue({
      hourlyReminderStartTime: '09:00',
      hourlyReminderEndTime: '22:00',
      priorityDndBypass: false,
    } as unknown as ReturnType<typeof useSettingsStore>)
    adapter = new CapacitorNotificationAdapter()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules a notification with the OS', async () => {
    await adapter.schedule(mockReminder)

    expect(LocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          title: 'Mai Reminder',
          body: 'Test Reminder',
          schedule: expect.objectContaining({
            at: mockReminder.scheduledAt,
            allowWhileIdle: true,
          }),
          channelId: 'reminders',
        }),
      ],
    })
  })

  it('includes actionTypeId REMINDER_SNOOZE in scheduled notification', async () => {
    await adapter.schedule(mockReminder)

    expect(LocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          actionTypeId: 'REMINDER_SNOOZE',
        }),
      ],
    })
  })

  it('cancels a scheduled notification', async () => {
    await adapter.cancel(mockReminder.id)

    expect(LocalNotifications.cancel).toHaveBeenCalledWith({
      notifications: [{ id: expect.any(Number) }],
    })
  })

  it('requests permissions if not granted', async () => {
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({ display: 'denied' })

    await adapter.schedule(mockReminder)

    expect(LocalNotifications.requestPermissions).toHaveBeenCalled()
  })

  it('schedules recurring reminders at the next valid future occurrence', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T10:15:00.000Z'))

    const recurringPastReminder: Reminder = {
      ...mockReminder,
      id: 'recurring-past',
      scheduledAt: new Date('2026-03-01T10:00:00.000Z'),
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=2;BYHOUR=10,12,14,16,18,20,22;BYMINUTE=0;BYSECOND=0',
    }

    await adapter.schedule(recurringPastReminder)

    expect(LocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          schedule: expect.objectContaining({
            at: new Date('2026-03-01T12:00:00.000Z'),
            allowWhileIdle: true,
          }),
          channelId: 'reminders',
        }),
      ],
    })
  })

  it('disables allowWhileIdle when exact alarms are unavailable', async () => {
    vi.mocked(LocalNotifications.checkExactNotificationSetting).mockResolvedValueOnce({
      exact_alarm: 'denied',
    })

    await adapter.schedule(mockReminder)

    expect(LocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          schedule: expect.objectContaining({
            at: mockReminder.scheduledAt,
            allowWhileIdle: false,
          }),
        }),
      ],
    })
  })

  it('does not schedule recurring reminders when no future occurrence exists', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T10:15:00.000Z'))

    const completedRecurringReminder: Reminder = {
      ...mockReminder,
      id: 'recurring-finished',
      scheduledAt: new Date('2026-03-01T10:00:00.000Z'),
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=1;COUNT=1',
    }

    await adapter.schedule(completedRecurringReminder)

    expect(LocalNotifications.schedule).not.toHaveBeenCalled()
  })

  describe('initialize (E15-01)', () => {
    it('calls LocalNotifications.registerActionTypes when on native platform', async () => {
      isNativePlatformMock = true
      await adapter.initialize()

      // Flush promises to let dynamic import resolve
      await new Promise(process.nextTick)

      expect(LocalNotifications.registerActionTypes).toHaveBeenCalledWith({
        types: [
          expect.objectContaining({
            id: 'REMINDER_SNOOZE',
            actions: expect.arrayContaining([
              expect.objectContaining({ id: 'snooze-15m', title: '+15 min' }),
              expect.objectContaining({ id: 'snooze-1h', title: '+1 hour' }),
              expect.objectContaining({ id: 'snooze-1d', title: '+1 day' }),
              expect.objectContaining({ id: 'dismiss', title: 'Dismiss', destructive: true }),
            ]),
          }),
        ],
      })
    })

    it('does not call LocalNotifications.registerActionTypes when not on native platform', async () => {
      isNativePlatformMock = false
      await adapter.initialize()

      // Flush promises to let dynamic import resolve
      await new Promise(process.nextTick)

      expect(LocalNotifications.registerActionTypes).not.toHaveBeenCalled()
    })
  })

  describe('DnD bypass for priority reminders (7-3)', () => {
    const mockPriorityReminder: Reminder = {
      ...mockReminder,
      id: 'priority-abc-123',
      priority: true,
    }

    beforeEach(() => {
      // Enable priorityDndBypass for these tests
      vi.mocked(useSettingsStore).mockReturnValue({
        hourlyReminderStartTime: '09:00',
        hourlyReminderEndTime: '22:00',
        priorityDndBypass: true,
      } as unknown as ReturnType<typeof useSettingsStore>)
    })

    it('schedules a priority reminder using the priority-reminders channel when setting is on', async () => {
      await adapter.schedule(mockPriorityReminder)

      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            channelId: 'priority-reminders',
          }),
        ],
      })
    })

    it('schedules a priority reminder using the default channel when priorityDndBypass is off', async () => {
      vi.mocked(useSettingsStore).mockReturnValue({
        hourlyReminderStartTime: '09:00',
        hourlyReminderEndTime: '22:00',
        priorityDndBypass: false,
      } as unknown as ReturnType<typeof useSettingsStore>)

      await adapter.schedule(mockPriorityReminder)

      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            channelId: 'reminders',
          }),
        ],
      })
    })

    it('schedules a non-priority reminder using the default reminders channel', async () => {
      await adapter.schedule(mockReminder)

      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            channelId: 'reminders',
          }),
        ],
      })
    })

    it('creates the priority-reminders channel when scheduling a priority reminder', async () => {
      vi.mocked(LocalNotifications.createChannel).mockClear()

      await adapter.schedule(mockPriorityReminder)

      expect(LocalNotifications.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'priority-reminders',
          importance: 5,
        })
      )
    })

    it('does not create the priority-reminders channel for non-priority reminders', async () => {
      vi.mocked(LocalNotifications.createChannel).mockClear()

      await adapter.schedule(mockReminder)

      const calls = vi.mocked(LocalNotifications.createChannel).mock.calls
      const priorityChannelCall = calls.find((args) => {
        const arg = args[0] as { id?: string }
        return arg.id === 'priority-reminders'
      })
      expect(priorityChannelCall).toBeUndefined()
    })
  })
})
