/**
 * Database connection and migration management
 * Uses better-sqlite3 for synchronous SQLite operations
 */

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrations } from './schema'

// Re-export Database type for consumers
export type DatabaseConnection = Database.Database

/**
 * Thrown when SQLite PRAGMA integrity_check reports corruption.
 * Catching this type allows callers to show a user-facing error
 * instead of crashing.
 */
export class DatabaseIntegrityError extends Error {
  constructor(detail: string) {
    super(`Database integrity check failed: ${detail}`)
    this.name = 'DatabaseIntegrityError'
  }
}

/**
 * Create a new database connection
 * @param path Database file path. Use ':memory:' for in-memory database (testing)
 * @returns Database connection instance
 * @throws DatabaseIntegrityError if the file exists but is not a valid SQLite database
 * @throws Error if path is empty or invalid
 */
export function createDatabase(path?: string): DatabaseConnection {
  const resolvedPath = path?.trim() || getDatabasePath()
  if (!resolvedPath) {
    throw new Error('Database path cannot be empty')
  }

  // Ensure parent directory exists for file-based databases
  if (resolvedPath !== ':memory:' && !resolvedPath.startsWith('file::memory:')) {
    const parentDir = dirname(resolvedPath)
    mkdirSync(parentDir, { recursive: true })
  }

  let db: DatabaseConnection
  try {
    db = new Database(resolvedPath)
  } catch (err) {
    // better-sqlite3 throws when the file exists but is not a valid SQLite database
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('file is not a database') || msg.includes('not a database')) {
      throw new DatabaseIntegrityError(msg)
    }
    throw err
  }

  // Enable foreign keys and WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return db
}

/**
 * Get the default database path for the application
 * In Electron, this should be in the userData directory
 * Falls back to './data.db' for development/testing
 */
function getDatabasePath(): string {
  // Check if running in Electron main process
  if (process.versions.electron) {
    // In production Electron, use userData path
    // This will be set up properly when Electron main process initializes
    const userDataPath = process.env.ELECTRON_USER_DATA_PATH
    if (userDataPath) {
      return `${userDataPath}/reminders.db`
    }
  }

  // Default for development/testing
  return './data.db'
}

/**
 * Get the current database schema version
 * Returns 0 if migrations table doesn't exist (new database)
 * @throws Error for database corruption or I/O errors (not for missing table)
 */
export function getDatabaseVersion(db: DatabaseConnection): number {
  try {
    const result = db.prepare('SELECT MAX(version) as version FROM migrations').get() as {
      version: number | null
    }
    return result.version ?? 0
  } catch (err) {
    // If table doesn't exist, that's expected for a new database
    if (err instanceof Error && err.message.includes('no such table')) {
      return 0
    }
    // Re-throw actual errors (disk errors, corruption, etc.)
    throw err
  }
}

/**
 * Set the database version after applying migrations
 */
export function setDatabaseVersion(db: DatabaseConnection, version: number): void {
  const now = new Date().toISOString()
  const insert = db.prepare('INSERT INTO migrations (version, applied_at) VALUES (?, ?)')
  insert.run(version, now)
}

/**
 * Run all pending migrations
 * This function is idempotent - safe to run multiple times
 * @throws Error with context if a specific migration fails
 */
export function runMigrations(db: DatabaseConnection): void {
  const currentVersion = getDatabaseVersion(db)
  const pendingMigrations = migrations.filter((m) => m.version > currentVersion)

  if (pendingMigrations.length === 0) return

  // Start a transaction for safety
  const runMigration = db.transaction(() => {
    for (const migration of pendingMigrations) {
      try {
        db.exec(migration.up)
        setDatabaseVersion(db, migration.version)
      } catch (err) {
        throw new Error(
          `Migration ${migration.version} (${migration.name}) failed: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return pendingMigrations.length
  })

  runMigration()
}

/**
 * Verify the physical integrity of the database file.
 * Runs SQLite's built-in integrity_check PRAGMA and throws
 * DatabaseIntegrityError if any problems are detected.
 *
 * @throws DatabaseIntegrityError if the database is corrupted
 */
export function verifyDatabaseIntegrity(db: DatabaseConnection): void {
  let rows: Array<{ integrity_check: string }>
  try {
    rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>
  } catch (err) {
    // better-sqlite3 can throw SqliteError when the file header is corrupt
    const msg = err instanceof Error ? err.message : String(err)
    throw new DatabaseIntegrityError(msg)
  }
  const firstRow = rows[0]
  if (!firstRow || firstRow.integrity_check !== 'ok') {
    // Truncate very long integrity reports to keep error messages readable
    const MAX_ROWS = 5
    const detail =
      rows.length > MAX_ROWS
        ? `${rows
            .slice(0, MAX_ROWS)
            .map((r) => r.integrity_check)
            .join('; ')} (and ${rows.length - MAX_ROWS} more issue(s)...)`
        : rows.map((r) => r.integrity_check).join('; ')
    throw new DatabaseIntegrityError(detail)
  }
}

/**
 * Initialize the database with schema and migrations.
 * Logs the resolved DB path at debug level and runs an integrity check.
 * This should be called once when the app starts.
 * @param dbPath Optional database path. Uses default if not provided
 * @returns Database connection with migrations applied
 * @throws DatabaseIntegrityError if the database file is corrupted
 */
export function initializeDatabase(dbPath?: string): DatabaseConnection {
  const db = createDatabase(dbPath)
  // Log the resolved path so operators can locate the DB file
  // getDatabasePath() mirrors the same resolution in createDatabase
  const resolvedPath = dbPath?.trim() || getDatabasePath()
  console.debug(`[DB] Database initialized at: ${resolvedPath}`)
  runMigrations(db)
  verifyDatabaseIntegrity(db)
  return db
}

/**
 * Close the database connection
 * Should be called when the app shuts down
 * Safe to call multiple times (idempotent)
 */
export function closeDatabase(db: DatabaseConnection): void {
  if (db?.open) {
    db.close()
  }
}
