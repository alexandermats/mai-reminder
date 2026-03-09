import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ReminderStatus,
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
} from '../../src/types/reminder'
import type { Reminder } from '../../src/types/reminder'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/services/syncBackendClient', () => ({
  syncBackendClient: {
    init: vi.fn(),
    isConfigured: vi.fn(() => true),
    ensureAuthenticated: vi.fn(() => Promise.resolve('auth-user-id')),
    fetchReminders: vi.fn(() => Promise.resolve([])),
    pushReminder: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('../../src/services/encryptionService', () => ({
  encryptionService: {
    init: vi.fn(),
    encrypt: vi.fn((payload: string) => ({
      ciphertextBase64: Buffer.from(payload).toString('base64'),
      nonceBase64: 'nonce',
    })),
    decrypt: vi.fn(async (data: { ciphertextBase64: string }) =>
      Buffer.from(data.ciphertextBase64, 'base64').toString('utf-8')
    ),
  },
}))

vi.mock('../../src/services/reminderAdapter', () => ({
  reminderAdapter: {
    list: vi.fn(() => Promise.resolve([])),
    create: vi.fn(async (input: Reminder) => input),
    update: vi.fn(async (id: string, changes: Partial<Reminder>) => ({ ...changes, id })),
    delete: vi.fn(() => Promise.resolve(true)),
  },
}))

vi.mock('../../src/stores/settings', () => ({
  useSettingsStore: vi.fn(() => ({
    cloudSyncEnabled: true,
    cloudSyncUserId: 'user-123',
    cloudSyncEncryptionKeyBase64: 'key-abc',
  })),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  const now = new Date('2024-01-01T12:00:00Z')
  return {
    id: 'rem-1',
    title: 'Test reminder',
    originalText: 'Test',
    language: ReminderLanguage.EN,
    scheduledAt: new Date('2024-01-02T09:00:00Z'),
    source: ReminderSource.TEXT,
    parserMode: ReminderParserMode.LOCAL,
    status: ReminderStatus.PENDING,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeRemoteRow(reminder: Reminder, isDeleted = false) {
  const payload = JSON.stringify({
    ...reminder,
    scheduledAt: reminder.scheduledAt.toISOString(),
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  })
  return {
    reminder_id: reminder.id,
    // JSON-encode the envelope so syncEngine's JSON.parse(row.encrypted_payload) works
    encrypted_payload: JSON.stringify({
      ciphertextBase64: Buffer.from(payload).toString('base64'),
      nonceBase64: 'nonce',
    }),
    updated_at: reminder.updatedAt.toISOString(),
    is_deleted: isDeleted,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncEngine', () => {
  let syncEngine: import('../../src/services/syncEngine').SyncEngine
  let syncBackendClient: typeof import('../../src/services/syncBackendClient').syncBackendClient
  let reminderAdapter: typeof import('../../src/services/reminderAdapter').reminderAdapter

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../../src/services/syncEngine')
    syncEngine = new mod.SyncEngine()
    const clientMod = await import('../../src/services/syncBackendClient')
    syncBackendClient = clientMod.syncBackendClient
    const adapterMod = await import('../../src/services/reminderAdapter')
    reminderAdapter = adapterMod.reminderAdapter
  })

  afterEach(() => {
    syncEngine.stop()
  })

  describe('sync() – conflict resolution', () => {
    it('pulls remote reminder that does not exist locally', async () => {
      const remoteReminder = makeReminder({ id: 'rem-remote' })
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRemoteRow(remoteReminder),
      ])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

      await syncEngine.sync()

      expect(reminderAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rem-remote', _isSync: true })
      )
    })

    it('updates local reminder when remote is strictly newer', async () => {
      const localReminder = makeReminder({
        id: 'rem-1',
        updatedAt: new Date('2024-01-01T10:00:00Z'),
      })
      const remoteReminder = makeReminder({
        id: 'rem-1',
        title: 'Updated remotely',
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      })
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRemoteRow(remoteReminder),
      ])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([localReminder])

      await syncEngine.sync()

      expect(reminderAdapter.update).toHaveBeenCalledWith(
        'rem-1',
        expect.objectContaining({ title: 'Updated remotely', _isSync: true })
      )
    })

    it('does NOT update local reminder when local is strictly newer', async () => {
      const localReminder = makeReminder({
        id: 'rem-1',
        title: 'Newer locally',
        updatedAt: new Date('2024-01-01T14:00:00Z'),
      })
      const remoteReminder = makeReminder({
        id: 'rem-1',
        title: 'Stale remote',
        updatedAt: new Date('2024-01-01T10:00:00Z'),
      })
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRemoteRow(remoteReminder),
      ])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([localReminder])

      await syncEngine.sync()

      expect(reminderAdapter.update).not.toHaveBeenCalled()
    })

    it('pushes local reminder to cloud if local is newer than remote', async () => {
      const localReminder = makeReminder({
        id: 'rem-1',
        title: 'Local change',
        updatedAt: new Date('2024-01-01T14:00:00Z'),
      })
      const remoteReminder = makeReminder({
        id: 'rem-1',
        updatedAt: new Date('2024-01-01T10:00:00Z'),
      })
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRemoteRow(remoteReminder),
      ])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([localReminder])

      await syncEngine.sync()

      expect(syncBackendClient.pushReminder).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ reminderId: 'rem-1' })
      )
    })

    it('pushes new local reminder that does not exist in the cloud', async () => {
      const localReminder = makeReminder({ id: 'rem-local-only' })
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([localReminder])

      await syncEngine.sync()

      expect(syncBackendClient.pushReminder).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ reminderId: 'rem-local-only' })
      )
    })

    it('deletes local reminder when remote marks it as deleted', async () => {
      const localReminder = makeReminder({ id: 'rem-deleted' })
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRemoteRow(localReminder, /* isDeleted= */ true),
      ])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([localReminder])

      await syncEngine.sync()

      expect(reminderAdapter.delete).toHaveBeenCalledWith('rem-deleted', true)
    })

    it('does not call delete when remote-deleted ID is not present locally', async () => {
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRemoteRow(makeReminder({ id: 'rem-not-local' }), true),
      ])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

      await syncEngine.sync()

      expect(reminderAdapter.delete).not.toHaveBeenCalled()
    })

    it('is a no-op when cloudSyncEnabled is false', async () => {
      const { useSettingsStore } = await import('../../src/stores/settings')
      ;(useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        cloudSyncEnabled: false,
        cloudSyncUserId: 'user-123',
        cloudSyncEncryptionKeyBase64: 'key-abc',
      })

      // Re-create engine to pick up new store mock
      const mod = await import('../../src/services/syncEngine')
      const engine = new mod.SyncEngine()

      await engine.sync()

      expect(syncBackendClient.fetchReminders).not.toHaveBeenCalled()

      // Restore mock for subsequent tests
      ;(useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        cloudSyncEnabled: true,
        cloudSyncUserId: 'user-123',
        cloudSyncEncryptionKeyBase64: 'key-abc',
      })
    })

    it('does not run a new sync if one is already in progress', async () => {
      // Manually set isSyncing to simulate an in-progress sync
      // TypeScript: access private field via type assertion
      const engine = syncEngine as unknown as { isSyncing: boolean; sync(): Promise<void> }
      engine.isSyncing = true

      // sync() should return immediately without calling fetchReminders
      await engine.sync()

      expect(syncBackendClient.fetchReminders).not.toHaveBeenCalled()

      // Restore state
      engine.isSyncing = false
    })

    describe('onDataChanged events', () => {
      it('emits onDataChanged exactly once per sync pass if a local reminder was created', async () => {
        const remoteReminder = makeReminder({ id: 'rem-remote' })
        ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([
          makeRemoteRow(remoteReminder),
        ])
        ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

        const listener = vi.fn()
        const unsubscribe = syncEngine.onDataChanged(listener)

        await syncEngine.sync()

        expect(listener).toHaveBeenCalledTimes(1)
        unsubscribe()
      })

      it('emits onDataChanged exactly once per sync pass if a local reminder was updated', async () => {
        const localReminder = makeReminder({
          id: 'rem-1',
          updatedAt: new Date('2024-01-01T10:00:00Z'),
        })
        const remoteReminder = makeReminder({
          id: 'rem-1',
          title: 'Updated remotely',
          updatedAt: new Date('2024-01-01T12:00:00Z'),
        })
        ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([
          makeRemoteRow(remoteReminder),
        ])
        ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([localReminder])

        const listener = vi.fn()
        syncEngine.onDataChanged(listener)

        await syncEngine.sync()

        expect(listener).toHaveBeenCalledTimes(1)
      })

      it('emits onDataChanged exactly once per sync pass if a local reminder was deleted', async () => {
        const localReminder = makeReminder({ id: 'rem-deleted' })
        ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([
          makeRemoteRow(localReminder, /* isDeleted= */ true),
        ])
        ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([localReminder])

        const listener = vi.fn()
        syncEngine.onDataChanged(listener)

        await syncEngine.sync()

        expect(listener).toHaveBeenCalledTimes(1)
      })

      it('does NOT emit onDataChanged if no local modifications occurred', async () => {
        const localReminder = makeReminder({ id: 'rem-local' })
        ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([])
        // The local reminder will be pushed to the cloud, but the local db isn't modified
        ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([localReminder])

        const listener = vi.fn()
        syncEngine.onDataChanged(listener)

        await syncEngine.sync()

        expect(listener).not.toHaveBeenCalled()
      })
    })
  })

  describe('start() / stop()', () => {
    it('start() triggers sync after 60 seconds', async () => {
      vi.useFakeTimers()
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

      const syncSpy = vi.spyOn(syncEngine, 'sync')

      syncEngine.start()

      // Fast-forward 60 seconds
      await vi.advanceTimersByTimeAsync(60_000)

      expect(syncSpy).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })

    it('stop() clears interval so sync no longer fires', async () => {
      vi.useFakeTimers()
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

      const syncSpy = vi.spyOn(syncEngine, 'sync')

      syncEngine.start()
      syncEngine.stop()

      await vi.advanceTimersByTimeAsync(120_000)

      expect(syncSpy).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('calling start() twice does not create duplicate intervals', async () => {
      vi.useFakeTimers()
      ;(syncBackendClient.fetchReminders as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

      const syncSpy = vi.spyOn(syncEngine, 'sync')

      syncEngine.start()
      syncEngine.start() // second call should be a no-op

      await vi.advanceTimersByTimeAsync(60_000)
      expect(syncSpy).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })

  describe('clearOldRemindersWithSync()', () => {
    it('pushes is_deleted tombstones to cloud then deletes locally when cloud sync is enabled', async () => {
      const sentReminder = makeReminder({ id: 'rem-sent', status: ReminderStatus.SENT })
      const cancelledReminder = makeReminder({
        id: 'rem-cancelled',
        status: ReminderStatus.CANCELLED,
      })
      ;(syncBackendClient.ensureAuthenticated as ReturnType<typeof vi.fn>).mockResolvedValue(
        'auth-user-id'
      )
      ;(syncBackendClient.pushReminder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([
        sentReminder,
        cancelledReminder,
      ])
      const { useSettingsStore } = await import('../../src/stores/settings')
      ;(useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        cloudSyncEnabled: true,
        cloudSyncUserId: 'user-123',
        cloudSyncEncryptionKeyBase64: 'key-abc',
      })

      const count = await syncEngine.clearOldRemindersWithSync(true)

      // Both reminders matched: tombstones pushed
      expect(syncBackendClient.pushReminder).toHaveBeenCalledTimes(2)
      expect(syncBackendClient.pushReminder).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ reminderId: 'rem-sent', isDeleted: true })
      )
      expect(syncBackendClient.pushReminder).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ reminderId: 'rem-cancelled', isDeleted: true })
      )

      // Both deleted locally with isSync=true
      expect(reminderAdapter.delete).toHaveBeenCalledWith('rem-sent', true)
      expect(reminderAdapter.delete).toHaveBeenCalledWith('rem-cancelled', true)
      expect(count).toBe(2)
    })

    it('skips cloud push and only deletes locally when cloud sync is disabled', async () => {
      const { useSettingsStore } = await import('../../src/stores/settings')
      ;(useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        cloudSyncEnabled: false,
        cloudSyncUserId: '',
        cloudSyncEncryptionKeyBase64: '',
      })

      const sentReminder = makeReminder({ id: 'rem-no-cloud', status: ReminderStatus.SENT })
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([sentReminder])

      const engine = new (await import('../../src/services/syncEngine')).SyncEngine()
      const count = await engine.clearOldRemindersWithSync(true)

      expect(syncBackendClient.pushReminder).not.toHaveBeenCalled()
      expect(reminderAdapter.delete).toHaveBeenCalledWith('rem-no-cloud', true)
      expect(count).toBe(1)
    })

    it('returns 0 and does nothing when no matching reminders exist', async () => {
      const pendingReminder = makeReminder({ id: 'rem-pending', status: ReminderStatus.PENDING })
      ;(reminderAdapter.list as ReturnType<typeof vi.fn>).mockResolvedValue([pendingReminder])

      const count = await syncEngine.clearOldRemindersWithSync(true)

      expect(syncBackendClient.pushReminder).not.toHaveBeenCalled()
      expect(reminderAdapter.delete).not.toHaveBeenCalled()
      expect(count).toBe(0)
    })
  })
})
