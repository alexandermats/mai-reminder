import type { Reminder } from '../types/reminder'
import { ReminderStatus } from '../types/reminder'
import { getNextScheduledAt } from '../services/schedulerService'

interface ScheduledReminder {
  id: string
  title: string
  scheduledAt: Date
  status: ReminderStatus
  recurrenceRule?: string
}

interface DueReminder extends ScheduledReminder {
  nextScheduledAt?: Date
}

interface InternalScheduledReminder extends ScheduledReminder {
  seriesStartAt: Date
}

export class ReminderScheduler {
  private scheduled: Map<string, InternalScheduledReminder> = new Map()
  private intervalId: NodeJS.Timeout | null = null
  private dueCallbacks: ((reminder: DueReminder) => void)[] = []
  private processing: Set<string> = new Set()

  /**
   * Start the scheduler background loop.
   * Checks for due reminders every minute (60,000ms).
   */
  public start(): void {
    if (this.intervalId) return

    // We check every 1 second for precise notification timing
    this.intervalId = setInterval(() => {
      this.checkDueReminders()
    }, 1000)

    // Do an immediate check on startup
    this.checkDueReminders()
  }

  /**
   * Stop the scheduler background loop.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Register a callback to be fired when a reminder is due.
   */
  public onReminderDue(callback: (reminder: DueReminder) => void): void {
    this.dueCallbacks.push(callback)
  }

  /**
   * Schedule a new reminder to be tracked.
   * If the reminder is already past due, it will fire on the next check tick.
   */
  public schedule(reminder: Reminder | ScheduledReminder): void {
    this.processing.delete(reminder.id)
    this.scheduled.set(reminder.id, {
      id: reminder.id,
      title: reminder.title,
      scheduledAt: reminder.scheduledAt,
      status: reminder.status,
      recurrenceRule: reminder.recurrenceRule?.trim() || undefined,
      // `schedule()` is used for create/update from DB; if user edits series time,
      // recurrence should re-anchor to the updated occurrence.
      seriesStartAt: reminder.scheduledAt,
    })
  }

  /**
   * Cancel an existing scheduled reminder.
   */
  public cancel(id: string): void {
    this.processing.delete(id)
    this.scheduled.delete(id)
  }

  /**
   * List all currently scheduled reminders.
   */
  public listScheduled(): ScheduledReminder[] {
    return Array.from(this.scheduled.values()).map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      scheduledAt: reminder.scheduledAt,
      status: reminder.status,
      recurrenceRule: reminder.recurrenceRule,
    }))
  }

  /**
   * Private loop that compares the current UTC time with scheduled UTC time.
   */
  private checkDueReminders(): void {
    const now = new Date()

    for (const [id, reminder] of Array.from(this.scheduled.entries())) {
      if (this.processing.has(id)) {
        continue
      }
      // Compare the unix timestamps directly to be timezone-agnostic
      if (reminder.scheduledAt.getTime() <= now.getTime()) {
        this.processing.add(id)

        const nextScheduledAt = getNextScheduledAt(reminder)
        const dueReminder: DueReminder = {
          id: reminder.id,
          title: reminder.title,
          scheduledAt: reminder.scheduledAt,
          status: reminder.status,
          ...(reminder.recurrenceRule ? { recurrenceRule: reminder.recurrenceRule } : {}),
          ...(nextScheduledAt ? { nextScheduledAt } : {}),
        }

        // Fire callbacks
        for (const cb of this.dueCallbacks) {
          try {
            cb(dueReminder)
          } catch (e) {
            console.error('[ReminderScheduler] Error running due callback:', e)
          }
        }

        // Callbacks may cancel/replace this reminder (e.g. DB-backed recurring flow).
        // If it was removed during callback processing, do not reinsert it.
        const trackedAfterCallbacks = this.scheduled.get(id)
        if (!trackedAfterCallbacks) {
          this.processing.delete(id)
          continue
        }

        if (nextScheduledAt) {
          this.scheduled.set(id, {
            ...trackedAfterCallbacks,
            scheduledAt: nextScheduledAt,
          })
        } else {
          // Remove non-recurring reminders (or completed recurring series) from tracking.
          this.scheduled.delete(id)
        }
        this.processing.delete(id)
      }
    }
  }
}
