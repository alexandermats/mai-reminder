import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReminderScheduler } from '../../src/electron/scheduler'
import { ReminderStatus } from '../../src/types/reminder'

// Define a minimal mock of the Reminder type locally for tests if needed,
// or import from correct types path. Let's assume Reminder is available in types.
interface MockReminder {
  id: string
  title: string
  scheduledAt: Date
  status: ReminderStatus
  recurrenceRule?: string
}

describe('ReminderScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('can schedule, list, and cancel reminders', () => {
    const scheduler = new ReminderScheduler()
    const now = new Date()
    const reminder1: MockReminder = {
      id: '1',
      title: 'Test 1',
      scheduledAt: new Date(now.getTime() + 120000),
      status: ReminderStatus.PENDING,
    } // 2 mins later
    const reminder2: MockReminder = {
      id: '2',
      title: 'Test 2',
      scheduledAt: new Date(now.getTime() + 300000),
      status: ReminderStatus.PENDING,
    } // 5 mins later

    scheduler.schedule(reminder1 as unknown as MockReminder)
    scheduler.schedule(reminder2 as unknown as MockReminder)

    expect(scheduler.listScheduled()).toHaveLength(2)

    scheduler.cancel('1')

    const scheduled = scheduler.listScheduled()
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].id).toBe('2')
  })

  it('triggers callback for due reminders and removes them from tracking string comparison', () => {
    const scheduler = new ReminderScheduler()
    const callback = vi.fn()
    scheduler.onReminderDue(callback)
    scheduler.start() // Start interval polling

    const now = new Date()
    // Override system time to be deterministic
    vi.setSystemTime(now)

    const reminder: MockReminder = {
      id: '1',
      title: 'Test',
      scheduledAt: new Date(now.getTime() + 120 * 1000), // 120 seconds into the future
      status: ReminderStatus.PENDING,
    }

    scheduler.schedule(reminder as unknown as MockReminder)
    expect(scheduler.listScheduled()).toHaveLength(1)

    // Advance 1m (60s). It shouldn't trigger.
    vi.advanceTimersByTime(61 * 1000)
    expect(callback).not.toHaveBeenCalled()
    expect(scheduler.listScheduled()).toHaveLength(1)

    // Advance 1m again. It should cross the threshold and trigger.
    vi.advanceTimersByTime(61 * 1000)
    expect(callback).toHaveBeenCalledWith(reminder)

    // Should be removed from tracked items
    expect(scheduler.listScheduled()).toHaveLength(0)

    scheduler.stop()
  })

  it('triggers immediately or on next tick for past due reminders', () => {
    const scheduler = new ReminderScheduler()
    const callback = vi.fn()
    scheduler.onReminderDue(callback)
    scheduler.start()

    const now = new Date()
    vi.setSystemTime(now)

    const reminder: MockReminder = {
      id: 'past',
      title: 'Past Test',
      scheduledAt: new Date(now.getTime() - 60000), // 1 min in the past
      status: ReminderStatus.PENDING,
    }

    scheduler.schedule(reminder as unknown as MockReminder)
    expect(scheduler.listScheduled()).toHaveLength(1)

    // Advance 1 second, it should get picked up immediately (or on first interval check if we poll right away)
    // If the implementation checks immediately upon start AND inside schedule(), it might run instantly.
    // Let's assume standard behavior is checking every 60s, so we must advance 60s. Or if we check on start...
    vi.advanceTimersByTime(60 * 1000)

    expect(callback).toHaveBeenCalledWith(reminder)
    scheduler.stop()
  })

  it('re-queues recurring reminders to their next occurrence', () => {
    const scheduler = new ReminderScheduler()
    const callback = vi.fn()
    scheduler.onReminderDue(callback)

    const now = new Date('2026-03-01T10:00:00.000Z')
    vi.setSystemTime(now)
    scheduler.start()

    const recurring: MockReminder = {
      id: 'recurring-1',
      title: 'Water plants',
      scheduledAt: new Date('2026-03-01T10:00:05.000Z'),
      status: ReminderStatus.PENDING,
      recurrenceRule: 'FREQ=MINUTELY;INTERVAL=1',
    }

    scheduler.schedule(recurring)

    vi.advanceTimersByTime(6000)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({
      id: 'recurring-1',
      nextScheduledAt: new Date('2026-03-01T10:01:05.000Z'),
    })
    expect(scheduler.listScheduled()).toHaveLength(1)
    expect(scheduler.listScheduled()[0].scheduledAt.toISOString()).toBe('2026-03-01T10:01:05.000Z')

    vi.advanceTimersByTime(60000)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback.mock.calls[1][0]).toMatchObject({
      id: 'recurring-1',
      nextScheduledAt: new Date('2026-03-01T10:02:05.000Z'),
    })
    expect(scheduler.listScheduled()).toHaveLength(1)
    expect(scheduler.listScheduled()[0].scheduledAt.toISOString()).toBe('2026-03-01T10:02:05.000Z')

    scheduler.stop()
  })

  it('marks recurring reminder as finished when UNTIL is reached', () => {
    const scheduler = new ReminderScheduler()
    const callback = vi.fn()
    scheduler.onReminderDue(callback)

    const now = new Date('2026-03-01T10:00:00.000Z')
    vi.setSystemTime(now)
    scheduler.start()

    const recurring: MockReminder = {
      id: 'recurring-until',
      title: 'Stand up',
      scheduledAt: new Date('2026-03-01T10:00:05.000Z'),
      status: ReminderStatus.PENDING,
      recurrenceRule: 'FREQ=MINUTELY;INTERVAL=1;UNTIL=20260301T100105Z',
    }

    scheduler.schedule(recurring)

    vi.advanceTimersByTime(6000)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({
      id: 'recurring-until',
      nextScheduledAt: new Date('2026-03-01T10:01:05.000Z'),
    })
    expect(scheduler.listScheduled()).toHaveLength(1)

    vi.advanceTimersByTime(60000)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback.mock.calls[1][0]).not.toHaveProperty('nextScheduledAt')
    expect(scheduler.listScheduled()).toHaveLength(0)

    scheduler.stop()
  })

  it('stops recurring reminders when COUNT is reached', () => {
    const scheduler = new ReminderScheduler()
    const callback = vi.fn()
    scheduler.onReminderDue(callback)

    const now = new Date('2026-03-01T10:00:00.000Z')
    vi.setSystemTime(now)
    scheduler.start()

    const recurring: MockReminder = {
      id: 'recurring-count',
      title: 'Hydrate',
      scheduledAt: new Date('2026-03-01T10:00:05.000Z'),
      status: ReminderStatus.PENDING,
      recurrenceRule: 'FREQ=MINUTELY;INTERVAL=1;COUNT=2',
    }

    scheduler.schedule(recurring)

    vi.advanceTimersByTime(6000)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({
      id: 'recurring-count',
      nextScheduledAt: new Date('2026-03-01T10:01:05.000Z'),
    })
    expect(scheduler.listScheduled()).toHaveLength(1)

    vi.advanceTimersByTime(60000)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback.mock.calls[1][0]).not.toHaveProperty('nextScheduledAt')
    expect(scheduler.listScheduled()).toHaveLength(0)

    scheduler.stop()
  })

  it('keeps daily recurrence timing consistent across DST boundary (UTC)', () => {
    const scheduler = new ReminderScheduler()
    const callback = vi.fn()
    scheduler.onReminderDue(callback)

    const now = new Date('2026-03-08T09:59:58.000Z')
    vi.setSystemTime(now)
    scheduler.start()

    const recurring: MockReminder = {
      id: 'recurring-dst',
      title: 'Daily check',
      scheduledAt: new Date('2026-03-08T10:00:00.000Z'),
      status: ReminderStatus.PENDING,
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    }

    scheduler.schedule(recurring)

    vi.advanceTimersByTime(3000)
    expect(callback).toHaveBeenCalledTimes(1)
    const firstNext = callback.mock.calls[0][0].nextScheduledAt as Date
    expect(firstNext.toISOString()).toBe('2026-03-09T10:00:00.000Z')
    expect(firstNext.getTime() - recurring.scheduledAt.getTime()).toBe(24 * 60 * 60 * 1000)

    scheduler.stop()
  })

  it('re-anchors recurrence after editing an hourly series schedule time', () => {
    const scheduler = new ReminderScheduler()
    const callback = vi.fn()
    scheduler.onReminderDue(callback)

    const now = new Date('2026-03-01T10:29:50.000Z')
    vi.setSystemTime(now)
    scheduler.start()

    scheduler.schedule({
      id: 'recurring-edited-hourly',
      title: 'Drink water',
      scheduledAt: new Date('2026-03-01T10:00:00.000Z'),
      status: ReminderStatus.PENDING,
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=1',
    })

    // User edits entire series to fire at 10:30 instead of 10:00.
    scheduler.schedule({
      id: 'recurring-edited-hourly',
      title: 'Drink water',
      scheduledAt: new Date('2026-03-01T10:30:00.000Z'),
      status: ReminderStatus.PENDING,
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=1',
    })

    vi.advanceTimersByTime(11000)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({
      id: 'recurring-edited-hourly',
      scheduledAt: new Date('2026-03-01T10:30:00.000Z'),
      nextScheduledAt: new Date('2026-03-01T11:30:00.000Z'),
    })

    scheduler.stop()
  })

  it('does not resurrect reminder id when callback cancels and replaces it', () => {
    const scheduler = new ReminderScheduler()
    const callback = vi.fn((reminder: { id: string; scheduledAt: Date }) => {
      if (reminder.id === 'series-old') {
        scheduler.cancel('series-old')
        scheduler.schedule({
          id: 'series-new',
          title: 'Drink water',
          scheduledAt: new Date('2026-03-01T13:00:00.000Z'),
          status: ReminderStatus.PENDING,
          recurrenceRule: 'FREQ=HOURLY;INTERVAL=3',
        })
      }
    })
    scheduler.onReminderDue(callback)

    const now = new Date('2026-03-01T09:59:58.000Z')
    vi.setSystemTime(now)
    scheduler.start()

    scheduler.schedule({
      id: 'series-old',
      title: 'Drink water',
      scheduledAt: new Date('2026-03-01T10:00:00.000Z'),
      status: ReminderStatus.PENDING,
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=3',
    })

    vi.advanceTimersByTime(3000)
    expect(callback).toHaveBeenCalledTimes(1)
    const ids = scheduler.listScheduled().map((r) => r.id)
    expect(ids).toContain('series-new')
    expect(ids).not.toContain('series-old')

    scheduler.stop()
  })
})
