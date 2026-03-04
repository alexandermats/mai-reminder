# Sprint 5 – UX Polish, Smart Parsing, and Cloud Sync

**Target:** M7 (end Week 7) – E12, E13, E14, E15, and E16 complete.
**Focus:** Improve voice recognition reliability and NLP accuracy, redesign the reminder list for instant readability, fix known UI refresh bugs, enrich notification interactions, add auto-start for the desktop app, and introduce encrypted cloud sync with QR-code device pairing.

---

## Tickets (execute in order)

| #   | ID     | Ticket                                             | Status | Complexity |
| --- | ------ | -------------------------------------------------- | ------ | ---------- |
| 1   | E12-01 | Increase Voice Silence Timeout                     | [x]    | Small      |
| 2   | E12-02 | Improve NLP Parser — Natural Language Examples     | [x]    | Medium     |
| 3   | E12-03 | Fix NLP Time Parsing (14:55 / spelled-out minutes) | [x]    | Medium     |
| 4   | E13-01 | Redesign Reminder List — Column Layout             | [x]    | Medium     |
| 5   | E13-02 | Fix UI Refresh for Upcoming Reminder Times         | [x]    | Small      |
| 6   | E13-03 | Recurrence Interval in Save / Edit Dialog          | [x]    | Medium     |
| 7   | E14-01 | Desktop Auto-Start on Login                        | [x]    | Small      |
| 8   | E15-01 | Notification Action Buttons (Snooze / Dismiss)     | [x]    | Medium     |
| 9   | E15-02 | Missed Reminders Tray Badge and Navigation         | [x]    | Medium     |
| 10  | E16-01 | Cloud Sync Backend and Encrypted DB Provisioning   | [x]    | Large      |
| 11  | E16-02 | QR-Code Device Pairing                             | [x]    | Medium     |
| 12  | E16-03 | Periodic Sync and Conflict Resolution              | [x]    | Large      |

---

## Epic E12 - Voice Recognition & NLP Accuracy

### E12-01 Increase Voice Silence Timeout

**Context:** Users report that the recogniser cuts off before they finish speaking, particularly when dictating reminders with natural pauses. Extending the end-of-speech silence window will give users more time and reduce premature cut-offs.

**TDD Plan:**

- Red: A recording session with a ~1 s pause in the middle is prematurely finalised before the user finishes speaking.
- Green: Expose a configurable `silenceTimeoutMs` constant (default raised from current value to ~2 000 ms) in the voice adapter and propagate it through the Vosk PCM stream decoder.
- Refactor: Add a settings option to let advanced users tweak the timeout; centralise the constant so Electron and Android share the same default.

**Acceptance Criteria:**

- A 1.5 s mid-sentence pause no longer triggers premature finalisation.
- The new default silence timeout is documented in settings-related code comments.
- Existing voice E2E tests are updated to validate the new timing behaviour.

**Definition of Done:**

- Unit tests mock the silence detection logic and verify the new threshold.
- Manual verification on both Electron (desktop) and Android shows no premature cut-off within the new window.

**Dependencies:** E11-03
**Complexity:** Small

---

### E12-02 Improve NLP Parser — Natural Language Examples

**Context:** The local NLP parser struggles with phrases that native speakers use naturally (e.g., "пойти к врачу завтра в пять", "workout every day at ten"). Adding high-quality labelled examples to the test suite and expanding the parser's training/pattern coverage will improve real-world accuracy.

**TDD Plan:**

- Red: NLP unit tests containing the new natural-language examples fail or produce incorrect parsed fields.
- Green: Add at least 10 new labelled examples per locale (EN/RU) to `nlpParser.test.ts`, then extend pattern matchers / LLM prompt examples to cover them.
- Refactor: Deduplicate overlapping patterns and ensure new patterns do not regress existing tests.

**Acceptance Criteria:**

- All new example sentences parse to the correct `title`, `scheduledAt`, and `recurrenceRule` fields.
- Test coverage for the NLP module increases measurably.
- No existing passing test is broken by the new patterns.

**Definition of Done:**

- CI NLP test suite passes with all new examples included.
- PR description lists each new covered utterance and its expected output.

**Dependencies:** E10-02
**Complexity:** Medium

---

### E12-03 Fix NLP Time Parsing (14:55 / Spelled-Out Minutes)

**Context:** Two concrete bugs are reported by users:

1. "напомни мне в 14 55 что у меня кофе" is not parsed correctly — `14 55` (with a space) is not recognised as 14:55.
2. Numbers like "пятьдесят пять" are sometimes misinterpreted as "50 minutes" or "remind me in 5 days" rather than ":55".

**TDD Plan:**

- Red: Add failing unit tests for `"в 14 55"` → `14:55` and `"пятьдесят пять"` → minute component `55`.
- Green: Fix the RU time tokeniser to collapse adjacent hour/minute numerals and correctly convert spelled-out minute words to numeric minutes.
- Refactor: Ensure the fix is locale-scoped and does not affect EN parsing.

**Acceptance Criteria:**

- `"в 14 55"` parses to `HH:MM = 14:55` without ambiguity. also for spelled out numbers like "в четырнадцать пятьдесят пять"
- `"пятьдесят пять"` is consistently resolved to the minute component `55`, not to an interval of 50 minutes or 5 days.
- All existing RU and EN time-parsing tests continue to pass.

**Definition of Done:**

- Unit tests for both bug scenarios are green.
- Manual voice test on Android and Electron confirms correct parsing of these phrases.

**Dependencies:** E12-02
**Complexity:** Medium

---

## Epic E13 - Reminder List UX Redesign

### E13-01 Redesign Reminder List — Column Layout

**Context:** The current reminder list makes it hard to scan at a glance. Users want to see the most important information — time, date, interval, and title — immediately without reading dense text. A structured column layout will dramatically improve readability.

**TDD Plan:**

- Red: `ReminderList` snapshot/E2E tests do not yet assert a multi-column layout; existing layout is dense single-column text.
- Green: Restructure `ReminderList.vue` into four distinct columns: **Time** (large, prominent) + Date & Day below it; **Interval / Recurrence**; **Reminder Text**; **Time Remaining**.
- Refactor: Extract each column into a sub-component. Ensure responsive behaviour for smaller windows and mobile viewports.

**Acceptance Criteria:**

- Column 1: time displayed in a large font; date and day-of-week shown below in a smaller style.
- Column 2: recurrence interval (e.g., "Every day", "Once") shown clearly.
- Column 3: full reminder text, truncated with ellipsis if too long.
- Column 4: countdown to next trigger (e.g., "in 2 h 15 min").
- Layout is correct on both desktop (Electron) and mobile (Android).

**Definition of Done:**

- Playwright E2E tests assert the presence and content of all four columns for a sample reminder.
- I18n strings for column headers are provided in EN and RU.
- Screenshots reviewed and approved by the user.

**Dependencies:** E10-04
**Complexity:** Medium

---

### E13-02 Fix UI Refresh for Upcoming Reminder Times

**Context:** The "time remaining" countdowns in the reminder list do not update while the page is visible; they only refresh when the user switches tabs or restarts the app.

**TDD Plan:**

- Red: A unit/component test asserts that the displayed countdown changes after advancing a fake timer by 60 s — currently the test fails.
- Green: Introduce a reactive polling mechanism (e.g., `setInterval` tied to the component lifecycle or a Vue `watchEffect`) that updates computed relative times on a fixed cadence (every 30 s).
- Refactor: Ensure the interval is cleared on component unmount to prevent memory leaks.

**Acceptance Criteria:**

- Countdown values visibly update every 30 s without user interaction.
- No stale time values are shown while the app is open on the reminders tab.
- The polling interval is cleanly destroyed when navigating away from the list.

**Definition of Done:**

- Component test with `vi.useFakeTimers()` verifies the countdown changes after the polling interval elapses.
- Manual verification confirms live updates on both Electron and Android.

**Dependencies:** E13-01
**Complexity:** Small

---

### E13-03 Recurrence Interval in Save / Edit Dialog

**Context:** Users currently cannot set or change the recurrence interval for a reminder through the UI — they must rely entirely on voice/text parsing. A dedicated control in the save/edit dialog will make recurrence management explicit and accessible.

**TDD Plan:**

- Red: The save/edit modal has no recurrence field; saving a reminder without voice input always creates a one-time reminder.
- Green: Add a recurrence picker (dropdown or segmented control: None / Hourly / Daily / Weekly / Custom) to the confirmation/edit modal. Bind it to `recurrenceRule` in the store.
- Refactor: For "Custom", allow the user to enter a free-form RRULE string or choose day/time via a secondary picker.

**Acceptance Criteria:**

- Recurrence picker is visible in both the new-reminder confirmation modal and the edit dialog.
- Selecting "Daily" saves `FREQ=DAILY` in `recurrenceRule`; selecting "None" clears the field.
- Parsed recurrence from voice/NLP pre-fills the picker correctly.
- Changes are persisted to the DB and reflected immediately in the list.

**Definition of Done:**

- Component tests verify picker binding and correct RRULE output for all preset options.
- E2E test creates a recurring reminder via the UI picker (no voice) and verifies it re-triggers correctly.
- I18n strings for picker labels provided in EN and RU.

**Dependencies:** E10-04, E13-01
**Complexity:** Medium

---

## Epic E14 - Desktop Auto-Start

### E14-01 Desktop Auto-Start on Login

**Context:** Users want the reminder app to start automatically when they log in to their computer so they never miss a reminder due to forgetting to open the app.

**TDD Plan:**

- Red: The app does not appear in the OS login items by default; no setting is available to enable this.
- Green: Use Electron's `app.setLoginItemSettings({ openAtLogin: true })` API, toggled by a new boolean in the settings store. Add a corresponding toggle in `SettingsView.vue`.
- Refactor: Persist the preference using `ElectronSettingsAdapter`. On app launch, read the stored preference and call `setLoginItemSettings` accordingly.

**Acceptance Criteria:**

- A toggle "Start on login" appears in the desktop Settings page (hidden on mobile/Android).
- Enabling the toggle adds the app to OS login items; disabling removes it.
- The setting persists across app restarts.
- No auto-start interaction occurs on Capacitor/mobile builds.

**Definition of Done:**

- Unit tests mock `app.setLoginItemSettings` and verify it is called with the correct argument when the toggle changes.
- Manual verification on macOS confirms the app launches at login when the setting is enabled.

**Dependencies:** E9-02
**Complexity:** Small

---

## Epic E15 - Enhanced Notifications

### E15-01 Notification Action Buttons (Snooze / Dismiss)

**Context:** When a reminder notification fires, users want to quickly snooze it (postpone by 15 min, 1 h, or 1 day) or dismiss it directly from the notification, without having to open the app. This applies to non-recurring reminders for now.

**TDD Plan:**

- Red: Notification fires but has no action buttons; the only way to interact is to open the app.
- Green: Add action buttons to Electron notifications (`Notification` API with `actions`) for "Snooze 15 min", "Snooze 1 h", "Snooze 1 day", and "Dismiss". Handle the `action` IPC/event callback to either reschedule or mark the reminder.
- Refactor: On Android, use `@capacitor/local-notifications` notification actions for the same set of snooze options. Route the action back through the Capacitor bridge to the shared scheduler service.

**Acceptance Criteria:**

- Notification for a non-recurring reminder shows at least "Snooze 15 min" and "Dismiss" action buttons on both Electron and Android.
- Selecting a snooze option reschedules the reminder by the chosen duration and updates the DB.
- Selecting "Dismiss" marks the reminder as sent/completed.
- Recurring reminders are excluded from snooze actions in this sprint (future work).

**Definition of Done:**

- Unit tests verify the snooze reschedule logic for each duration option.
- Manual end-to-end test on both Electron and Android confirms buttons appear and produce correct state changes.

**Dependencies:** E10-05, E9-05
**Complexity:** Medium

---

### E15-02 Missed Reminders Tray Badge and Navigation

**Context:** If the user misses notifications (app backgrounded, notifications muted), they have no visual cue that reminders were missed. A tray badge with a count and a direct link to the sent/history list will surface missed reminders without intrusiveness.

**TDD Plan:**

- Red: No tray icon badge is shown when reminders remain un-acknowledged past their scheduled time; the "sent" list is not highlighted.
- Green: On Electron, after each scheduler tick, calculate the number of reminders whose `scheduledAt` is in the past and status is not acknowledged. Set the tray icon badge count (`app.setBadgeCount` on macOS; overlay icon on Windows). Show a tray notification summary "You have N missed reminders" with a click handler that opens the sent/history tab.
- Refactor: On Android, emit a summary notification to the notification shade with the missed count; tapping it navigates to the sent list via deep-link intent.

**Acceptance Criteria:**

- A tray badge / OS badge displays the number of missed (past-due, un-acknowledged) reminders.
- Clicking the tray badge notification opens the app and navigates directly to the sent/history list.
- The badge clears once the user visits the sent list.
- Badge count updates in real time as new reminders are missed or acknowledged.

**Definition of Done:**

- Unit tests mock the scheduler's missed-reminder count computation and assert the correct badge value.
- Manual verification on macOS (badge in Dock/tray) and Android (notification shade) confirms the feature.

**Dependencies:** E10-05, E15-01
**Complexity:** Medium

---

## Epic E16 - Encrypted Cloud Sync

### E16-01 Cloud Sync Backend and Encrypted DB Provisioning

**Context:** Users want their reminders to sync across devices without creating an account. The system must auto-provision an encrypted cloud database keyed to an anonymous random user ID generated on first use.

**TDD Plan:**

- Red: No cloud sync option is available; reminders exist only on the local device.
- Green: Add a "Cloud Sync" toggle to Settings. On first enable, the client calls the backend to provision a new encrypted DB keyed to a UUID stored locally. The backend response includes the UUID and an encryption key (stored securely on-device, never sent again).
- Refactor: Implement the backend as a lightweight service (e.g., Node/Express or serverless function) with a CouchDB/PouchDB or Supabase/PostgreSQL store. Ensure all data is encrypted client-side before transmission (e.g., using `libsodium`).

**Acceptance Criteria:**

- Enabling Cloud Sync creates a unique anonymous identity and provisions the cloud DB without requiring login or email.
- The encryption key is generated client-side and stored in the OS keychain / Capacitor SecureStorage.
- No plaintext reminder data is ever transmitted to or stored on the backend.
- The toggle and UUID are persisted; toggling off pauses sync but retains the cloud data.

**Definition of Done:**

- Unit tests cover UUID generation, key derivation, and the encrypt/decrypt round trip.
- Integration test provisions a test cloud DB and verifies encrypted blobs are stored.
- Security review confirms no PII or plaintext reminder data leaves the device.

**Dependencies:** E9-02, E10-01
**Complexity:** Large

---

### E16-02 QR-Code Device Pairing

**Context:** After enabling Cloud Sync on the primary device, users need a frictionless way to pair additional devices (e.g., Android phone to desktop) without typing long keys or IDs.

**TDD Plan:**

- Red: The secondary device has no way to connect to the cloud DB provisioned on the primary device.
- Green: On the primary device, generate a QR code encoding the `{ userId, encryptionKey }` payload and display it in Settings. On the secondary device, provide a "Scan to pair" option that reads the QR code and stores the credentials locally.
- Refactor: After scanning, the secondary device immediately triggers an initial sync pull. Invalidate / regenerate the QR code after 5 minutes for security.

**Acceptance Criteria:**

- Settings page shows a "Pair New Device" button when Cloud Sync is enabled.
- Tapping it displays a QR code valid for 5 minutes.
- Scanning the QR code on the secondary device completes pairing and initiates the first sync.
- Expired or already-used QR codes are rejected.

**Definition of Done:**

- Component test verifies QR code is regenerated after the expiry timer.
- Manual end-to-end test pairs an Android device to the Electron desktop app and confirms reminders appear on both.

**Dependencies:** E16-01
**Complexity:** Medium

---

### E16-03 Periodic Sync and Conflict Resolution

**Context:** Once paired, each device must sync with the cloud DB approximately every minute. The sync must be transactional and robust against race conditions (e.g., editing the same reminder on two devices simultaneously) to prevent data loss.

**TDD Plan:**

- Red: Concurrent writes from two devices result in one device's changes being silently overwritten.
- Green: Implement a last-write-wins strategy using vector clocks or revision tokens per reminder. Each sync cycle fetches the remote diff, merges non-conflicting changes, and surfaces conflicts to the user for manual resolution if needed.
- Refactor: Extract sync logic into a standalone `SyncService` class testable in isolation. Ensure the 1-minute polling interval is backgrounded and does not block the UI thread.

**Acceptance Criteria:**

- Reminders created on Device A appear on Device B within ~1 minute and vice versa.
- Editing the same reminder on two offline devices and then syncing does not silently discard either version — at minimum, last-write-wins resolves the conflict deterministically.
- Sync failures (network errors, backend downtime) are handled gracefully: the app continues working offline and retries on next cycle.
- All synced data remains encrypted end-to-end.

**Definition of Done:**

- Unit tests simulate concurrent edits and verify conflict resolution produces a deterministic, non-data-loss outcome.
- Integration test verifies a full create → sync → read cycle across two simulated clients.
- Manual end-to-end test with Electron + Android confirms bi-directional sync within the target cadence.

**Dependencies:** E16-02, E10-05
**Complexity:** Large
