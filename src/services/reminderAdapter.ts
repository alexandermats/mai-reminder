import type { Reminder, ReminderInput } from '../types/reminder'
import { ReminderStatus } from '../types/reminder'

import { isElectron as checkIsElectron, isCapacitorNative } from '../utils/platform'

import type { IReminderRepository } from '../types/repository'
import { CapacitorReminderRepository } from '../db/capacitorReminderRepository'
import { notificationService } from './notificationService'
import { syncEngine } from './syncEngine'

// Helper to Safely trigger a sync pass without blocking the caller
function triggerSync() {
  void syncEngine.sync()
}

// Check environment
const isElectron = checkIsElectron()
const isCapacitor = isCapacitorNative()

class IpcReminderAdapter implements IReminderRepository {
  private get api() {
    return window.electronAPI!.reminders
  }

  async list(options?: unknown): Promise<Reminder[]> {
    return this.api.list(options)
  }
  async create(input: ReminderInput): Promise<Reminder> {
    const rem = await this.api.create(input)
    if (!input._isSync) triggerSync()
    return rem
  }
  async update(id: string, changes: Partial<ReminderInput>): Promise<Reminder> {
    const rem = await this.api.update(id, changes)
    if (!changes._isSync) triggerSync()
    return rem
  }
  async delete(id: string, isSync?: boolean): Promise<boolean> {
    const success = await this.api.delete(id, isSync)
    if (success && !isSync) {
      triggerSync()
    }
    return success
  }
  async getById(id: string): Promise<Reminder | null> {
    return this.api.getById(id)
  }
  async listUpcoming(fromDate?: Date | string): Promise<Reminder[]> {
    return this.api.listUpcoming(fromDate)
  }
  async clearOldReminders(includeSent?: boolean): Promise<number> {
    return syncEngine.clearOldRemindersWithSync(includeSent ?? true)
  }

  async listMissedPriorityReminders(now?: Date | string): Promise<Reminder[]> {
    return this.api.listMissedPriorityReminders(now)
  }

  async cleanupPastPendingReminders(now?: Date | string): Promise<number> {
    return this.api.cleanupPastPendingReminders(now)
  }
}

class MockReminderAdapter implements IReminderRepository {
  private reminders: Reminder[] = []

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async list(_options?: unknown): Promise<Reminder[]> {
    return [...this.reminders]
  }

  async getById(id: string): Promise<Reminder | null> {
    return this.reminders.find((r) => r.id === id) || null
  }

  async listUpcoming(fromDate?: Date | string): Promise<Reminder[]> {
    const now = fromDate ? new Date(fromDate) : new Date()
    return this.reminders.filter((r) => r.status === ReminderStatus.PENDING && r.scheduledAt > now)
  }

  async clearOldReminders(includeSent?: boolean): Promise<number> {
    return syncEngine.clearOldRemindersWithSync(includeSent ?? true)
  }

  async listMissedPriorityReminders(now?: Date | string): Promise<Reminder[]> {
    const threshold = now ? new Date(now) : new Date()
    return this.reminders.filter(
      (r) => r.status === ReminderStatus.PENDING && r.scheduledAt <= threshold && r.priority
    )
  }

  async cleanupPastPendingReminders(now?: Date | string): Promise<number> {
    const threshold = now ? new Date(now) : new Date()
    let count = 0
    this.reminders = this.reminders.map((r) => {
      if (r.status === ReminderStatus.PENDING && r.scheduledAt < threshold) {
        count++
        return { ...r, status: ReminderStatus.SENT }
      }
      return r
    })
    return count
  }

  async create(input: ReminderInput): Promise<Reminder> {
    const reminder: Reminder = {
      id: 'mock-' + Math.random().toString(36).substring(7),
      title: input.title,
      scheduledAt: input.scheduledAt,
      originalText: input.originalText || '',
      language: input.language || 'en',
      source: input.source,
      parserMode: input.parserMode,
      status:
        input.status || (input as { status?: ReminderStatus }).status || ReminderStatus.PENDING,
      parseConfidence: input.parseConfidence,
      recurrenceRule: input.recurrenceRule,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.reminders.push(reminder)
    if (!input._isSync) triggerSync()
    return reminder
  }

  async update(id: string, changes: Partial<ReminderInput>): Promise<Reminder> {
    const index = this.reminders.findIndex((r) => r.id === id)
    if (index === -1) throw new Error('Not found')
    this.reminders[index] = {
      ...this.reminders[index],
      ...changes,
      updatedAt: new Date(),
    } as Reminder
    if (!changes._isSync) triggerSync()
    return this.reminders[index]
  }

  async delete(id: string, isSync?: boolean): Promise<boolean> {
    const index = this.reminders.findIndex((r) => r.id === id)
    if (index === -1) return false

    this.reminders.splice(index, 1)

    if (!isSync) {
      triggerSync()
    }

    return true
  }
}

class CapacitorReminderAdapter extends CapacitorReminderRepository {
  async create(input: ReminderInput): Promise<Reminder> {
    const reminder = await super.create(input)
    if (reminder.status === ReminderStatus.PENDING) {
      await notificationService.schedule(reminder)
    }
    if (!input._isSync) triggerSync()
    return reminder
  }

  async update(id: string, changes: Partial<ReminderInput>): Promise<Reminder> {
    const reminder = await super.update(id, changes)
    if (reminder.status === ReminderStatus.PENDING) {
      await notificationService.schedule(reminder)
    } else if (reminder.status === ReminderStatus.CANCELLED) {
      await notificationService.cancel(id)
    }
    if (!changes._isSync) triggerSync()
    return reminder
  }

  async delete(id: string, isSync?: boolean): Promise<boolean> {
    const success = await super.delete(id)
    if (success) {
      await notificationService.cancel(id)
      if (!isSync) {
        triggerSync()
      }
    }
    return success
  }

  async clearOldReminders(includeSent?: boolean): Promise<number> {
    return syncEngine.clearOldRemindersWithSync(includeSent ?? true)
  }
}

export const reminderAdapter: IReminderRepository = (() => {
  if (isElectron) return new IpcReminderAdapter()
  if (isCapacitor) return new CapacitorReminderAdapter()
  return new MockReminderAdapter()
})()
