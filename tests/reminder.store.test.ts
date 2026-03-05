import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useReminderStore } from '../src/stores/reminder'
import {
  ReminderLanguage,
  ReminderParserMode,
  ReminderSource,
  ReminderStatus,
  type Reminder,
} from '../src/types/reminder'

const { addListenerMock } = vi.hoisted(() => ({
  addListenerMock: vi.fn(),
}))

const { getDeliveredNotificationsMock } = vi.hoisted(() => ({
  getDeliveredNotificationsMock: vi.fn(() => Promise.resolve({ notifications: [] as unknown[] })),
}))

const { adapterUpdateMock, adapterCreateMock } = vi.hoisted(() => ({
  adapterUpdateMock: vi.fn(),
  adapterCreateMock: vi.fn(),
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    addListener: addListenerMock,
    getDeliveredNotifications: getDeliveredNotificationsMock,
    removeAllDeliveredNotifications: vi.fn(() => Promise.resolve()),
  },
}))

const { appAddListenerMock } = vi.hoisted(() => ({
  appAddListenerMock: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: appAddListenerMock,
  },
}))

vi.mock('../src/services/reminderAdapter', () => ({
  reminderAdapter: {
    update: adapterUpdateMock,
    create: adapterCreateMock,
  },
}))

function makeReminder(id: string, title: string): Reminder {
  const now = new Date('2026-02-23T10:00:00.000Z')
  return {
    id,
    title,
    originalText: title,
    language: ReminderLanguage.EN,
    scheduledAt: new Date('2026-02-24T10:00:00.000Z'),
    source: ReminderSource.TEXT,
    parserMode: ReminderParserMode.LOCAL,
    status: ReminderStatus.PENDING,
    parseConfidence: 0.9,
    createdAt: now,
    updatedAt: now,
  }
}

describe('reminder store duplicate guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    addListenerMock.mockReset()
    appAddListenerMock.mockReset()
    adapterUpdateMock.mockReset()
    adapterCreateMock.mockReset()
    getDeliveredNotificationsMock.mockReset()
    getDeliveredNotificationsMock.mockResolvedValue({ notifications: [] })
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not add duplicate reminders with the same id', () => {
    const store = useReminderStore()
    const first = makeReminder('r-1', 'Workout')
    const updated = makeReminder('r-1', 'Workout updated')

    store.addReminder(first)
    store.addReminder(updated)

    expect(store.reminders).toHaveLength(1)
    expect(store.reminders[0].title).toBe('Workout updated')
  })

  it('keeps a single reminder when local add and IPC created event both fire', () => {
    const onCreatedCallbacks: Array<(reminder: Reminder) => void> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {
      electronAPI: {
        onReminderCreated: (cb: (reminder: Reminder) => void) => {
          onCreatedCallbacks.push(cb)
        },
      },
    }

    const store = useReminderStore()
    store.initialize()

    const reminder = makeReminder('r-2', 'Call mom every Thursday at 7am')
    store.addReminder(reminder) // local save path
    onCreatedCallbacks[0]?.(reminder) // IPC broadcast path

    expect(store.reminders).toHaveLength(1)
    expect(store.reminders[0].id).toBe('r-2')
  })

  it('initialize is idempotent and does not register callbacks twice', () => {
    const onReminderCreated = vi.fn()
    const onReminderTriggered = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {
      electronAPI: {
        onReminderCreated,
        onReminderTriggered,
      },
    }

    const store = useReminderStore()
    store.initialize()
    store.initialize()

    expect(onReminderCreated).toHaveBeenCalledTimes(1)
    expect(onReminderTriggered).toHaveBeenCalledTimes(1)
  })

  it('marks reminder as sent when capacitor local notification is received', async () => {
    const reminder = makeReminder('r-3', 'Pay rent')

    const mockWindow = {
      Capacitor: {
        isNativePlatform: () => true,
      },
    }
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      writable: true,
      configurable: true,
    })

    const store = useReminderStore()
    store.addReminder(reminder)
    adapterUpdateMock.mockResolvedValue({ ...reminder, status: ReminderStatus.SENT })
    adapterCreateMock.mockResolvedValue(reminder)
    store.initialize()

    const listenerEntry = addListenerMock.mock.calls.find(
      (entry) => entry[0] === 'localNotificationReceived'
    )
    const listener = listenerEntry?.[1] as ((payload: unknown) => void) | undefined
    expect(listener).toBeDefined()

    listener?.({
      extra: {
        reminderId: reminder.id,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(store.reminders[0].status).toBe(ReminderStatus.SENT)
    expect(adapterCreateMock).not.toHaveBeenCalled()
  })

  it('marks reminder as sent when payload only contains numeric notification id', async () => {
    const reminder = makeReminder('r-4', 'Submit report')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {
      Capacitor: {
        isNativePlatform: () => true,
      },
    }

    const store = useReminderStore()
    store.addReminder(reminder)
    adapterUpdateMock.mockResolvedValue({ ...reminder, status: ReminderStatus.SENT })
    adapterCreateMock.mockResolvedValue(reminder)
    store.initialize()

    const listenerEntry = addListenerMock.mock.calls.find(
      (entry) => entry[0] === 'localNotificationReceived'
    )
    const listener = listenerEntry?.[1] as ((payload: unknown) => void) | undefined
    expect(listener).toBeDefined()

    const idToNumber = (id: string): number => {
      let hash = 0
      for (let i = 0; i < id.length; i++) {
        const char = id.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash
      }
      return Math.abs(hash)
    }

    listener?.({
      id: idToNumber(reminder.id),
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(store.reminders[0].status).toBe(ReminderStatus.SENT)
    expect(adapterCreateMock).not.toHaveBeenCalled()
  })

  it('advances recurring reminder to next occurrence on android trigger', async () => {
    const recurring = {
      ...makeReminder('r-5', 'Hydrate'),
      scheduledAt: new Date('2026-02-24T10:00:00.000Z'),
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=1',
    }
    const sentReminder = { ...recurring, status: ReminderStatus.SENT }
    const nextReminder = {
      ...recurring,
      id: 'r-5-next',
      status: ReminderStatus.PENDING,
      scheduledAt: new Date('2026-02-24T11:00:00.000Z'),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {
      Capacitor: {
        isNativePlatform: () => true,
      },
    }

    adapterUpdateMock.mockResolvedValue(sentReminder)
    adapterCreateMock.mockResolvedValue(nextReminder)

    const store = useReminderStore()
    store.addReminder(recurring)
    store.initialize()

    const listenerEntry = addListenerMock.mock.calls.find(
      (entry) => entry[0] === 'localNotificationReceived'
    )
    const listener = listenerEntry?.[1] as ((payload: unknown) => void) | undefined
    expect(listener).toBeDefined()

    listener?.({
      extra: {
        reminderId: recurring.id,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(adapterUpdateMock).toHaveBeenCalledWith(recurring.id, { status: ReminderStatus.SENT })
    expect(adapterCreateMock).toHaveBeenCalledTimes(1)
    expect(store.reminders.find((item) => item.id === recurring.id)?.status).toBe(
      ReminderStatus.SENT
    )
    expect(store.reminders.find((item) => item.id === nextReminder.id)?.status).toBe(
      ReminderStatus.PENDING
    )
  })

  it('highlights missed reminders when returning to foreground on Android', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {
      Capacitor: {
        isNativePlatform: () => true,
      },
    }

    const now = Date.now()
    const fiveMinsAgo = new Date(now - 5 * 60 * 1000)

    // This reminder was sent 5 mins ago (definitely missed, assuming 60s display time)
    const missedReminder = {
      ...makeReminder('r-missed', 'Missed stuff'),
      status: ReminderStatus.SENT,
      scheduledAt: fiveMinsAgo,
    }

    // This reminder was sent just 200ms ago — well within the 1s Android threshold
    const recentReminder = {
      ...makeReminder('r-recent', 'Recent stuff'),
      status: ReminderStatus.SENT,
      scheduledAt: new Date(now - 200),
    }

    const store = useReminderStore()
    store.addReminder(missedReminder)
    store.addReminder(recentReminder)
    store.initialize()
    getDeliveredNotificationsMock.mockResolvedValue({
      notifications: [{ extra: { reminderId: 'r-missed' } }] as unknown[],
    })

    const listenerEntry = appAddListenerMock.mock.calls.find(
      (entry) => entry[0] === 'appStateChange'
    )
    const listener = listenerEntry?.[1] as ((state: { isActive: boolean }) => void) | undefined
    expect(listener).toBeDefined()

    // Trigger app resume
    listener?.({ isActive: true })

    await new Promise((resolve) => setTimeout(resolve, 0))

    // Should switch to SENT tab
    expect(store.filterStatus).toBe(ReminderStatus.SENT)

    // Only the missed reminder should be highlighted
    const missedIds = Array.from(store.missedReminderIds)
    expect(missedIds).toContain('r-missed')
    expect(missedIds).not.toContain('r-recent')
  })
})
