import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MissedReminderBadgeService } from '../../src/electron/missedReminderBadgeService'

interface MockRepository {
  listMissed(): Promise<{ id: string; scheduledAt: Date; status: string }[]>
}

describe('MissedReminderBadgeService', () => {
  let setBadgeCount: ReturnType<typeof vi.fn>
  let service: MissedReminderBadgeService

  beforeEach(() => {
    setBadgeCount = vi.fn()
    service = new MissedReminderBadgeService(setBadgeCount)
  })

  it('starts with a missed count of 0', () => {
    expect(service.getMissedCount()).toBe(0)
  })

  it('refresh() with no missed reminders keeps badge at 0 and calls setBadgeCount(0)', async () => {
    const repo: MockRepository = {
      listMissed: vi.fn().mockResolvedValue([]),
    }
    await service.refresh(repo)
    expect(service.getMissedCount()).toBe(0)
    expect(setBadgeCount).toHaveBeenCalledWith(0)
  })

  it('refresh() with 3 missed reminders sets badge count to 3', async () => {
    const now = new Date()
    const repo: MockRepository = {
      listMissed: vi.fn().mockResolvedValue([
        { id: '1', scheduledAt: new Date(now.getTime() - 60_000), status: 'sent' },
        { id: '2', scheduledAt: new Date(now.getTime() - 120_000), status: 'sent' },
        { id: '3', scheduledAt: new Date(now.getTime() - 180_000), status: 'sent' },
      ]),
    }
    await service.refresh(repo)
    expect(service.getMissedCount()).toBe(3)
    expect(setBadgeCount).toHaveBeenCalledWith(3)
  })

  it('clear() resets badge to 0 and calls setBadgeCount(0)', async () => {
    const now = new Date()
    const repo: MockRepository = {
      listMissed: vi
        .fn()
        .mockResolvedValue([
          { id: '1', scheduledAt: new Date(now.getTime() - 60_000), status: 'sent' },
        ]),
    }
    await service.refresh(repo)
    expect(service.getMissedCount()).toBe(1)

    service.clear()
    expect(service.getMissedCount()).toBe(0)
    expect(setBadgeCount).toHaveBeenLastCalledWith(0)
  })

  it('refresh() does not throw if setBadgeCount throws', async () => {
    setBadgeCount.mockImplementation(() => {
      throw new Error('OS not supported')
    })
    const repo: MockRepository = {
      listMissed: vi.fn().mockResolvedValue([]),
    }
    await expect(service.refresh(repo)).resolves.not.toThrow()
  })

  it('refresh() does not throw if repo.listMissed rejects', async () => {
    const repo: MockRepository = {
      listMissed: vi.fn().mockRejectedValue(new Error('DB error')),
    }
    await expect(service.refresh(repo)).resolves.not.toThrow()
    expect(service.getMissedCount()).toBe(0)
  })

  it('refresh() updates badge count on subsequent calls', async () => {
    const now = new Date()
    const repo: MockRepository = {
      listMissed: vi
        .fn()
        .mockResolvedValueOnce([
          { id: '1', scheduledAt: new Date(now.getTime() - 60_000), status: 'sent' },
        ])
        .mockResolvedValueOnce([]),
    }
    await service.refresh(repo)
    expect(service.getMissedCount()).toBe(1)

    await service.refresh(repo)
    expect(service.getMissedCount()).toBe(0)
    expect(setBadgeCount).toHaveBeenLastCalledWith(0)
  })

  it('calls setTrayBadge callback with the correct count when provided', async () => {
    const setTrayBadge = vi.fn()
    const svc = new MissedReminderBadgeService(setBadgeCount, setTrayBadge)
    const now = new Date()
    const repo: MockRepository = {
      listMissed: vi.fn().mockResolvedValue([
        { id: '1', scheduledAt: new Date(now.getTime() - 60_000), status: 'sent' },
        { id: '2', scheduledAt: new Date(now.getTime() - 120_000), status: 'sent' },
      ]),
    }
    await svc.refresh(repo)
    expect(setTrayBadge).toHaveBeenCalledWith(2)

    svc.clear()
    expect(setTrayBadge).toHaveBeenLastCalledWith(0)
  })

  it('does not throw if setTrayBadge throws', async () => {
    const setTrayBadge = vi.fn().mockImplementation(() => {
      throw new Error('tray error')
    })
    const svc = new MissedReminderBadgeService(setBadgeCount, setTrayBadge)
    const repo: MockRepository = {
      listMissed: vi.fn().mockResolvedValue([{ id: '1', scheduledAt: new Date(), status: 'sent' }]),
    }
    await expect(svc.refresh(repo)).resolves.not.toThrow()
  })
})
