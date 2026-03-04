# Future Refactor: Single Advancing PENDING Record Model

## Status: Proposed (not yet implemented)

## Problem with Current Architecture

When a recurring reminder fires, the current code:

1. Marks the current reminder → **SENT** (with `updatedAt = now`)
2. Creates a **new** reminder `${baseId}-next-${timestamp}` → **PENDING**

This creates two problems for cloud sync:

- **SENT records accumulate** — every occurrence creates a new row. Over time a busy "every 2 hours"
  reminder generates ~7 SENT rows per day, ~50 per week.
- **Both devices fire the same occurrence** — if both are online, each marks the same reminder SENT
  and tries to create the "next" record. The deterministic ID avoids duplicates, but sync traffic is
  doubled and there's a potential UNIQUE constraint race.
- **Timezone-dependent scheduling** — the "next" `scheduledAt` used to be window-filtered locally,
  meaning different devices computed different timestamps → different IDs → duplicates.
  (This is the bug fixed by the minimal fix in Sprint 5.)

## Proposed New Model

### Core Idea

A recurring reminder is a **single, persistent PENDING record**. Its `scheduledAt` is always advanced
forward to the next occurrence. No SENT copies are created for the recurring series.

### How It Works

1. **Creation**: User creates "drink water every 2 hours". One reminder row is saved:

   ```
   { id: "abc", title: "drink water", scheduledAt: <next valid time>,
     recurrenceRule: "FREQ=HOURLY;INTERVAL=2;BYMINUTE=0;BYSECOND=0",
     status: "pending" }
   ```

2. **Trigger**: When `scheduledAt <= now`:
   - Check if current time is inside the device's hourly window
     - **Yes** → show notification
     - **No** → silently skip (no notification)
   - In both cases: compute `rule.after(scheduledAt)` and update the same row:
     ```
     UPDATE reminder SET scheduledAt = <next>, updatedAt = now WHERE id = "abc"
     ```
   - Sync the updated row to cloud (just an `updatedAt` bump + new `scheduledAt`)

3. **Sent history** (local-only for Recurring reminders):
   - If we want to show the user which occurrences fired, create a **local-only**
     `reminder_history` table:
     ```sql
     CREATE TABLE reminder_history (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       reminder_id TEXT NOT NULL,
       fired_at TEXT NOT NULL,    -- when the notification was shown
       was_notified INTEGER DEFAULT 1  -- 0 if skipped due to window
     );
     ```
   - This table is **never synced**. It's purely for the "Sent" tab UI display.

4. **Snooze**: When user snoozes a recurring occurrence:
   - Create a **one-time** local-only reminder for the snoozed time (or an entry in
     `reminder_history` with `snoozed_until`)
   - The series itself still advances to the next regular occurrence

5. **Sync**: Cloud only ever sees **one PENDING row per recurring series**, advancing forward.
   Both devices always compute `rule.after(old_scheduledAt)` identically (pure arithmetic,
   timezone-agnostic). No duplicate IDs, no SENT accumulation.

### Benefits

| Aspect                         | Current                           | Proposed                     |
| ------------------------------ | --------------------------------- | ---------------------------- |
| DB rows per daily 2h reminder  | ~7 SENT + 1 PENDING = 8/day       | 1 PENDING (constant)         |
| Cloud sync per occurrence      | 2 writes (SENT + new PENDING)     | 1 write (update scheduledAt) |
| Duplicate risk on multi-device | Mitigated by deterministic ID     | Zero (same row updated)      |
| Timezone-safe                  | Requires careful window placement | Inherently safe              |
| Sent history                   | Cloud-synced, mixed with active   | Local-only, clean separation |

### Files Affected

- **`reminderOccurrenceService.ts`** — replace `applyTriggeredReminderTransition`: update same row
  instead of creating new one. Insert into `reminder_history` if desired.
- **`reminder.ts` (store)** — `processTriggeredReminder` / `processDismissedReminder`: adapt to
  single-row model. No `addReminder(nextReminder)` — just `updateReminder(id, { scheduledAt: next })`.
- **`scheduler.ts` (Electron)** — `checkDueReminders`: check hourly window before firing callbacks,
  silently advance if outside window.
- **`capacitorNotificationAdapter.ts`** — no change to `schedule()`, but the adapter is called only
  when notification should actually fire (window check happens before).
- **`syncEngine.ts`** — filter `reminder_history` table from sync (it's local-only). Otherwise unchanged.
- **`reminderAdapter.ts`** / `capacitorReminderRepository.ts` — add `reminder_history` table + queries.
- **DB migration** — create `reminder_history` table.
- **`SentPage` / `ReminderList`** — read from `reminder_history` for the Sent tab instead of
  filtering main reminders by SENT status.

### Migration Strategy

When this refactor is implemented:

1. Existing SENT reminders from old recurring series remain unchanged (historical data).
2. New occurrences use the single-advancing model.
3. Old `${baseId}-next-${timestamp}` chain reminders can be cleaned up by a one-time migration
   that collapses them into the base record with the latest `scheduledAt`.

### Risks and Considerations

- **Snooze interaction**: needs careful handling — the series must advance independently while the
  snoozed occurrence is tracked separately.
- **"Edit this occurrence"**: currently creates a new one-time reminder. This still works — the
  one-time detached edit is a separate row.
- **"Cancel this occurrence"**: currently done via `skipCurrentOccurrence` which advances the series.
  In the new model, this is just `UPDATE scheduledAt = next` — simpler.
- **Sent tab UX**: the switch from "filter by status=SENT" to "query reminder_history" requires
  UI updates but the visual result is the same. **Need to think about one-time reminders in the Sent tab**
  **UI time for recurring reminders** UI should show when the recurring "every N hours" reminder will trigger given current timezone and hourly window.
  **Clear Old Reminders** should clear cancelled, sent one-time with db update, and sent local-only history reminders.
