/**
 * Tracks missed (past-due, un-acknowledged) reminders and updates the OS
 * application badge count accordingly.
 *
 * On macOS, the dock badge is updated via the injected `setBadgeCount` callback
 * (backed by `app.setBadgeCount`). On Windows, the tray icon is updated via the
 * optional `setTrayBadge` callback that redraws the tray icon with a count overlay.
 *
 * Responsibilities:
 * - `refresh(repo)` — queries the DB for missed reminders via `repo.listMissed()`,
 *   updates the internal count, and calls the badge setter.
 * - `clear()` — resets the count to 0 (called when the user visits the sent tab).
 * - `getMissedCount()` — returns the current count (useful for testing).
 */

/** Minimal repository interface required by this service. */
export interface MissedReminderRepository {
  listMissed(
    before?: Date,
    since?: Date,
    timeoutSeconds?: number
  ): Promise<{ id: string; scheduledAt: Date; status: string }[]>
}

export class MissedReminderBadgeService {
  private missedCount = 0
  private missedIds: string[] = []
  private readonly setBadgeCount: (count: number) => void
  private readonly setTrayBadge?: (count: number) => void

  constructor(setBadgeCount: (count: number) => void, setTrayBadge?: (count: number) => void) {
    this.setBadgeCount = setBadgeCount
    this.setTrayBadge = setTrayBadge
  }

  /** Returns the current missed-reminder count. */
  getMissedCount(): number {
    return this.missedCount
  }

  /** Returns the current array of active missed-reminder IDs. */
  getMissedIds(): string[] {
    return this.missedIds
  }

  /**
   * Refresh the badge count by querying the repository.
   * Safe to call from the scheduler tick — catches all errors internally.
   */
  async refresh(
    repo: MissedReminderRepository,
    since?: Date,
    timeoutSeconds: number = 0
  ): Promise<void> {
    try {
      const missed = await repo.listMissed(new Date(), since, timeoutSeconds)
      this.missedCount = missed.length
      this.missedIds = missed.map((m) => m.id)
      this.applyBadge()
    } catch (err) {
      console.error('[MissedReminderBadgeService] Failed to refresh badge count:', err)
    }
  }

  /**
   * Reset badge to 0. Call this when the user opens the sent/history tab.
   */
  clear(): void {
    this.missedCount = 0
    this.missedIds = []
    this.applyBadge()
  }

  private applyBadge(): void {
    try {
      this.setBadgeCount(this.missedCount)
    } catch (err) {
      console.warn('[MissedReminderBadgeService] setBadgeCount failed (may not be supported):', err)
    }
    try {
      this.setTrayBadge?.(this.missedCount)
    } catch (err) {
      console.warn('[MissedReminderBadgeService] setTrayBadge failed:', err)
    }
  }
}
