import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useReminderStore } from '../src/stores/reminder'

const { adapterListMock, adapterClearOldRemindersMock } = vi.hoisted(() => ({
  adapterListMock: vi.fn(),
  adapterClearOldRemindersMock: vi.fn(),
}))

vi.mock('../src/services/reminderAdapter', () => ({
  reminderAdapter: {
    list: adapterListMock,
    clearOldReminders: adapterClearOldRemindersMock,
  },
}))

describe('reminder store clearOldReminders', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    adapterListMock.mockReset()
    adapterClearOldRemindersMock.mockReset()
    adapterListMock.mockResolvedValue([])
  })

  it('refreshes reminders after clear even when adapter reports 0 deletions', async () => {
    const store = useReminderStore()
    adapterClearOldRemindersMock.mockResolvedValue(0)

    const count = await store.clearOldReminders(true)

    expect(count).toBe(0)
    expect(adapterClearOldRemindersMock).toHaveBeenCalledWith(true)
    expect(adapterListMock).toHaveBeenCalledTimes(1)
  })
})
