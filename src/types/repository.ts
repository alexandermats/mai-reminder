import type { Reminder, ReminderInput } from './reminder'

/**
 * Options for listing reminders
 */
export interface ListOptions {
  limit?: number
  offset?: number
}

/**
 * Interface for Reminder database operations
 */
export interface IReminderRepository {
  /**
   * Create a new reminder in the database
   */
  create(input: ReminderInput): Promise<Reminder>

  /**
   * Get a reminder by its ID
   */
  getById(id: string): Promise<Reminder | null>

  /**
   * List all reminders
   */
  list(options?: ListOptions): Promise<Reminder[]>

  /**
   * List upcoming reminders
   */
  listUpcoming(fromDate?: Date | string): Promise<Reminder[]>

  /**
   * Update a reminder with partial changes
   */
  update(id: string, changes: Partial<ReminderInput>): Promise<Reminder>

  /**
   * Delete a reminder by its ID
   */
  delete(id: string, isSync?: boolean): Promise<boolean>

  /**
   * Clear old reminders from the database
   */
  clearOldReminders(includeSent?: boolean): Promise<number>

  /**
   * Transition any past pending reminders to 'sent' status
   */
  cleanupPastPendingReminders(now?: Date | string): Promise<number>
}
