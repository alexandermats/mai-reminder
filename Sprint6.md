## Sprint 6

6-1. [ ] Clear tombstoned reminders from the cloud periodically
6-2. [ ] Fix bug: When an single occurrence of a recurring reminder is cancelled and reminder is advanced, treat this as an edit and sync to cloud (Currently, such reminder’s next occurrence is restored from the cloud on next sync)
6-3. [ ] Fix "every N days" reminder creation: If start time is in the future of the current day, create for the current day instead of shifting 1 day forward
6-4. [ ] Fix Russian NLP: "Ходить на прогулку каждый день в 11 вечера" should result in name "ходить на прогулку", not "ходить на прогулку в 11 вечера". English works fine already
6-5. [ ] Live UI update: Update missed reminders count on Sent tab when app is in foreground
6-6. [ ] Android sync fix: On Android, when device is paired to another one via cloud sync and 2nd device uses Clear Old Reminders, UI on the Android device still shows old reminders in Sent even after sync
6-7. [ ] Fix bug: Editing a reminder on Sent and Cancelled screens does not make the reminder active.
