/**
 * Settings repository for key/value persistence (E2-06)
 * Stores user preferences in SQLite (parser mode, etc.)
 */

import type { DatabaseConnection } from './connection'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Allowed values for the parserMode setting */
export type ParserMode = 'llm' | 'local'

/** Map of known setting keys to their value types */
export interface AppSettings {
  parserMode: ParserMode
  fastSave: 'true' | 'false'
  quickAddHotkey: string
  hourlyReminderStartTime: string
  hourlyReminderEndTime: string
  /** Silence timeout in milliseconds, stored as a numeric string */
  silenceTimeoutMs: string
  openAtLogin: 'true' | 'false'
  /** Notification display time in seconds, stored as a numeric string */
  notificationDisplayTimeSeconds: string
  /** ISO string representation of the last time the badge was cleared, to filter old missed reminders. */
  lastBadgeClearTime: string
  /** Whether Cloud Sync is toggled on */
  cloudSyncEnabled: 'true' | 'false'
  /** The anonymous user ID assigned by Supabase for sync */
  cloudSyncUserId: string
  /** Client-side encryption key for the sync payloads (Base64) */
  cloudSyncEncryptionKeyBase64: string
  /** 12h or 24h time format */
  timeFormat: '12h' | '24h'
  /** Whether priority notifications attempt to bypass Android Do Not Disturb */
  priorityDndBypass: 'true' | 'false'
}

type SettingKey = keyof AppSettings
type SettingValue<K extends SettingKey> = AppSettings[K]

/** Default values for each setting */
const DEFAULTS: AppSettings = {
  parserMode: 'local',
  fastSave: 'false',
  quickAddHotkey: 'CommandOrControl+Shift+Space',
  hourlyReminderStartTime: '09:00',
  hourlyReminderEndTime: '22:00',
  silenceTimeoutMs: '2000',
  openAtLogin: 'false',
  notificationDisplayTimeSeconds: '60',
  lastBadgeClearTime: '0',
  cloudSyncEnabled: 'false',
  cloudSyncUserId: '',
  cloudSyncEncryptionKeyBase64: '',
  timeFormat: '24h',
  priorityDndBypass: 'false',
}

// ─── SettingsRepository ───────────────────────────────────────────────────────

export class SettingsRepository {
  private readonly db: DatabaseConnection

  constructor(db: DatabaseConnection) {
    this.db = db
  }

  /**
   * Get a setting value by key.
   * Returns the typed default if the key has never been stored.
   * Returns null for unrecognized keys (not in AppSettings).
   */
  async getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K> | null> {
    if (!(key in DEFAULTS)) {
      return null
    }

    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined

    if (!row) {
      // Return typed default
      return DEFAULTS[key] as SettingValue<K>
    }

    return row.value as SettingValue<K>
  }

  /**
   * Store a setting value. Upserts: creates or overwrites.
   * Records current UTC timestamp as updated_at.
   */
  async setSetting<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void> {
    const updatedAt = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, updatedAt)
  }

  /**
   * Resets all settings to their default values by wiping the table.
   */
  async clearAllSettings(): Promise<void> {
    this.db.prepare('DELETE FROM settings').run()
  }
}
