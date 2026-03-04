import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncBackendClient } from '../../../src/services/syncBackendClient'
import { createClient } from '@supabase/supabase-js'

// Mock the environment variables so the file doesn't warn
vi.stubEnv('VITE_SUPABASE_URL', 'https://mock.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key')

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

interface MockSupabase {
  auth: {
    getSession: ReturnType<typeof vi.fn>
    signInAnonymously: ReturnType<typeof vi.fn>
  }
  from: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
}

describe('SyncBackendClient', () => {
  let mockSupabase: MockSupabase

  beforeEach(() => {
    vi.restoreAllMocks()

    // Create a mock supabase client shape
    mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        signInAnonymously: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'mock-user-uuid' } }, error: null }),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }

    vi.mocked(createClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof createClient>
    )

    // Use an uninitialized client instance for testing by re-instantiating or treating it as singleton
    // It's a singleton in the app, but for test we can just call init and verify the mock
    syncBackendClient['initialized'] = false
    syncBackendClient.init()
  })

  it('initializes the supabase client', () => {
    expect(createClient).toHaveBeenCalledWith('https://mock.supabase.co', 'mock-anon-key')
    expect(syncBackendClient.isConfigured()).toBe(true)
  })

  it('ensures user is authenticated by returning existing session', async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'existing-uuid' } } },
    })

    const userId = await syncBackendClient.ensureAuthenticated()

    expect(userId).toBe('existing-uuid')
    expect(mockSupabase.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('authenticates anonymously if no existing session', async () => {
    const userId = await syncBackendClient.ensureAuthenticated()

    expect(userId).toBe('mock-user-uuid')
    expect(mockSupabase.auth.signInAnonymously).toHaveBeenCalled()
  })

  it('fetches reminders from cloud_reminders table', async () => {
    const mockData = [
      { reminder_id: 'r1', encrypted_payload: 'xxx', updated_at: '2023-01-01', is_deleted: false },
    ]
    mockSupabase.eq.mockResolvedValueOnce({ data: mockData, error: null })

    const result = await syncBackendClient.fetchReminders('my-user')

    expect(mockSupabase.from).toHaveBeenCalledWith('cloud_reminders')
    expect(mockSupabase.select).toHaveBeenCalledWith(
      'reminder_id, encrypted_payload, updated_at, is_deleted'
    )
    expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'my-user')
    expect(result).toEqual(mockData)
  })

  it('throws error if fetching reminders fails', async () => {
    mockSupabase.eq.mockResolvedValueOnce({ data: null, error: { message: 'Database error' } })

    await expect(syncBackendClient.fetchReminders('my-user')).rejects.toThrow(
      'Failed to fetch sync data: Database error'
    )
  })

  it('pushes a reminder to cloud_reminders table via upsert', async () => {
    await syncBackendClient.pushReminder('my-user', {
      reminderId: 'r1',
      encryptedParams: '{"ciphertextBase64":"xyz","nonceBase64":"abc"}',
      isDeleted: false,
    })

    expect(mockSupabase.from).toHaveBeenCalledWith('cloud_reminders')
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'my-user',
        reminder_id: 'r1',
        encrypted_payload: '{"ciphertextBase64":"xyz","nonceBase64":"abc"}',
        is_deleted: false,
      }),
      { onConflict: 'user_id,reminder_id' }
    )
  })

  it('throws error if pushing a reminder fails', async () => {
    mockSupabase.upsert.mockResolvedValueOnce({ error: { message: 'Network error' } })

    await expect(
      syncBackendClient.pushReminder('my-user', {
        reminderId: 'r1',
        encryptedParams: 'xxx',
        isDeleted: false,
      })
    ).rejects.toThrow('Failed to push sync data: Network error')
  })
})
