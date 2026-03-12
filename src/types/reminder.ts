/**
 * Reminder domain types
 * Matches Requirements.md section 8 Data Model
 */

/**
 * Source of reminder creation
 */
export enum ReminderSource {
  TEXT = 'text',
  VOICE = 'voice',
}

/**
 * Status of the reminder
 */
export enum ReminderStatus {
  PENDING = 'pending',
  SENT = 'sent',
  CANCELLED = 'cancelled',
  DISMISSED = 'dismissed',
}

/**
 * Last user/system action applied to a reminder.
 */
export enum ReminderAction {
  TRIGGER = 'trigger',
  SNOOZE = 'snooze',
  DISMISS = 'dismiss',
}

/**
 * Parser mode used for natural language processing
 */
export enum ReminderParserMode {
  LLM = 'llm',
  LOCAL = 'local',
}

/**
 * Supported languages for reminders
 */
export enum ReminderLanguage {
  EN = 'en',
  RU = 'ru',
}

/**
 * Complete Reminder entity as stored in database
 * Matches Requirements.md section 8
 */
export interface Reminder {
  /** Unique identifier (UUID) */
  id: string
  /** Display title of the reminder */
  title: string
  /** Original natural language text that created this reminder */
  originalText: string
  /** Language code: 'en' | 'ru' */
  language: ReminderLanguage
  /** Scheduled date and time (UTC) */
  scheduledAt: Date
  /** How the reminder was created: 'text' | 'voice' */
  source: ReminderSource
  /** Which parser was used: 'llm' | 'local' */
  parserMode: ReminderParserMode
  /** Status of the reminder: 'pending' | 'sent' | 'cancelled' */
  status: ReminderStatus
  /** Last action applied to this reminder */
  lastAction?: ReminderAction
  /** When the last action was applied */
  lastActionAt?: Date
  /** Optional confidence score from parser (0.0 - 1.0) */
  parseConfidence?: number
  /** Optional iCalendar RRULE string for recurring reminders */
  recurrenceRule?: string
  /** When the reminder was created */
  createdAt: Date
  /** When the reminder was last updated */
  updatedAt: Date
  /** Whether this is a high-priority reminder */
  priority?: boolean
}

/**
 * Input data required to create a new Reminder
 */
export interface ReminderInput {
  title: string
  originalText: string
  language: ReminderLanguage
  scheduledAt: Date
  source: ReminderSource
  parserMode: ReminderParserMode
  status?: ReminderStatus
  lastAction?: ReminderAction
  lastActionAt?: Date
  parseConfidence?: number
  recurrenceRule?: string
  id?: string
  createdAt?: Date
  updatedAt?: Date
  _isSync?: boolean
  priority?: boolean
}

/**
 * Validation error types
 */
export class ReminderValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReminderValidationError'
  }
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Validate and create a new Reminder
 * @throws ReminderValidationError if input is invalid
 */
export function createReminder(input: ReminderInput): Reminder {
  // Validate title
  if (!input.title || input.title.trim().length === 0) {
    throw new ReminderValidationError('Title is required')
  }

  // Validate language
  if (!Object.values(ReminderLanguage).includes(input.language)) {
    throw new ReminderValidationError('Invalid language')
  }

  // Validate source
  if (!Object.values(ReminderSource).includes(input.source)) {
    throw new ReminderValidationError('Invalid source')
  }

  // Validate parser mode
  if (!Object.values(ReminderParserMode).includes(input.parserMode)) {
    throw new ReminderValidationError('Invalid parser mode')
  }

  // Validate scheduledAt is not in the past (with 1 second tolerance)
  const now = new Date()
  const oneSecondAgo = new Date(now.getTime() - 1000)
  if (input.scheduledAt < oneSecondAgo) {
    throw new ReminderValidationError('Scheduled time must be in the future')
  }

  const nowDate = new Date()

  return {
    id: input.id || generateUUID(),
    title: input.title.trim(),
    originalText: input.originalText,
    language: input.language,
    scheduledAt: input.scheduledAt,
    source: input.source,
    parserMode: input.parserMode,
    status: input.status || ReminderStatus.PENDING,
    lastAction: input.lastAction,
    lastActionAt: input.lastActionAt,
    parseConfidence: input.parseConfidence,
    recurrenceRule: input.recurrenceRule,
    createdAt: input.createdAt || nowDate,
    updatedAt: input.updatedAt || nowDate,
    priority: input.priority || false,
  }
}

/**
 * Type guard to check if a value is a valid ReminderStatus
 */
export function isReminderStatus(value: unknown): value is ReminderStatus {
  return (
    typeof value === 'string' && Object.values(ReminderStatus).includes(value as ReminderStatus)
  )
}

/**
 * Type guard to check if a value is a valid ReminderAction
 */
export function isReminderAction(value: unknown): value is ReminderAction {
  return (
    typeof value === 'string' && Object.values(ReminderAction).includes(value as ReminderAction)
  )
}

/**
 * Type guard to check if a value is a valid ReminderLanguage
 */
export function isReminderLanguage(value: unknown): value is ReminderLanguage {
  return (
    typeof value === 'string' && Object.values(ReminderLanguage).includes(value as ReminderLanguage)
  )
}

/**
 * Type guard to check if a value is a valid ReminderSource
 */
export function isReminderSource(value: unknown): value is ReminderSource {
  return (
    typeof value === 'string' && Object.values(ReminderSource).includes(value as ReminderSource)
  )
}

/**
 * Type guard to check if a value is a valid ReminderParserMode
 */
export function isReminderParserMode(value: unknown): value is ReminderParserMode {
  return (
    typeof value === 'string' &&
    Object.values(ReminderParserMode).includes(value as ReminderParserMode)
  )
}

/**
 * Validate that an object conforms to the Reminder interface
 * This is a runtime type check for data coming from external sources (DB, API)
 */
export function isValidReminder(value: unknown): value is Reminder {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const reminder = value as Record<string, unknown>

  // Check required fields exist
  const requiredFields = [
    'id',
    'title',
    'originalText',
    'language',
    'scheduledAt',
    'source',
    'parserMode',
    'status',
    'createdAt',
    'updatedAt',
  ]

  for (const field of requiredFields) {
    if (!(field in reminder)) {
      return false
    }
  }

  // Validate field types and values
  if (typeof reminder.id !== 'string') return false
  if (typeof reminder.title !== 'string') return false
  if (typeof reminder.originalText !== 'string') return false
  if (!isReminderLanguage(reminder.language)) return false
  if (!(reminder.scheduledAt instanceof Date)) return false
  if (!isReminderSource(reminder.source)) return false
  if (!isReminderParserMode(reminder.parserMode)) return false
  if (!isReminderStatus(reminder.status)) return false
  if (!(reminder.createdAt instanceof Date)) return false
  if (!(reminder.updatedAt instanceof Date)) return false

  if (reminder.lastAction !== undefined && !isReminderAction(reminder.lastAction)) {
    return false
  }

  if (reminder.lastActionAt !== undefined && !(reminder.lastActionAt instanceof Date)) {
    return false
  }

  // Validate optional parseConfidence if present
  if (reminder.parseConfidence !== undefined) {
    if (
      typeof reminder.parseConfidence !== 'number' ||
      reminder.parseConfidence < 0 ||
      reminder.parseConfidence > 1
    ) {
      return false
    }
  }

  if (reminder.recurrenceRule !== undefined && typeof reminder.recurrenceRule !== 'string') {
    return false
  }

  if (reminder.priority !== undefined && typeof reminder.priority !== 'boolean') {
    return false
  }

  return true
}
