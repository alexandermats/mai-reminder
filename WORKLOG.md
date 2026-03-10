3. One Small Professional Tip
   In your onVoicePartial and onVoiceFinal listeners, you are using ipcRenderer.on. In Electron, these listeners persist. If your Vue component unmounts and remounts (like switching pages), you might accidentally register the same listener multiple times, leading to "ghost" transcripts appearing twice.

Your removeVoiceListeners function helps, but an even cleaner way to handle this in the preload is to return a "cleanup" function directly.

You don't need to change it now if it's working, but keep this pattern in mind for the future:

TypeScript
// Example of a self-cleaning listener pattern
onVoicePartial: (callback: (text: string) => void) => {
const subscription = (\_: any, text: string) => callback(text);
ipcRenderer.on('voice-partial', subscription);

// Return a function that the Vue component can call to "unsubscribe"
return () => {
ipcRenderer.removeListener('voice-partial', subscription);
};
},

4. The setInterval solution creates multiple timers if the page is crammed with reminders (one for every row). If the user builds a significantly huge lists (300+ items), we could investigate global ticking state across components over Pinia. But for the MVP phase, this is perfectly within the performance limits

5. - **Timezone edge cases**: Filtering relies on `toDateString()`, which might show minor discrepancies if the system timezone changes during a session.

6. **Important Fixes and Code Quality Improvements**
   Robust Error Handling in Voice Processing: The voice-to-text logic in electron/voice.ts should include more granular error handling for missing models or corrupted audio files to prevent the main process from hanging during transcription.

Database Transaction Safety: Ensure that complex operations in src/db/reminderRepository.ts, especially those involving multiple table updates or bulk deletions, are wrapped in explicit transactions to maintain data integrity.

Notification Reliability: The src/electron/scheduler.ts should implement a persistence check upon application startup. If the app was closed during a scheduled reminder time, it should immediately trigger missed notifications.

Input Validation in Orchestrator: Add stricter validation in src/parser/orchestrator.ts to handle cases where the voice-to-text output might be empty or contains only noise, preventing the creation of "empty" reminders.

Type Safety Across IPC Boundaries: Standardize the interfaces used for Inter-Process Communication (IPC) between electron/main.ts and the frontend to ensure that data types remain consistent and easy to refactor.

7. enable invisible CAPTCHA or Cloudflare Turnstile to prevent abuse for anonymous sign-ins.

8. **Android: True Per-Notification DnD Bypass via `CATEGORY_ALARM`**

   **Context**: `@capacitor/local-notifications` does not expose `NotificationCompat.Builder.setCategory()`, so there is no way to mark a notification as `CATEGORY_ALARM` through the standard JS API. Android treats alarm-category notifications as a special class that bypasses DnD by default (users have "Allow alarms" on in DnD settings), without requiring the app to be on the whole-app allow-list.

   **What would need to be built**:
   1. **A custom Capacitor Android plugin** (`android/app/src/main/java/.../PriorityNotificationPlugin.kt`):
      - Implement a `schedulePriorityNotification(call: PluginCall)` method.
      - Use `NotificationCompat.Builder` with `.setCategory(NotificationCompat.CATEGORY_ALARM)`.
      - Set channel importance to `NotificationManager.IMPORTANCE_HIGH` on a dedicated `alarm-reminders` channel.
      - Handle exact alarm scheduling via `AlarmManager.setExact()` / `setExactAndAllowWhileIdle()`.
      - Register with `@CapacitorPlugin(name = "PriorityNotification")` and add to `MainActivity.java`.

   2. **A TypeScript bridge** (`src/services/priorityNotificationPlugin.ts`):
      - Wrap the native plugin with a typed interface: `schedulePriorityNotification(options)`, `cancelPriorityNotification(id)`.
      - Fall back to standard `@capacitor/local-notifications` on non-Android platforms.

   3. **Update `CapacitorNotificationAdapter`**:
      - Call the custom plugin for `reminder.priority === true`, standard plugin otherwise.

   4. **Permissions**: Add `USE_EXACT_ALARM` (Android 13+) or `SCHEDULE_EXACT_ALARM` (Android 12) to `AndroidManifest.xml`. Prompt the user to grant it if needed (same pattern as the existing exact alarm prompt).

   **Key trade-off**: This bypasses DnD only for priority reminders (good), but alarm-category notifications cannot be silenced by the user through the DnD "exceptions" screen — they always ring. Communicate this clearly in settings UI copy.
