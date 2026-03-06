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

const { adapterListMock } = vi.hoisted(() => ({
  adapterListMock: vi.fn(() => Promise.resolve([] as Reminder[])),
}))

const { syncMock } = vi.hoisted(() => ({
  syncMock: vi.fn(() => Promise.resolve()),
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
    list: adapterListMock,
    update: adapterUpdateMock,
    create: adapterCreateMock,
  },
}))

vi.mock('../src/services/syncEngine', () => ({
  syncEngine: {
    sync: syncMock,
    backfillLocalToCloud: vi.fn(() =>
      Promise.resolve({ attempted: 0, pushed: 0, failed: 0, skipped: 0 })
    ),
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
    adapterListMock.mockReset()
    adapterListMock.mockResolvedValue([])
    adapterUpdateMock.mockReset()
    adapterCreateMock.mockReset()
    syncMock.mockReset()
    syncMock.mockResolvedValue(undefined)
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

  it('updates existing reminder when IPC reminder:updated event arrives', () => {
    const onUpdatedCallbacks: Array<(reminder: Reminder) => void> = []
    Object.defineProperty(globalThis, 'window', {
      value: {
        electronAPI: {
          onReminderUpdated: (cb: (reminder: Reminder) => void) => {
            onUpdatedCallbacks.push(cb)
          },
        },
      },
      writable: true,
      configurable: true,
    })

    const store = useReminderStore()
    const initial = makeReminder('r-updated', 'Hourly check')
    store.addReminder(initial)
    store.initialize()

    const updated = {
      ...initial,
      scheduledAt: new Date('2026-02-24T12:00:00.000Z'),
      updatedAt: new Date('2026-02-24T10:30:00.000Z'),
    }
    onUpdatedCallbacks[0]?.(updated)

    expect(store.reminders).toHaveLength(1)
    expect(store.reminders[0].id).toBe('r-updated')
    expect(store.reminders[0].scheduledAt.toISOString()).toBe('2026-02-24T12:00:00.000Z')
  })

  it('removes reminder when IPC reminder:deleted event arrives', () => {
    const onDeletedCallbacks: Array<(id: string) => void> = []
    Object.defineProperty(globalThis, 'window', {
      value: {
        electronAPI: {
          onReminderDeleted: (cb: (id: string) => void) => {
            onDeletedCallbacks.push(cb)
          },
        },
      },
      writable: true,
      configurable: true,
    })

    const store = useReminderStore()
    const reminder = makeReminder('r-deleted', 'To be removed')
    store.addReminder(reminder)
    store.initialize()

    onDeletedCallbacks[0]?.('r-deleted')

    expect(store.reminders).toHaveLength(0)
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

  it('reconciles overdue recurring reminders in place on startup without creating duplicates', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const recurring = {
      ...makeReminder('r-startup-1', 'Stretch'),
      scheduledAt: new Date('2026-03-06T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    }

    adapterListMock.mockResolvedValue([recurring])
    adapterUpdateMock.mockImplementation(async (_id: string, changes: Partial<Reminder>) => ({
      ...recurring,
      ...changes,
      status: ReminderStatus.PENDING,
      scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
      updatedAt: now,
    }))

    const store = useReminderStore()
    await store.reconcileStartupReminders()

    expect(adapterUpdateMock).toHaveBeenCalledWith(
      recurring.id,
      expect.objectContaining({
        status: ReminderStatus.PENDING,
        _isSync: true,
      })
    )
    expect(adapterCreateMock).not.toHaveBeenCalled()
    expect(store.reminders).toHaveLength(1)
    expect(store.reminders[0].id).toBe(recurring.id)
    expect(store.reminders[0].status).toBe(ReminderStatus.PENDING)
    expect(store.reminders[0].scheduledAt.toISOString()).toBe('2026-03-07T10:00:00.000Z')
  })

  it('marks overdue recurring reminder as sent when series has no next occurrence', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const finishedSeries = {
      ...makeReminder('r-startup-finished', 'One-off recurring'),
      scheduledAt: new Date('2026-03-06T10:00:00.000Z'),
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=1;COUNT=1',
    }

    adapterListMock.mockResolvedValue([finishedSeries])
    adapterUpdateMock.mockImplementation(async (_id: string, changes: Partial<Reminder>) => ({
      ...finishedSeries,
      ...changes,
      status: ReminderStatus.SENT,
      updatedAt: now,
    }))

    const store = useReminderStore()
    await store.reconcileStartupReminders()

    expect(adapterUpdateMock).toHaveBeenCalledWith(
      finishedSeries.id,
      expect.objectContaining({
        status: ReminderStatus.SENT,
        _isSync: true,
      })
    )
    expect(store.reminders[0].status).toBe(ReminderStatus.SENT)
  })

  it('runs cloud sync before and after startup reconciliation when cloud sync is enabled', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const order: string[] = []
    const recurring = {
      ...makeReminder('r-startup-sync', 'Sync me'),
      scheduledAt: new Date('2026-03-06T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    }
    const reconciled = {
      ...recurring,
      scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
      updatedAt: now,
    }

    adapterListMock
      .mockImplementationOnce(async () => {
        order.push('list')
        return [recurring]
      })
      .mockImplementationOnce(async () => {
        order.push('list')
        return [reconciled]
      })
    adapterUpdateMock.mockImplementation(async (_id: string, changes: Partial<Reminder>) => {
      order.push('update')
      return {
        ...recurring,
        ...changes,
        status: ReminderStatus.PENDING,
        scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
        updatedAt: now,
      }
    })
    syncMock.mockImplementation(async () => {
      order.push('sync')
    })

    const store = useReminderStore()
    const settingsStore = (await import('../src/stores/settings')).useSettingsStore()
    settingsStore.cloudSyncEnabled = true

    await store.reconcileStartupReminders()

    expect(order).toEqual(['sync', 'list', 'update', 'sync', 'list'])
  })

  it('is idempotent across repeated startup reconciliation runs', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const state = {
      reminder: {
        ...makeReminder('r-startup-idempotent', 'Do not duplicate'),
        scheduledAt: new Date('2026-03-06T10:00:00.000Z'),
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      },
    }

    adapterListMock.mockImplementation(async () => [state.reminder])
    adapterUpdateMock.mockImplementation(async (_id: string, changes: Partial<Reminder>) => {
      state.reminder = {
        ...state.reminder,
        ...changes,
        status: ReminderStatus.PENDING,
        scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
        updatedAt: now,
      }
      return state.reminder
    })

    const store = useReminderStore()
    await store.reconcileStartupReminders()
    await store.reconcileStartupReminders()

    expect(adapterUpdateMock).toHaveBeenCalledTimes(1)
    expect(store.reminders).toHaveLength(1)
    expect(store.reminders[0].id).toBe(state.reminder.id)
  })
})
