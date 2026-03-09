## Sprint 6

6-1. [x] Clear tombstoned reminders from the cloud periodically
6-2. [ ] Fix bug: When an single occurrence of a recurring reminder is cancelled and reminder is advanced, treat this as an edit and sync to cloud (Currently, such reminder’s next occurrence is not synced)
6-3. [ ] Fix "every N days" reminder creation: If start time is in the future of the current day, create for the current day instead of shifting 1 day forward
6-4. [ ] Fix Russian NLP: Reminder text "Ходить на прогулку каждый день в 11 вечера" should result in reminder name "ходить на прогулку", not "ходить на прогулку в 11 вечера". English works fine already
6-5. [ ] Fix live UI update: Update missed reminders count on Sent tab when app is in foreground. Currently, only tray/dock badge is updated, but not the number on Sent tab
6-6. [ ] Android sync fix: On Android, when device is paired to another one via cloud sync and 2nd device uses Clear Old Reminders, UI on the Android device still shows old reminders in Sent even after sync
6-7. [ ] Fix bug: Editing a reminder on Sent and Cancelled screens does not make the reminder active.
6-8. [ ] Time format consistency: Add an option of 12h / 24h, make sure it is followed everywhere. On first setting init, if device lang is En > 12h, if Ru > 24 h
6-9. [ ] Fix android build on Github
