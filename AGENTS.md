# AGENTS.md

The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

## Local Issue Tracking

- Use a repo-local Markdown tracker:
  - [Sprint6.md](Sprint6.md) = current sprint only. Mark ticket as completed after it has been implemented and tested.
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
