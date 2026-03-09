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

const { adapterGetByIdMock } = vi.hoisted(() => ({
  adapterGetByIdMock: vi.fn(() => Promise.resolve(null as Reminder | null)),
}))

const { adapterListMock } = vi.hoisted(() => ({
  adapterListMock: vi.fn(() => Promise.resolve([] as Reminder[])),
}))

const { syncMock, onDataChangedMock } = vi.hoisted(() => ({
  syncMock: vi.fn(() => Promise.resolve()),
  onDataChangedMock: vi.fn(() => () => {}),
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
    getById: adapterGetByIdMock,
    update: adapterUpdateMock,
    create: adapterCreateMock,
  },
}))

vi.mock('../src/services/syncEngine', () => ({
  syncEngine: {
    sync: syncMock,
    onDataChanged: onDataChangedMock,
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
    adapterCreateMock.mockImplementation(async (input: Record<string, unknown>) => ({
      id: String(input.id ?? 'created-default'),
      title: String(input.title ?? 'Created'),
      originalText: String(input.originalText ?? 'Created'),
      language: (input.language as ReminderLanguage) ?? ReminderLanguage.EN,
      scheduledAt:
        input.scheduledAt instanceof Date
          ? input.scheduledAt
          : new Date('2026-03-06T10:00:00.000Z'),
      source: (input.source as ReminderSource) ?? ReminderSource.TEXT,
      parserMode: (input.parserMode as ReminderParserMode) ?? ReminderParserMode.LOCAL,
      status: (input.status as ReminderStatus) ?? ReminderStatus.PENDING,
      parseConfidence:
        typeof input.parseConfidence === 'number' ? input.parseConfidence : undefined,
      recurrenceRule: typeof input.recurrenceRule === 'string' ? input.recurrenceRule : undefined,
      createdAt: new Date('2026-03-06T09:00:00.000Z'),
      updatedAt: new Date('2026-03-06T09:00:00.000Z'),
    }))
    adapterGetByIdMock.mockReset()
    adapterGetByIdMock.mockResolvedValue(null)
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

  it('collapses future recurring duplicate introduced by late IPC reminder:created event', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const onCreatedCallbacks: Array<(reminder: Reminder) => void> = []
    Object.defineProperty(globalThis, 'window', {
      value: {
        electronAPI: {
          onReminderCreated: (cb: (reminder: Reminder) => void) => {
            onCreatedCallbacks.push(cb)
          },
        },
      },
      writable: true,
      configurable: true,
    })

    const existing = {
      ...makeReminder('series-race', 'Hydrate'),
      scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
      updatedAt: new Date('2026-03-06T09:00:00.000Z'),
    }
    const lateDuplicate = {
      ...makeReminder('series-race-next-1772877600000', 'Hydrate'),
      scheduledAt: new Date('2026-03-08T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
      updatedAt: new Date('2026-03-06T09:05:00.000Z'),
    }

    adapterUpdateMock.mockImplementation(async (id: string, changes: Partial<Reminder>) => {
      if (id === lateDuplicate.id) {
        return {
          ...lateDuplicate,
          ...changes,
          status: ReminderStatus.CANCELLED,
          updatedAt: now,
        }
      }

      return {
        ...existing,
        ...changes,
        updatedAt: now,
      }
    })

    const store = useReminderStore()
    store.addReminder(existing)
    store.initialize()

    onCreatedCallbacks[0]?.(lateDuplicate)
    for (let i = 0; i < 20 && adapterUpdateMock.mock.calls.length === 0; i += 1) {
      await Promise.resolve()
    }
    for (
      let i = 0;
      i < 20 && store.reminders.filter((item) => item.status === ReminderStatus.PENDING).length > 1;
      i += 1
    ) {
      await Promise.resolve()
    }

    expect(adapterUpdateMock).toHaveBeenCalledWith(
      lateDuplicate.id,
      expect.objectContaining({
        status: ReminderStatus.CANCELLED,
        _isSync: true,
      })
    )

    const active = store.reminders.filter((item) => item.status === ReminderStatus.PENDING)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(existing.id)
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
      scheduledAt: new Date('2030-02-24T11:00:00.000Z'),
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

  it.each([
    {
      name: 'hourly',
      scheduledAt: '2026-03-06T09:00:00.000Z',
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=2;BYMINUTE=0;BYSECOND=0',
      now: '2026-03-06T10:30:00.000Z',
      expectedLatest: '2026-03-06T09:00:00.000Z',
      expectedNext: '2026-03-06T11:00:00.000Z',
    },
    {
      name: 'daily',
      scheduledAt: '2026-03-05T10:00:00.000Z',
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      now: '2026-03-06T10:30:00.000Z',
      expectedLatest: '2026-03-06T10:00:00.000Z',
      expectedNext: '2026-03-07T10:00:00.000Z',
    },
    {
      name: 'weekly',
      scheduledAt: '2026-03-03T09:00:00.000Z',
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
      now: '2026-03-06T10:30:00.000Z',
      expectedLatest: '2026-03-03T09:00:00.000Z',
      expectedNext: '2026-03-10T09:00:00.000Z',
    },
    {
      name: 'weekly-by-day',
      scheduledAt: '2026-03-02T09:00:00.000Z',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0;BYSECOND=0',
      now: '2026-03-06T10:30:00.000Z',
      expectedLatest: '2026-03-02T09:00:00.000Z',
      expectedNext: '2026-03-09T09:00:00.000Z',
    },
  ])(
    'creates one missed sent instance and advances recurring $name reminder to next valid date/time',
    async ({ name, scheduledAt, recurrenceRule, now, expectedLatest, expectedNext }) => {
      vi.useFakeTimers()
      const nowDate = new Date(now)
      vi.setSystemTime(nowDate)

      const recurring = {
        ...makeReminder(`r-startup-${name}`, 'Stretch'),
        scheduledAt: new Date(scheduledAt),
        recurrenceRule,
      }

      adapterListMock.mockResolvedValue([recurring])
      adapterCreateMock.mockImplementation(async (input: Record<string, unknown>) => ({
        ...recurring,
        ...input,
        id: String(input.id),
        status: ReminderStatus.SENT,
        scheduledAt: input.scheduledAt as Date,
        createdAt: nowDate,
        updatedAt: nowDate,
      }))
      adapterUpdateMock.mockImplementation(async (_id: string, changes: Partial<Reminder>) => ({
        ...recurring,
        ...changes,
        status: ReminderStatus.PENDING,
        updatedAt: nowDate,
      }))

      const store = useReminderStore()
      await store.reconcileStartupReminders()

      const sentCreated = vi.mocked(adapterCreateMock).mock.calls[0]?.[0] as
        | { id: string; scheduledAt: Date; status: ReminderStatus }
        | undefined
      expect(sentCreated).toBeDefined()
      expect(sentCreated?.status).toBe(ReminderStatus.SENT)
      expect(sentCreated?.scheduledAt.toISOString()).toBe(expectedLatest)

      expect(adapterUpdateMock).toHaveBeenCalledWith(
        recurring.id,
        expect.objectContaining({
          scheduledAt: new Date(expectedNext),
          status: ReminderStatus.PENDING,
          _isSync: true,
        })
      )

      const pending = store.reminders.find((item) => item.id === recurring.id)
      const sent = store.reminders.find((item) => item.id !== recurring.id)
      expect(pending?.status).toBe(ReminderStatus.PENDING)
      expect(pending?.scheduledAt.toISOString()).toBe(expectedNext)
      expect(sent?.status).toBe(ReminderStatus.SENT)
      expect(store.sentMissedCount).toBe(1)
      expect(store.missedReminderIds.has(String(sentCreated?.id))).toBe(true)
    }
  )

  it('moves overdue one-time reminder to sent and increments missed counter', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const oneTime = {
      ...makeReminder('r-startup-onetime', 'Pay bills'),
      scheduledAt: new Date('2026-03-06T10:00:00.000Z'),
      recurrenceRule: undefined,
    }

    adapterListMock.mockResolvedValue([oneTime])
    adapterUpdateMock.mockImplementation(async (_id: string, changes: Partial<Reminder>) => ({
      ...oneTime,
      ...changes,
      status: ReminderStatus.SENT,
      updatedAt: now,
    }))

    const store = useReminderStore()
    await store.reconcileStartupReminders()

    expect(adapterCreateMock).not.toHaveBeenCalled()
    expect(adapterUpdateMock).toHaveBeenCalledWith(
      oneTime.id,
      expect.objectContaining({
        status: ReminderStatus.SENT,
        _isSync: true,
      })
    )
    expect(store.sentMissedCount).toBe(1)
    expect(store.missedReminderIds.has(oneTime.id)).toBe(true)
    expect(store.reminders.find((r) => r.id === oneTime.id)?.status).toBe(ReminderStatus.SENT)
  })

  it('does not duplicate Active recurring reminders when next pending occurrence already exists', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const overdueCurrent = {
      ...makeReminder('series-1', 'Daily standup'),
      scheduledAt: new Date('2026-03-05T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    }
    const existingNext = {
      ...makeReminder('series-1-next-1772791200000', 'Daily standup'),
      scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
    }

    adapterListMock.mockResolvedValue([overdueCurrent, existingNext])
    adapterUpdateMock.mockImplementation(async (id: string, changes: Partial<Reminder>) => {
      if (id === overdueCurrent.id) {
        return {
          ...overdueCurrent,
          ...changes,
          status: ReminderStatus.SENT,
          updatedAt: now,
        }
      }
      return {
        ...existingNext,
        ...changes,
        updatedAt: now,
      }
    })

    const store = useReminderStore()
    await store.reconcileStartupReminders()

    expect(adapterCreateMock).not.toHaveBeenCalled()
    expect(adapterUpdateMock).toHaveBeenCalledWith(
      overdueCurrent.id,
      expect.objectContaining({
        status: ReminderStatus.SENT,
        _isSync: true,
      })
    )

    const active = store.reminders.filter((item) => item.status === ReminderStatus.PENDING)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(existingNext.id)
    expect(store.sentMissedCount).toBe(1)
  })

  it('does not create another Active recurring reminder when an already-advanced future instance exists', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const overdueCurrent = {
      ...makeReminder('series-2', 'Weekly review'),
      scheduledAt: new Date('2026-03-01T09:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    }
    const existingFuture = {
      ...makeReminder('series-2-next-1772877600000', 'Weekly review'),
      scheduledAt: new Date('2026-03-08T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
    }

    adapterListMock.mockResolvedValue([overdueCurrent, existingFuture])
    adapterUpdateMock.mockImplementation(async (id: string, changes: Partial<Reminder>) => {
      if (id === overdueCurrent.id) {
        return {
          ...overdueCurrent,
          ...changes,
          status: ReminderStatus.SENT,
          updatedAt: now,
        }
      }
      return {
        ...existingFuture,
        ...changes,
        updatedAt: now,
      }
    })

    const store = useReminderStore()
    await store.reconcileStartupReminders()

    expect(adapterCreateMock).not.toHaveBeenCalled()
    const pending = store.reminders.filter((item) => item.status === ReminderStatus.PENDING)
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe(existingFuture.id)
    expect(store.reminders.find((item) => item.id === overdueCurrent.id)?.status).toBe(
      ReminderStatus.SENT
    )
  })

  it('does not branch recurrence from pending reminders with historical missed suffix ids', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const overdueMissedId = {
      ...makeReminder('series-4-missed-1772793300000', 'Read'),
      scheduledAt: new Date('2026-03-06T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
    }
    const canonicalNext = {
      ...makeReminder('series-4-next-1772877600000', 'Read'),
      scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
    }

    adapterListMock.mockResolvedValue([overdueMissedId, canonicalNext])
    adapterUpdateMock.mockImplementation(async (id: string, changes: Partial<Reminder>) => {
      if (id === overdueMissedId.id) {
        return {
          ...overdueMissedId,
          ...changes,
          status: ReminderStatus.SENT,
          updatedAt: now,
        }
      }
      return {
        ...canonicalNext,
        ...changes,
        updatedAt: now,
      }
    })

    const store = useReminderStore()
    await store.reconcileStartupReminders()

    expect(adapterCreateMock).not.toHaveBeenCalled()
    expect(adapterUpdateMock).toHaveBeenCalledWith(
      overdueMissedId.id,
      expect.objectContaining({
        status: ReminderStatus.SENT,
        _isSync: true,
      })
    )
    const active = store.reminders.filter((item) => item.status === ReminderStatus.PENDING)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(canonicalNext.id)
  })

  it('collapses historical duplicate future pending recurring reminders on startup', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const primary = {
      ...makeReminder('series-3-next-1772791200000', 'Hydrate'),
      scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
      updatedAt: new Date('2026-03-06T09:00:00.000Z'),
    }
    const duplicateLater = {
      ...makeReminder('series-3-next-1772877600000', 'Hydrate'),
      scheduledAt: new Date('2026-03-08T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
      updatedAt: new Date('2026-03-06T09:05:00.000Z'),
    }

    adapterListMock.mockResolvedValue([primary, duplicateLater])
    adapterUpdateMock.mockImplementation(async (id: string, changes: Partial<Reminder>) => {
      if (id === duplicateLater.id) {
        return {
          ...duplicateLater,
          ...changes,
          status: ReminderStatus.CANCELLED,
          updatedAt: now,
        }
      }
      return {
        ...primary,
        ...changes,
        updatedAt: now,
      }
    })

    const store = useReminderStore()
    await store.reconcileStartupReminders()

    expect(adapterUpdateMock).toHaveBeenCalledWith(
      duplicateLater.id,
      expect.objectContaining({
        status: ReminderStatus.CANCELLED,
        _isSync: true,
      })
    )
    const active = store.reminders.filter((item) => item.status === ReminderStatus.PENDING)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(primary.id)
    expect(store.reminders.find((item) => item.id === duplicateLater.id)?.status).toBe(
      ReminderStatus.CANCELLED
    )
  })

  it('prefers canonical future pending reminder over missed-suffix duplicate at same time', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-03-06T10:30:00.000Z')
    vi.setSystemTime(now)

    const canonical = {
      ...makeReminder('series-5-next-1772791200000', 'Read'),
      scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
      updatedAt: new Date('2026-03-06T09:00:00.000Z'),
    }
    const missedSuffix = {
      ...makeReminder('series-5-missed-1772793300000-next-1772791200000', 'Read'),
      scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      status: ReminderStatus.PENDING,
      updatedAt: new Date('2026-03-06T09:05:00.000Z'),
    }

    adapterListMock.mockResolvedValue([missedSuffix, canonical])
    adapterUpdateMock.mockImplementation(async (id: string, changes: Partial<Reminder>) => {
      if (id === missedSuffix.id) {
        return {
          ...missedSuffix,
          ...changes,
          status: ReminderStatus.CANCELLED,
          updatedAt: now,
        }
      }
      return {
        ...canonical,
        ...changes,
        updatedAt: now,
      }
    })

    const store = useReminderStore()
    await store.reconcileStartupReminders()

    expect(adapterUpdateMock).toHaveBeenCalledWith(
      missedSuffix.id,
      expect.objectContaining({
        status: ReminderStatus.CANCELLED,
        _isSync: true,
      })
    )
    const active = store.reminders.filter((item) => item.status === ReminderStatus.PENDING)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(canonical.id)
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
    adapterCreateMock.mockImplementation(async (input: Record<string, unknown>) => ({
      ...state.reminder,
      ...input,
      id: String(input.id),
      status: ReminderStatus.SENT,
      scheduledAt: input.scheduledAt as Date,
      createdAt: now,
      updatedAt: now,
    }))
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
    expect(adapterCreateMock).toHaveBeenCalledTimes(1)
    expect(store.sentMissedCount).toBe(1)
    expect(store.reminders).toHaveLength(1)
    expect(store.reminders.some((item) => item.id === state.reminder.id)).toBe(true)
  })

  it('updates missed badge count when IPC badge:updated event arrives', () => {
    const onBadgeUpdateCallbacks: Array<(count: number, missedIds: string[]) => void> = []
    const badgeClearedMock = vi.fn()
    Object.defineProperty(globalThis, 'window', {
      value: {
        electronAPI: {
          onBadgeUpdate: (cb: (count: number, missedIds: string[]) => void) => {
            onBadgeUpdateCallbacks.push(cb)
          },
          badgeCleared: badgeClearedMock,
        },
      },
      writable: true,
      configurable: true,
    })

    const store = useReminderStore()
    store.initialize()

    // Simulate badge update with 2 missed reminders
    onBadgeUpdateCallbacks[0]?.(2, ['r-missed-1', 'r-missed-2'])

    expect(store.sentMissedCount).toBe(2)
    expect(store.missedReminderIds.has('r-missed-1')).toBe(true)
    expect(store.missedReminderIds.has('r-missed-2')).toBe(true)
    expect(badgeClearedMock).not.toHaveBeenCalled()

    // If already on Sent tab, it should immediately clear the badge
    store.filterStatus = ReminderStatus.SENT
    onBadgeUpdateCallbacks[0]?.(3, ['r-missed-1', 'r-missed-2', 'r-missed-3'])
    expect(badgeClearedMock).toHaveBeenCalledTimes(1)
  })
})
