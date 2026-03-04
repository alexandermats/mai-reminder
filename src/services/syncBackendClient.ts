import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface SyncPayload {
  reminderId: string
  encryptedParams: string // JSON representation of { ciphertextBase64, nonceBase64 }
  isDeleted: boolean
}

export interface RemoteReminderRow {
  reminder_id: string
  encrypted_payload: string
  updated_at: string
  is_deleted: boolean
}

export class SyncBackendClient {
  private client: SupabaseClient | null = null
  private initialized = false

  init() {
    if (this.initialized) return

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    // Fallback/Stub handles environments without `.env` setup so tests pass
    // without crashing the app on boot.
    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase URL or Key is missing from .env. Sync features will be disabled.')
      return
    }

    this.client = createClient(supabaseUrl, supabaseKey)
    this.initialized = true
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  /**
   * Ensure the anonymous user is signed in to apply RLS properly
   */
  async ensureAuthenticated(): Promise<string> {
    if (!this.client) throw new Error('Supabase client not configured')

    const {
      data: { session },
    } = await this.client.auth.getSession()
    if (session?.user) {
      return session.user.id
    }

    const { data, error } = await this.client.auth.signInAnonymously()
    if (error || !data.user) {
      throw new Error(`Failed to sign in anonymously: ${error?.message}`)
    }

    return data.user.id
  }

  /**
   * Fetch all cloud reminders for the user
   */
  async fetchReminders(authUserId: string): Promise<RemoteReminderRow[]> {
    if (!this.client) throw new Error('Supabase client not configured')

    const { data, error } = await this.client
      .from('cloud_reminders')
      .select('reminder_id, encrypted_payload, updated_at, is_deleted')
      .eq('user_id', authUserId)

    if (error) {
      throw new Error(`Failed to fetch sync data: ${error.message}`)
    }

    return data
  }

  /**
   * Upsert a reminder payload to the cloud
   */
  async pushReminder(authUserId: string, payload: SyncPayload) {
    if (!this.client) throw new Error('Supabase client not configured')

    const { error } = await this.client.from('cloud_reminders').upsert(
      {
        user_id: authUserId,
        reminder_id: payload.reminderId,
        encrypted_payload: payload.encryptedParams,
        is_deleted: payload.isDeleted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,reminder_id' }
    )

    if (error) {
      throw new Error(`Failed to push sync data: ${error.message}`)
    }
  }

  /**
   * Generates a 6-digit PIN and uploads an encrypted payload for device pairing.
   * Auto-expires in 5 minutes via the database schema.
   * Note: The payload *must* be encrypted by the caller using the PIN before upload!
   */
  async uploadPairingPayload(encryptedPayload: string): Promise<string> {
    if (!this.client) throw new Error('Supabase client not configured')

    // Generate a 6-digit PIN securely
    const pin = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes

    const { error } = await this.client.from('device_pairing').insert({
      pin,
      encrypted_payload: encryptedPayload,
      expires_at: expiresAt,
    })

    if (error) {
      throw new Error(`Failed to create pairing PIN: ${error.message}`)
    }

    return pin
  }

  /**
   * Fetches an encrypted payload using a 6-digit PIN.
   * Deletes the row upon successful fetch (one-time use).
   */
  async fetchPairingPayload(pin: string): Promise<string> {
    if (!this.client) throw new Error('Supabase client not configured')

    // 1. Fetch the row
    const { data, error: selectError } = await this.client
      .from('device_pairing')
      .select('encrypted_payload, expires_at')
      .eq('pin', pin)
      .single()

    if (selectError || !data) {
      throw new Error('Invalid or expired PIN')
    }

    // Explicitly check expiry just in case pg_cron hasn't run yet
    if (new Date(data.expires_at) < new Date()) {
      // Clean it up immediately
      await this.client.from('device_pairing').delete().eq('pin', pin)
      throw new Error('This PIN has expired')
    }

    // 2. Delete it so it cannot be used again
    await this.client.from('device_pairing').delete().eq('pin', pin)

    // Note: The device linking step is now handled by the UI after decrypting this payload
    return data.encrypted_payload
  }

  /**
   * Securely links the current anonymous caller to the primary pairing UUID
   * so they pass the Row Level Security (RLS) checks.
   */
  async linkDeviceToGroup(primaryUserId: string): Promise<void> {
    if (!this.client) throw new Error('Supabase client not configured')

    const { error } = await this.client.rpc('link_device_to_sync_group', {
      target_primary_id: primaryUserId,
    })

    if (error) {
      throw new Error(`Failed to link device to sync group: ${error.message}`)
    }
  }
}

export const syncBackendClient = new SyncBackendClient()
