// Barrel file for database exports
import type { DatabaseConnection } from './connection'
import { initializeDatabase } from './connection'

export * from './connection'
export * from './schema'
export * from './electronReminderRepository'
export * from './capacitorReminderRepository'
export * from './settingsRepository'

// Singleton database connection for the app
let dbConnection: DatabaseConnection | null = null

/**
 * Get the singleton database connection.
 * Creates the connection on first call.
 */
export function getDbConnection(): DatabaseConnection {
  if (!dbConnection) {
    dbConnection = initializeDatabase()
  }
  return dbConnection
}

/**
 * Set the database connection (useful for testing).
 */
export function setDbConnection(db: DatabaseConnection | null): void {
  dbConnection = db
}
