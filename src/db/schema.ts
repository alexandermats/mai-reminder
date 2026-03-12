/**
 * Database schema definitions for SQLite
 * Matches the Reminder type from src/types/reminder.ts
 */

export const createRemindersTableSQL = `
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_text TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'ru')),
  scheduled_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('text', 'voice')),
  parser_mode TEXT NOT NULL CHECK (parser_mode IN ('llm', 'local')),
  parse_confidence REAL CHECK (parse_confidence IS NULL OR (parse_confidence >= 0 AND parse_confidence <= 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Index for querying upcoming reminders efficiently
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_at ON reminders(scheduled_at);

-- Index for language-based queries
CREATE INDEX IF NOT EXISTS idx_reminders_language ON reminders(language);
`

/**
 * SQL to create the migrations tracking table
 */
export const createMigrationsTableSQL = `
CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`

/**
 * SQL to create the settings table
 * Key/value store for user preferences (parser mode, language, etc.)
 */
export const createSettingsTableSQL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

/**
 * Migration definitions
 * Each migration is a function that takes a Database instance and executes schema changes
 */
export interface Migration {
  version: number
  name: string
  up: string
}

/**
 * List of all database migrations
 * Add new migrations to the end of this array
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'Initial schema - Create reminders table',
    up: createRemindersTableSQL + createMigrationsTableSQL,
  },
  {
    version: 2,
    name: 'Add settings table',
    up: createSettingsTableSQL,
  },
  {
    version: 3,
    name: 'Add status column to reminders table',
    up: `
      ALTER TABLE reminders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
      CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
    `,
  },
  {
    version: 4,
    name: 'Add recurrence rule column to reminders table',
    up: `
      ALTER TABLE reminders ADD COLUMN recurrence_rule TEXT;
    `,
  },
  {
    version: 5,
    name: 'Add priority column to reminders table',
    up: `
      ALTER TABLE reminders ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 6,
    name: 'Add last action columns to reminders table',
    up: `
      ALTER TABLE reminders ADD COLUMN last_action TEXT;
      ALTER TABLE reminders ADD COLUMN last_action_at TEXT;
    `,
  },
]
