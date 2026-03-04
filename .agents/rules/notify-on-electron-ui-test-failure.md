---
trigger: always_on
description: When you encounter a failing UI test in the Electron application using Playwright
---

When you encounter a failing test in the Electron application:

1.  **Stop immediately.** **Do not Attempt to re-run the test**
2.  **Identify the specific failure.** Analyze the Playwright logs, screenshots, or traces to understand what went wrong (e.g., a missing element, timeout, or unexpected UI state).
3.  **Notify the user.** Use the `notify_user` tool to inform the user about the failure. Provide:
    - The name of the failing test case.
    - A brief summary of the failure.
    - Any relevant context found during the initial investigation (e.g., "The modal did not appear within 5 seconds").
4.  **Wait for instructions.** Do not attempt to fix the issue or proceed with further tests until the user has acknowledged the failure or provided specific instructions on how to proceed.
