# Supabase Setup Guide for Cloud Sync

To use Supabase for End-to-End Encrypted Cloud Sync, you need to configure your Supabase project and add the credentials to your local .env file.

## 1. Enable Anonymous Authentication

By default, the Cloud Sync feature uses Supabase's Anonymous Authentication to associate data with a device securely without requiring an email or password.

1. Go to your Supabase Dashboard.
2. Navigate to **Authentication** > **Providers**.
3. Enable **Anonymous** sign-ins.

## 2. Create the Database Table and Policies

We need a single table to store the encrypted reminder payloads. Copy and paste the following SQL into your Supabase **SQL Editor** and click **Run**:

```sql
-- Create the table for storing encrypted reminders
CREATE TABLE cloud_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    reminder_id TEXT NOT NULL,
    encrypted_payload TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(user_id, reminder_id)
);

-- Create the table for holding device linkages
CREATE TABLE sync_device_links (
    primary_sync_id UUID NOT NULL,
    device_uid UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (primary_sync_id, device_uid)
);

-- Enable Row Level Security (RLS) on both tables
ALTER TABLE cloud_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_device_links ENABLE ROW LEVEL SECURITY;

-- Create policies so devices can only access reminders for groups they are linked to
CREATE POLICY "Linked devices can insert"
ON cloud_reminders FOR INSERT
TO authenticated, anon
WITH CHECK (EXISTS (SELECT 1 FROM sync_device_links WHERE primary_sync_id = cloud_reminders.user_id AND device_uid = auth.uid()));

CREATE POLICY "Linked devices can select"
ON cloud_reminders FOR SELECT
TO authenticated, anon
USING (EXISTS (SELECT 1 FROM sync_device_links WHERE primary_sync_id = cloud_reminders.user_id AND device_uid = auth.uid()));

CREATE POLICY "Linked devices can update"
ON cloud_reminders FOR UPDATE
TO authenticated, anon
USING (EXISTS (SELECT 1 FROM sync_device_links WHERE primary_sync_id = cloud_reminders.user_id AND device_uid = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM sync_device_links WHERE primary_sync_id = cloud_reminders.user_id AND device_uid = auth.uid()));

-- Create policies allowing devices to read their own linkages
CREATE POLICY "Devices can read links"
ON sync_device_links FOR SELECT
TO authenticated, anon
USING (device_uid = auth.uid());

-- Create a SECURITY DEFINER function to allow devices to securely link themselves to a group
CREATE OR REPLACE FUNCTION link_device_to_sync_group(target_primary_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO sync_device_links (primary_sync_id, device_uid)
    VALUES (target_primary_id, auth.uid())
    ON CONFLICT DO NOTHING;
END;
$$;

-- Create the table for holding temporary pairing blobs
CREATE TABLE device_pairing (
    pin TEXT PRIMARY KEY,
    encrypted_payload TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Note: We intentionally do not enable RLS on this table because read/write
-- access must be public (with knowledge of the PIN) for cross-device pairing.
-- Security is enforced by the encryption of the payload and the 5-minute expiry.

-- Add a pg_cron job to auto-delete expired PINs every minute (optional)
-- SELECT cron.schedule('delete_expired_pins', '* * * * *', $$
--    DELETE FROM device_pairing WHERE expires_at < NOW();
-- $$);

-- Add a pg_cron job to clear tombstoned reminders older than 2 days
SELECT cron.schedule('delete_tombstoned_reminders', '0 0 * * *', $$
    DELETE FROM cloud_reminders WHERE is_deleted = true AND updated_at < NOW() - INTERVAL '2 days';
$$);
```

## 3. Configure Local Environment Variables

In the root directory of the `mai-reminder` project, create or open the .env file and add your Supabase URL and Anon Key. You can find these in your Supabase Dashboard under **Project Settings** > **API**.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Once you have completed these steps, let me know, and I will proceed with installing the necessary client libraries (`@supabase/supabase-js`, `libsodium-wrappers`) and writing the sync code!
