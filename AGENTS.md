# AGENTS.md

The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

## Local Issue Tracking

- Use a repo-local Markdown tracker:
  - [Sprint7.md](Sprint7.md) = current sprint only. Mark ticket as completed after it has been implemented and tested.
  - [WORKLOG.md](WORKLOG.md) = issues saved for later. Add anything that was deferred from the current sprint there.

## Use up-to-date docs

- Use [context7] MCP to check up-to-date docs when needed when implementing new libraries or frameworks, or adding features using them.

## Suggested Test Stack

- Unit/component/integration: `Vitest` + `@vue/test-utils`
- E2E UI flows: `Playwright`
- Electron-level orchestration tests: Node test runner or Vitest integration suite
- API contract mocking: `MSW` or lightweight fetch mocking

## Definition of Done (per ticket)

- Tests passing.
- Lint + typecheck pass.

## Development rules

Strictly avoid using `any` in tests or implementation (e.g., use `unknown` or define proper mock types) to prevent `@typescript-eslint/no-explicit-any` linter errors.

## Parser gotchas

- `chrono-node` can miss or misread spoken times with number words (for example, EN `at six pm`, RU `в шесть вечера`). Keep locale-specific normalization in local parser preprocessors (`enTimeNormalizer` / `ruTimeNormalizer`) and add tests when expanding phrase coverage.

## Store/Test gotchas

- `useReminderStore().initialize()` is guarded by a module-level `isInitialized` flag. In Vitest, that flag persists across tests unless modules are reloaded, so callback-registration tests can become order-dependent.

## Electron scheduler gotchas

- Never schedule non-`pending` reminders (`sent`/`cancelled`/`dismissed`) in the main-process scheduler. If `sent` records are scheduled, they can be re-triggered and accidentally generate extra recurring occurrences.
