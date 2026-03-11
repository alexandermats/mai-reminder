# Known Issues - Mai Reminder

The following issues are known and may be addressed in future:

## 🤖 AI Parsing

- **Not implemented properly yet** - AI parsing is not implemented yet. It will be implemented in the future.

- **API Key**: The Cerebras API key is required for AI parsing. Get one for free at [Cerebras](https://cloud.cerebras.ai/).

## 📦 Distribution

- **Unsigned Binaries**: macOS and Windows binaries are currently unsigned for MVP, requiring manual override during installation (e.g., Gatekeeper on macOS).
  On macOS, run:

```bash
xattr -cr "/Applications/Mai Reminder.app"
```

## 🔔 Notifications on macOS

By default, macOS notifications appear as "Banners", which disappear automatically after about 5-10 seconds regardless of what the app requests. To make them stay longer on macOS, change the app's notification style in System Settings:
Open System Settings > Notifications
Find 'Mai Reminder' (or 'Electron' if running in dev mode)
Change the alert style from "Temporary" to "Persistent" ("Banners" to "Alerts" in older macOS versions)

## ☁️ Cloud Sync

**Recurring reminders in different timezones**
Recurring reminders may not work properly when synced between devices in different timezones.

- **Offline Deletions Not Synced**: If reminders are deleted (via **Clear Old Reminders**) while the device is offline, or while **Cloud Sync is disabled**, those deletions will not be propagated to the cloud. When sync resumes, the cloud copy of the deleted reminder may be pulled back locally.
