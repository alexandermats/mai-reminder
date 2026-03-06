---
description: Automatically releases a new version by updating version numbers and pushing a git tag.
---

Follow these steps to release a new version. This workflow updates `package.json` and `src/views/SettingsPage.vue`, then commits and tags the release.

### 1. Identify Target Version

- Read the current version from `package.json`.
- If the user specified a version, use it as `<NEW_VERSION>`.
- If no version was specified, bump the **minor** version:
  - Example: `0.3.6` becomes `0.3.7`.
  - Update any internal variables accordingly.

### 2. Update Version Numbers

- Modify `package.json`: Update the `"version"` field to `<NEW_VERSION>`.
- Modify `src/views/SettingsPage.vue`: Find the version string (e.g., `<p>0.3.6</p>`) and update it to `<p><NEW_VERSION></p>`.

### 3. Sync Lockfile

// turbo

- Run `npm install` to ensure `package-lock.json` is updated with the new version.

### 4. Create Release Commit and Tag

// turbo

- Run `git add package.json package-lock.json src/views/SettingsPage.vue`
- Run `git commit -m "chore: release v<NEW_VERSION>"`
- Run `git tag v<NEW_VERSION>`

### 5. Push to GitHub

// turbo

- Run `git push origin main`
- Run `git push origin v<NEW_VERSION>`

### 6. Verification

- Confirm with the user that the push was successful.
- Remind the user to check the **Actions** tab on GitHub for the `Build Release` workflow progress.
