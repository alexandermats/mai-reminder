# Known Issues - Mai Reminder

The following issues are known and may be addressed in future:

## 🤖 AI Parsing

- **API Key**: The Cerebras API key is required for AI parsing. Get one for free at [Cerebras](https://cloud.cerebras.ai/).

- **Outage Fallback**: While the app gracefully falls back to a local parser, the UI toast notification might persist until dismissed manually.

## 📦 Distribution

- **Unsigned Binaries**: macOS and Windows binaries are currently unsigned for MVP, requiring manual override during installation (e.g., Gatekeeper on macOS).

```bash
xattr -cr "/Applications/Mai Reminder.app"
```

## 🔔 Notifications

By default, macOS notifications appear as "Banners", which disappear automatically after about 5-10 seconds regardless of what the app requests.
The only way to make them stay longer on macOS is to change the app's notification style in System Settings:
Open System Settings > Notifications
Find 'Mai Reminder' (or 'Electron' if running in dev mode)
Change the alert style from "Temporary" to "Persistent" ( "Banners" to "Alerts" in older macOS versions)

## ☁️ Cloud Sync

- **Offline Deletions Not Synced**: If reminders are deleted (via **Clear Old Reminders** or individual delete) while the device is offline, or while **Cloud Sync is disabled**, those deletions will not be propagated to the cloud. When sync resumes, the cloud copy of the deleted reminder may be pulled back locally. As a workaround, ensure you are online and Cloud Sync is enabled before clearing reminders.
