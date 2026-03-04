import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CapacitorReminderRepository } from '../src/db/capacitorReminderRepository'
import {
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
  ReminderStatus,
  type ReminderInput,
} from '../src/types/reminder'

// Mock Capacitor SQLite
const mockExecute = vi.fn()
const mockQuery = vi.fn()
const mockRun = vi.fn()
const mockOpen = vi.fn()
const mockClose = vi.fn()

vi.mock('@capacitor-community/sqlite', () => {
  return {
    SQLiteConnection: vi.fn().mockImplementation(() => ({
      createConnection: vi.fn().mockResolvedValue({
        open: mockOpen,
        execute: mockExecute,
        query: mockQuery,
        run: mockRun,
        close: mockClose,
      }),
      checkConnectionsConsistency: vi.fn().mockResolvedValue({ result: true }),
      isConnection: vi.fn().mockResolvedValue({ result: false }),
    })),
    CapacitorSQLite: {},
  }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
  },
}))

describe('CapacitorReminderRepository', () => {
  let repository: CapacitorReminderRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repository = new CapacitorReminderRepository()
  })

  it('should call create when create is called', async () => {
    const input: ReminderInput = {
      title: 'Test Reminder',
      originalText: 'Test text',
      language: ReminderLanguage.EN,
      scheduledAt: new Date(),
      source: ReminderSource.TEXT,
      parserMode: ReminderParserMode.LLM,
      status: ReminderStatus.PENDING,
    }

    mockRun.mockResolvedValueOnce({ changes: { lastId: 1 } })
    mockQuery.mockResolvedValueOnce({
      values: [
        {
          id: 'uuid-1',
          title: 'Test Reminder',
          original_text: 'Test text',
          language: 'en',
          scheduled_at: input.scheduledAt.toISOString(),
          source: 'text',
          parser_mode: 'llm',
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    })

    const result = await repository.create(input)
    expect(result).toBeDefined()
    expect(result.title).toBe(input.title)
    expect(mockRun).toHaveBeenCalled()
  })

  it('should call query when getById is called', async () => {
    mockQuery.mockResolvedValueOnce({
      values: [
        {
          id: 'uuid-1',
          title: 'Test Reminder',
          original_text: 'Test text',
          language: 'en',
          scheduled_at: new Date().toISOString(),
          source: 'text',
          parser_mode: 'llm',
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    })

    const result = await repository.getById('uuid-1')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('uuid-1')
    expect(mockQuery).toHaveBeenCalled()
  })

  it('should call query when list is called', async () => {
    mockQuery.mockResolvedValueOnce({ values: [] })
    const result = await repository.list()
    expect(Array.isArray(result)).toBe(true)
    expect(mockQuery).toHaveBeenCalled()
  })
})
