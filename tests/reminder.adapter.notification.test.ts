import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReminderStatus } from '../src/types/reminder'

const scheduleMock = vi.fn()
const cancelMock = vi.fn()
const createMock = vi.fn()
const updateMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('../src/utils/platform', () => ({
  isElectron: vi.fn(() => false),
  isCapacitorNative: vi.fn(() => true),
}))

vi.mock('../src/services/notificationService', () => ({
  notificationService: {
    schedule: scheduleMock,
    cancel: cancelMock,
  },
}))

vi.mock('../src/db/capacitorReminderRepository', () => ({
  CapacitorReminderRepository: class {
    async create(input: unknown) {
      return createMock(input)
    }
    async update(id: string, changes: unknown) {
      return updateMock(id, changes)
    }
    async delete(id: string) {
      return deleteMock(id)
    }
  },
}))

vi.mock('../src/stores/settings', () => ({
  useSettingsStore: vi.fn(() => ({
    cloudSyncEnabled: false,
    cloudSyncUserId: '',
  })),
}))

describe('CapacitorReminderAdapter notification side-effects', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('does not cancel notification when status transitions to sent', async () => {
    updateMock.mockResolvedValue({ id: 'r-1', status: ReminderStatus.SENT })

    const { reminderAdapter } = await import('../src/services/reminderAdapter')
    await reminderAdapter.update('r-1', { status: ReminderStatus.SENT })

    expect(cancelMock).not.toHaveBeenCalled()
    expect(scheduleMock).not.toHaveBeenCalled()
  })

  it('cancels notification when status is cancelled', async () => {
    updateMock.mockResolvedValue({ id: 'r-2', status: ReminderStatus.CANCELLED })

    const { reminderAdapter } = await import('../src/services/reminderAdapter')
    await reminderAdapter.update('r-2', { status: ReminderStatus.CANCELLED })

    expect(cancelMock).toHaveBeenCalledWith('r-2')
    expect(scheduleMock).not.toHaveBeenCalled()
  })

  it('schedules notification when status is pending', async () => {
    updateMock.mockResolvedValue({ id: 'r-3', status: ReminderStatus.PENDING })

    const { reminderAdapter } = await import('../src/services/reminderAdapter')
    await reminderAdapter.update('r-3', { status: ReminderStatus.PENDING })

    expect(scheduleMock).toHaveBeenCalledWith({ id: 'r-3', status: ReminderStatus.PENDING })
    expect(cancelMock).not.toHaveBeenCalled()
  })
})
